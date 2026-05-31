import { spawn } from "node:child_process";

import { Pool } from "pg";

import { requireEnv } from "./lib/env.mjs";

function getSeoulToday() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

function toDateText(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return getSeoulTodayFromDate(value);
  }

  const text = String(value);
  const matched = text.match(/\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : null;
}

function getSeoulTodayFromDate(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function getLatestStockDate() {
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    max: 1,
  });

  try {
    const result = await pool.query("select max(trade_date) as latest_stock_date from stock_daily_snapshot");
    const value = result.rows[0]?.latest_stock_date;
    return toDateText(value);
  } finally {
    await pool.end();
  }
}

function runNodeScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Command failed: node ${args.join(" ")} (exit ${code ?? "unknown"})`));
    });
  });
}

async function main() {
  requireEnv("DATABASE_URL");

  const today = getSeoulToday();
  const latestStockDate = await getLatestStockDate();
  const fromDate = latestStockDate ? addDays(latestStockDate, 1) : today;

  console.log(`[nightly] today=${today} latestStockDate=${latestStockDate ?? "none"} fromDate=${fromDate}`);

  if (fromDate <= today) {
    await runNodeScript(["scripts/run-krx-batch.mjs", "--mode", "backfill", "--from", fromDate, "--to", today]);
  } else {
    console.log("[nightly] stock data already up to date. Skipping backfill.");
  }

  await runNodeScript(["scripts/train-baseline-models.mjs"]);
  await runNodeScript(["scripts/evaluate-models.mjs"]);
  await runNodeScript(["scripts/run-predictions.mjs"]);

  console.log("[nightly] completed");
}

main().catch((error) => {
  console.error("[nightly] failed");
  console.error(error);
  process.exitCode = 1;
});
