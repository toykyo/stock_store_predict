import fs from "node:fs/promises";
import path from "node:path";

import { closePool, withClient } from "./lib/db.mjs";
import { upsertIndustryClassificationRows } from "./repositories/industry-classification.mjs";

const K = {
  ticker: "\uC885\uBAA9\uCF54\uB4DC",
  shortCode: "\uB2E8\uCD95\uCF54\uB4DC",
  name: "\uC885\uBAA9\uBA85",
  koreanStockName: "\uD55C\uAE00 \uC885\uBAA9\uBA85",
  market: "\uC2DC\uC7A5\uAD6C\uBD84",
  sectorCode: "\uC5C5\uC885\uCF54\uB4DC",
  sectorName: "\uC5C5\uC885\uBA85",
  industryCode: "\uC0B0\uC5C5\uCF54\uB4DC",
  industryName: "\uC0B0\uC5C5\uBA85",
  detailIndustryCode: "\uC138\uBD80\uC5C5\uC885\uCF54\uB4DC",
  detailIndustryName: "\uC138\uBD80\uC5C5\uC885\uBA85",
};

function parseArgs(argv) {
  const args = {
    file: null,
    source: "KRX_MDC_MANUAL",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      positional.push(raw);
      continue;
    }

    const key = raw.slice(2);
    const next = argv[index + 1];
    if (key === "file" && next) {
      args.file = next;
      index += 1;
    } else if (key === "source" && next) {
      args.source = next;
      index += 1;
    } else if (key === "effective-from" && next) {
      args.effectiveFrom = next;
      index += 1;
    }
  }

  args.file ??= positional[0] ?? null;
  args.effectiveFrom = positional.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) ?? args.effectiveFrom;
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, "").trim();
}

function uniqueHeaders(headers) {
  const seen = new Map();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header}_${count + 1}`;
  });
}

function firstValue(record, names) {
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function normalizeMarket(value) {
  if (!value) {
    return "UNKNOWN";
  }

  const normalized = value.toUpperCase().replaceAll(" ", "");
  if (normalized.includes("KOSDAQ")) {
    return "KOSDAQ";
  }
  if (normalized.includes("KOSPI")) {
    return "KOSPI";
  }
  return value.trim();
}

function toRecords(rows) {
  if (rows.length === 0) {
    return [];
  }

  const headers = uniqueHeaders(rows[0].map(normalizeHeader));
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? null])));
}

function mapIndustryRows(records, { source, effectiveFrom }) {
  return records
    .map((record) => {
      const ticker = firstValue(record, [K.ticker, K.shortCode, "ticker", "ISU_SRT_CD"]);
      const sectorCode = firstValue(record, [K.sectorCode, K.industryCode, K.detailIndustryCode, "sector_code"]);
      const sectorName = firstValue(record, [K.sectorName, K.industryName, K.detailIndustryName, "sector_name"]);

      if (!ticker || !sectorName) {
        return null;
      }

      return {
        ticker,
        market: normalizeMarket(firstValue(record, [K.market, "market", "MKT_TP_NM"])),
        name_kr: firstValue(record, [K.name, K.koreanStockName, "name_kr", "ISU_NM"]),
        sector_code: sectorCode,
        sector_name: sectorName,
        industry_code: null,
        industry_name: null,
        source,
        effective_from: effectiveFrom,
      };
    })
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error("Usage: npm run industry:import -- --file <csv-path> [--effective-from YYYY-MM-DD] [--source SOURCE]");
  }

  const buffer = await fs.readFile(path.resolve(args.file));
  const attempts = ["utf-8", "euc-kr", "windows-949"].map((encoding) => {
    const text = new TextDecoder(encoding).decode(buffer);
    const records = toRecords(parseCsv(text));
    const rows = mapIndustryRows(records, args);
    return { encoding, records, rows };
  });
  const best = attempts.sort((a, b) => b.rows.length - a.rows.length)[0];
  const records = best.records;
  const rows = best.rows;

  if (rows.length === 0) {
    console.log("No industry classification rows imported.");
    console.log("Required CSV columns include ticker/醫낅ぉ肄붾뱶 plus sector/?낆쥌紐?");
    console.log(`CSV rows scanned: ${records.length}`);
    return;
  }

  const result = await withClient((client) => upsertIndustryClassificationRows(client, rows));

  console.log(`CSV encoding used: ${best.encoding}`);
  console.log(`CSV rows scanned: ${records.length}`);
  console.log(`Industry rows parsed: ${rows.length}`);
  console.log(`Industry rows upserted: ${result.insertedOrUpdated}`);
  console.log(`Rows skipped because ticker is missing in stock_master: ${result.skippedMissingMaster}`);
  console.log(`Source: ${args.source}`);
  console.log(`Effective from: ${args.effectiveFrom}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });