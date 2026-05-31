import { BATCH_STEPS, SOURCE_MAP } from "./batch-config.mjs";
import { insertBatchRun, insertBatchStep } from "./batch-log.mjs";
import { collectDartDisclosureEvents } from "./collectors/dart.mjs";
import { collectEcosFactors } from "./collectors/ecos.mjs";
import { collectFredFactors } from "./collectors/fred.mjs";
import { collectMarketFactors, collectStockDailySnapshot, collectStockMaster } from "./collectors/krx.mjs";
import { closePool, withClient } from "./lib/db.mjs";
import { getIndustryClassificationStatus } from "./repositories/industry-classification.mjs";
import { getEnv } from "./lib/env.mjs";
import { writeArtifact } from "./lib/files.mjs";
import { sleep } from "./lib/http.mjs";
import {
  rebuildStockDisclosureDaily,
  upsertDartCorpCodeRows,
  upsertDartDisclosureEventRows,
} from "./repositories/dart-disclosure.mjs";
import {
  upsertMarketDailyFactors,
  upsertStockDailySnapshotRows,
  upsertStockMasterRows,
} from "./repositories/market-daily-factors.mjs";
import {
  getActiveModels,
  getLatestPredictionFeatureRows,
  rebuildFeatureAndTargetTables,
  rebuildSectorDailySnapshot,
  refreshPredictionEvaluations,
  replaceSectorPredictions,
  replaceStockPredictions,
} from "./repositories/prediction-pipeline.mjs";
import { predictProbability } from "./lib/logistic-regression.mjs";

const STOCK_PREDICTION_TOP_SECTOR_COUNT = 5;

function parseArgs(argv) {
  const args = {
    mode: "daily",
    date: new Date().toISOString().slice(0, 10),
    from: null,
    to: null,
  };
  const positionalDates = [];

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];

    if (!raw.startsWith("--")) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        positionalDates.push(raw);
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

  if (args.mode === "backfill" && (!args.from || !args.to) && positionalDates.length >= 2) {
    args.from ??= positionalDates[0];
    args.to ??= positionalDates[1];
  }

  return args;
}

function isWeekend(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

const CRITICAL_EMPTY_STEPS = new Set([
  "sync_stock_master",
  "load_market_daily_factors",
  "load_stock_daily_snapshot",
]);

function targetRecoveredFromEmpty(target) {
  return target.steps.some((step) =>
    (step.step_name === "build_feature_target_daily" || step.step_name === "run_prediction_models") &&
    step.status === "completed"
  );
}

function targetDeferredDerivedSteps(target) {
  return target.steps.some((step) =>
    (step.step_name === "build_feature_target_daily" || step.step_name === "run_prediction_models") &&
    step.status === "skipped" &&
    step.notes === "Deferred until the final backfill date to avoid rebuilding derived tables repeatedly."
  );
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
    notes: `${tradeDate} ??????? ${step.description}`,
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

async function maybePersistDartDisclosure(result) {
  if (!getEnv("DATABASE_URL") || !result) {
    return false;
  }

  await withClient(async (client) => {
    await upsertDartCorpCodeRows(client, result.corpRows ?? []);
    await upsertDartDisclosureEventRows(client, result.rows ?? []);
  });

  return true;
}

function targetHasCriticalEmptyStep(target) {
  return target.steps.some((step) => CRITICAL_EMPTY_STEPS.has(step.step_name) && step.status === "empty");
}

function determineTargetStatus(target) {
  if (target.skipped) {
    return "skipped";
  }

  if (target.steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (target.steps.some((step) => step.status === "blocked")) {
    return "blocked";
  }

  if (targetHasCriticalEmptyStep(target)) {
    if (targetDeferredDerivedSteps(target)) {
      return "warning";
    }

    return targetRecoveredFromEmpty(target) ? "warning" : "failed";
  }

  if (target.steps.some((step) => step.status === "warning")) {
    return "warning";
  }

  return "completed";
}

function summarizeTargetStatuses(targets) {
  const counts = new Map();
  for (const target of targets) {
    const status = determineTargetStatus(target);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
}

async function buildQualityCheckResult() {
  if (!getEnv("DATABASE_URL")) {
    return {
      status: "planned",
      notes: "Quality checks skipped because DATABASE_URL is missing.",
    };
  }

  const status = await withClient((client) => getIndustryClassificationStatus(client, 30));
  const warnings = [];

  if (status.isStale) {
    warnings.push(`industry classification is stale or empty; last update: ${status.lastCollectedAt ? status.lastCollectedAt.toISOString() : "never"}`);
  }

  if (status.hasMissing) {
    warnings.push(`${status.missingCount} stock_master rows are missing current industry classification`);
  }

  return {
    status: warnings.length > 0 ? "warning" : "completed",
    notes: warnings.length > 0
      ? `WARNING: ${warnings.join(" | ")}`
      : `Industry classification freshness OK. rows=${status.classificationCount}, age_days=${status.ageDays}`,
  };
}

function rankPredictionRows(rows) {
  return rows
    .sort((left, right) => right.probability - left.probability)
    .map((row, index) => ({
      ...row,
      score: row.probability,
      rank: index + 1,
    }));
}

async function buildSectorSnapshotResult() {
  if (!getEnv("DATABASE_URL")) {
    return {
      status: "planned",
      notes: "Sector snapshot build skipped because DATABASE_URL is missing.",
    };
  }

  await withClient(async (client) => {
    await rebuildSectorDailySnapshot(client);
  });

  return {
    status: "completed",
    notes: "sector_daily_snapshot rebuilt from stock_daily_snapshot and stock_industry_classification.",
  };
}

async function buildFeatureTargetResult() {
  if (!getEnv("DATABASE_URL")) {
    return {
      status: "planned",
      notes: "Feature/target build skipped because DATABASE_URL is missing.",
    };
  }

  await withClient(async (client) => {
    await rebuildFeatureAndTargetTables(client);
  });

  return {
    status: "completed",
    notes: "sector/stock feature and target tables rebuilt.",
  };
}

async function buildStockDisclosureDailyResult() {
  if (!getEnv("DATABASE_URL")) {
    return {
      status: "planned",
      notes: "Stock disclosure daily build skipped because DATABASE_URL is missing.",
    };
  }

  await withClient(async (client) => {
    await rebuildStockDisclosureDaily(client);
  });

  return {
    status: "completed",
    notes: "stock_disclosure_daily rebuilt from dart_disclosure_event.",
  };
}

async function runPredictionModelsResult() {
  if (!getEnv("DATABASE_URL")) {
    return {
      status: "planned",
      notes: "Prediction run skipped because DATABASE_URL is missing.",
    };
  }

  return withClient(async (client) => {
    const models = await getActiveModels(client);
    if (models.length === 0) {
      return {
        status: "planned",
        notes: "No active models found. Run npm run model:train first.",
      };
    }

    const summaries = [];
    const sectorModelRow = models.find((row) => row.model_type === "sector");
    const stockModelRow = models.find((row) => row.model_type === "stock");
    let selectedSectorCodes = [];

    if (sectorModelRow) {
      const metadata = sectorModelRow.metadata ?? {};
      if (!metadata.model) {
        summaries.push("sector: skipped (missing model metadata)");
      } else {
        const featureRows = await getLatestPredictionFeatureRows(client, "sector");
        if (featureRows.length === 0) {
          summaries.push("sector: skipped (no feature rows)");
        } else {
          const predictionDate = featureRows[0].trade_date;
          const ranked = rankPredictionRows(featureRows.map((row) => ({
            sector_code: row.sector_code,
            sector_name: row.sector_name,
            probability: predictProbability(metadata.model, row),
          })));
          selectedSectorCodes = ranked.slice(0, STOCK_PREDICTION_TOP_SECTOR_COUNT).map((row) => row.sector_code);
          await replaceSectorPredictions(client, predictionDate, sectorModelRow.model_version, ranked);
          summaries.push(`sector: ${ranked.length} rows for ${predictionDate} | selected sectors: ${selectedSectorCodes.length}`);
        }
      }
    }

    if (stockModelRow) {
      const metadata = stockModelRow.metadata ?? {};
      if (!metadata.model) {
        summaries.push("stock: skipped (missing model metadata)");
      } else if (selectedSectorCodes.length === 0) {
        summaries.push("stock: skipped (no selected sectors)");
      } else {
        const featureRows = await getLatestPredictionFeatureRows(client, "stock", { sectorCodes: selectedSectorCodes });
        if (featureRows.length === 0) {
          summaries.push("stock: skipped (no feature rows inside selected sectors)");
        } else {
          const predictionDate = featureRows[0].trade_date;
          const ranked = rankPredictionRows(featureRows.map((row) => ({
            ticker: row.ticker,
            sector_code: row.sector_code,
            sector_name: row.sector_name,
            probability: predictProbability(metadata.model, row),
          })));
          await replaceStockPredictions(client, predictionDate, stockModelRow.model_version, ranked);
          summaries.push(`stock: ${ranked.length} rows for ${predictionDate} | sector filtered`);
        }
      }
    }

    await refreshPredictionEvaluations(client);

    return {
      status: "completed",
      notes: summaries.join(" | "),
    };
  });
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
      const results = await Promise.allSettled([
        collectMarketFactors(tradeDate),
        collectEcosFactors(tradeDate),
        collectFredFactors(tradeDate),
      ]);
      const krx = settledCollectorResult(results[0], "collectMarketFactors");
      const ecos = settledCollectorResult(results[1], "collectEcosFactors");
      const fred = settledCollectorResult(results[2], "collectFredFactors");
      const mergedRow = mergeRows(krx.row, ecos.row, fred.row);
      const persisted = krx.status === "completed" ? await maybePersistMarketFactors(mergedRow) : false;
      const statuses = [krx.status, ecos.status, fred.status];
      const status = statuses.includes("completed")
        ? krx.status === "completed"
          ? "completed"
          : "empty"
        : statuses.includes("failed")
          ? "failed"
          : statuses.includes("blocked")
            ? "blocked"
            : "planned";
      return {
        status,
        notes: [
          krx.detail,
          ecos.detail,
          fred.detail,
          persisted
            ? "market_daily_factors upserted."
            : krx.status === "completed"
              ? "DB upsert skipped."
              : "DB upsert skipped because KRX market data was empty.",
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
    case "load_dart_disclosure_events": {
      const result = await collectDartDisclosureEvents(tradeDate);
      const persisted = await maybePersistDartDisclosure(result);
      return {
        status: result.status,
        notes: `${result.detail} | ${persisted ? "dart disclosure rows upserted." : "DB upsert skipped."}`,
      };
    }
    case "build_stock_disclosure_daily":
      return buildStockDisclosureDailyResult();
    case "build_sector_daily_snapshot":
      return buildSectorSnapshotResult();
    case "build_feature_target_daily":
      return buildFeatureTargetResult();
    case "run_prediction_models":
      return runPredictionModelsResult();
    case "run_quality_checks":
      return buildQualityCheckResult();
    default:
      throw new Error(`Unknown batch step: ${stepName}`);
  }
}

function normalizeStepError(error) {
  return error instanceof Error ? error.message : String(error);
}

function settledCollectorResult(result, fallbackCollector) {
  if (result.status === 'fulfilled') {
    return result.value;
  }

  return {
    collector: fallbackCollector,
    status: 'failed',
    detail: normalizeStepError(result.reason),
    row: null,
    rows: [],
  };
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
      const status = determineTargetStatus(target);
      await insertBatchRun(client, {
        run_id: runId,
        mode: payload.mode,
        trade_date: target.trade_date,
        started_at: startedAt,
        finished_at: finishedAt,
        status,
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
  const derivedSteps = new Set(["build_stock_disclosure_daily", "build_sector_daily_snapshot", "build_feature_target_daily", "run_prediction_models"]);
  const requestPaceMs = Number(getEnv("BATCH_TARGET_DELAY_MS", "250"));

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
  const finalExecutableTradeDate = [...payload.targets].reverse().find((target) => !target.skipped)?.trade_date ?? null;

  for (const target of payload.targets) {
    if (target.skipped) {
      continue;
    }

    for (const step of target.steps) {
      if (
        args.mode === "backfill" &&
        derivedSteps.has(step.step_name) &&
        target.trade_date !== finalExecutableTradeDate
      ) {
        step.status = "skipped";
        step.notes = "Deferred until the final backfill date to avoid rebuilding derived tables repeatedly.";
        continue;
      }

      step.started_at = new Date().toISOString();
      try {
        const result = await executeStep(step.step_name, target.trade_date);
        step.status = result.status;
        step.notes = result.notes;
      } catch (error) {
        step.status = "failed";
        step.notes = normalizeStepError(error);
      }
      step.finished_at = new Date().toISOString();
    }

    if (requestPaceMs > 0 && target !== payload.targets.at(-1)) {
      await sleep(requestPaceMs);
    }
  }

  const outputPath = await persistPlan(runId, payload);
  const dbPersisted = await persistRunToDb(payload);
  const statusSummary = summarizeTargetStatuses(payload.targets);
  const hasBlockingIssue = payload.targets.some((target) => {
    const status = determineTargetStatus(target);
    return status === "failed" || status === "blocked";
  });

  console.log(`Batch plan created: ${runId}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Targets: ${targets.length}`);
  console.log(`Plan file: ${outputPath}`);
  console.log(`DB logging: ${dbPersisted ? "enabled" : "skipped (DATABASE_URL missing)"}`);
  console.log(`Target status summary: ${statusSummary}`);
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

  if (hasBlockingIssue) {
    process.exitCode = 1;
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
