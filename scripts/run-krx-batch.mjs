import { BATCH_STEPS, SOURCE_MAP } from "./batch-config.mjs";
import { insertBatchRun, insertBatchStep } from "./batch-log.mjs";
import { collectEcosFactors } from "./collectors/ecos.mjs";
import { collectFredFactors } from "./collectors/fred.mjs";
import { collectMarketFactors, collectStockDailySnapshot, collectStockMaster } from "./collectors/krx.mjs";
import { closePool, withClient } from "./lib/db.mjs";
import { getEnv } from "./lib/env.mjs";
import { writeArtifact } from "./lib/files.mjs";
import {
  upsertMarketDailyFactors,
  upsertStockDailySnapshotRows,
  upsertStockMasterRows,
} from "./repositories/market-daily-factors.mjs";

function parseArgs(argv) {
  const args = {
    mode: "daily",
    date: new Date().toISOString().slice(0, 10),
    from: null,
    to: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];

    if (!raw.startsWith("--")) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        args.date = raw;
      }
      continue;
    }

    const withoutPrefix = raw.slice(2);
    if (withoutPrefix.includes("=")) {
      const [key, value] = withoutPrefix.split("=");
      if (key in args && value) {
        args[key] = value;
      }
      continue;
    }

    const key = withoutPrefix;
    const next = argv[index + 1];
    if (key in args && next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    }
  }

  return args;
}

function isWeekend(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function enumerateDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00+09:00`);
  const end = new Date(`${to}T00:00:00+09:00`);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function buildRunTargets(args) {
  if (args.mode === "backfill") {
    if (!args.from || !args.to) {
      throw new Error("Backfill mode requires --from=YYYY-MM-DD and --to=YYYY-MM-DD.");
    }

    return enumerateDates(args.from, args.to);
  }

  return [args.date];
}

function createStepLog(step, order, tradeDate) {
  return {
    step_name: step.name,
    step_order: order,
    status: "planned",
    started_at: null,
    finished_at: null,
    notes: `${tradeDate} 기준 ${step.description}`,
    output: step.output,
  };
}

function mergeRows(...rows) {
  return rows.reduce((accumulator, row) => {
    if (!row) {
      return accumulator;
    }

    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined) {
        accumulator[key] = value;
      }
    }

    return accumulator;
  }, {});
}

async function maybePersistMarketFactors(row) {
  if (!getEnv("DATABASE_URL") || !row || Object.keys(row).length === 0) {
    return false;
  }

  await withClient(async (client) => {
    await upsertMarketDailyFactors(client, row);
  });

  return true;
}

async function maybePersistStockMaster(rows) {
  if (!getEnv("DATABASE_URL") || !rows || rows.length === 0) {
    return false;
  }

  await withClient(async (client) => {
    await upsertStockMasterRows(client, rows);
  });

  return true;
}

async function maybePersistStockDaily(rows) {
  if (!getEnv("DATABASE_URL") || !rows || rows.length === 0) {
    return false;
  }

  await withClient(async (client) => {
    await upsertStockDailySnapshotRows(client, rows);
  });

  return true;
}

async function executeStep(stepName, tradeDate) {
  switch (stepName) {
    case "validate_trade_date":
      return {
        status: isWeekend(tradeDate) ? "skipped" : "completed",
        notes: isWeekend(tradeDate)
          ? "Weekend only. KRX holiday calendar integration is still pending."
          : "Trade date passed basic validation.",
      };
    case "sync_stock_master": {
      const result = await collectStockMaster(tradeDate);
      const persisted = await maybePersistStockMaster(result.rows);
      return {
        status: result.status,
        notes: `${result.detail} | ${persisted ? "stock_master upserted." : "DB upsert skipped."}`,
      };
    }
    case "load_market_daily_factors": {
      const [krx, ecos, fred] = await Promise.all([
        collectMarketFactors(tradeDate),
        collectEcosFactors(tradeDate),
        collectFredFactors(tradeDate),
      ]);
      const mergedRow = mergeRows(krx.row, ecos.row, fred.row);
      const persisted = await maybePersistMarketFactors(mergedRow);
      const statuses = [krx.status, ecos.status, fred.status];
      const status = statuses.includes("completed")
        ? "completed"
        : statuses.includes("blocked")
          ? "blocked"
          : "planned";
      return {
        status,
        notes: [
          krx.detail,
          ecos.detail,
          fred.detail,
          persisted ? "market_daily_factors upserted." : "DB upsert skipped.",
        ].join(" | "),
      };
    }
    case "load_stock_daily_snapshot": {
      const result = await collectStockDailySnapshot(tradeDate);
      const persisted = await maybePersistStockDaily(result.rows);
      return {
        status: result.status,
        notes: `${result.detail} | ${persisted ? "stock_daily_snapshot upserted." : "DB upsert skipped."}`,
      };
    }
    case "build_sector_daily_snapshot":
      return {
        status: "planned",
        notes: "Sector snapshot build is not implemented yet. Use KRX index series plus stock snapshots in the next step.",
      };
    case "run_quality_checks":
      return {
        status: "planned",
        notes: "Quality checks will run after raw tables have been populated.",
      };
    default:
      throw new Error(`Unknown batch step: ${stepName}`);
  }
}

async function persistPlan(runId, payload) {
  return writeArtifact(`${runId}.json`, payload);
}

async function persistRunToDb(payload) {
  if (!getEnv("DATABASE_URL")) {
    return false;
  }

  await withClient(async (client) => {
    for (const target of payload.targets) {
      const runId = `${payload.run_id}-${target.trade_date}`;
      const startedAt = payload.started_at;
      const finishedAt = new Date().toISOString();
      await insertBatchRun(client, {
        run_id: runId,
        mode: payload.mode,
        trade_date: target.trade_date,
        started_at: startedAt,
        finished_at: finishedAt,
        status: target.skipped ? "skipped" : "planned",
        step_count: target.steps.length,
        notes: target.reason,
      });

      for (const step of target.steps) {
        await insertBatchStep(client, runId, {
          ...step,
          started_at: step.started_at ?? startedAt,
          finished_at: step.finished_at ?? finishedAt,
        });
      }
    }
  });

  return true;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const runId = `${args.mode}-${Date.now()}`;
  const targets = buildRunTargets(args);

  const payload = {
    run_id: runId,
    mode: args.mode,
    started_at: new Date().toISOString(),
    sources: SOURCE_MAP,
    targets: targets.map((tradeDate) => ({
      trade_date: tradeDate,
      skipped: isWeekend(tradeDate),
      reason: isWeekend(tradeDate) ? "Weekend only. KRX holiday calendar integration is still pending." : null,
      steps: BATCH_STEPS.map((step, index) => createStepLog(step, index + 1, tradeDate)),
    })),
  };

  for (const target of payload.targets) {
    if (target.skipped) {
      continue;
    }

    for (const step of target.steps) {
      step.started_at = new Date().toISOString();
      const result = await executeStep(step.step_name, target.trade_date);
      step.status = result.status;
      step.notes = result.notes;
      step.finished_at = new Date().toISOString();
    }
  }

  const outputPath = await persistPlan(runId, payload);
  const dbPersisted = await persistRunToDb(payload);

  console.log(`Batch plan created: ${runId}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Targets: ${targets.length}`);
  console.log(`Plan file: ${outputPath}`);
  console.log(`DB logging: ${dbPersisted ? "enabled" : "skipped (DATABASE_URL missing)"}`);
  console.log("");

  for (const target of payload.targets) {
    const prefix = target.skipped ? "[SKIP]" : "[PLAN]";
    console.log(`${prefix} ${target.trade_date}`);
    if (target.reason) {
      console.log(`  reason: ${target.reason}`);
      continue;
    }

    for (const step of target.steps) {
      console.log(`  ${String(step.step_order).padStart(2, "0")}. ${step.step_name} (${step.status})`);
    }
  }
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
