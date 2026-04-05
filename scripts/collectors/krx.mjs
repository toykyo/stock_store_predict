import { getEnv } from "../lib/env.mjs";
import { asDecimalPercent, fetchJson, toCompactDate } from "../lib/http.mjs";

function isConfigured(value) {
  return Boolean(value) && !value.startsWith("your-");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  if (!value || String(value).length !== 8) {
    return null;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

async function fetchKrx(url, tradeDate) {
  const apiKey = getEnv("KRX_API_KEY");
  if (!isConfigured(apiKey) || !url) {
    return null;
  }

  const target = new URL(url);
  target.searchParams.set("basDd", toCompactDate(tradeDate));
  return fetchJson(target.toString(), {
    headers: {
      AUTH_KEY: apiKey,
    },
  });
}

function pending(collector, detail) {
  return {
    collector,
    status: "pending",
    detail,
    source: getEnv("KRX_OPEN_API_BASE_URL", "https://openapi.krx.co.kr"),
    row: null,
    rows: [],
  };
}

function mapMasterRows(payload) {
  return (payload?.OutBlock_1 ?? []).map((item) => ({
    ticker: item.ISU_SRT_CD,
    isin: item.ISU_CD,
    market: item.MKT_TP_NM,
    name_kr: item.ISU_NM,
    name_en: item.ISU_ENG_NM || null,
    corp_name: item.ISU_ABBRV || item.ISU_NM,
    security_group_name: item.SECGRP_NM || null,
    market_segment_name: item.SECT_TP_NM || null,
    security_type_name: item.KIND_STKCERT_TP_NM || null,
    listing_date: normalizeDate(item.LIST_DD),
    par_value: toNumber(item.PARVAL),
    shares_outstanding: toNumber(item.LIST_SHRS),
    status: "active",
  }));
}

function mapStockDailyRows(payload, tradeDate) {
  return (payload?.OutBlock_1 ?? []).map((item) => ({
    trade_date: normalizeDate(item.BAS_DD) ?? tradeDate,
    ticker: item.ISU_CD,
    market: item.MKT_NM,
    name_kr: item.ISU_NM,
    market_segment_name: item.SECT_TP_NM || null,
    open_price: toNumber(item.TDD_OPNPRC),
    high_price: toNumber(item.TDD_HGPRC),
    low_price: toNumber(item.TDD_LWPRC),
    close_price: toNumber(item.TDD_CLSPRC),
    change_price: toNumber(item.CMPPREVDD_PRC),
    change_rate: asDecimalPercent(item.FLUC_RT),
    volume: toNumber(item.ACC_TRDVOL),
    trading_value: toNumber(item.ACC_TRDVAL),
    market_cap: toNumber(item.MKTCAP),
    shares_outstanding: toNumber(item.LIST_SHRS),
    collected_at: new Date().toISOString(),
  })).filter((row) => row.ticker && row.close_price !== null);
}

function findIndexRow(rows, names) {
  return rows.find((row) => names.includes(row.IDX_NM) && row.CLSPRC_IDX !== "") ?? null;
}

function mapIndexRowsToMarketFactors(kospiPayload, kosdaqPayload, tradeDate) {
  const kospiRows = kospiPayload?.OutBlock_1 ?? [];
  const kosdaqRows = kosdaqPayload?.OutBlock_1 ?? [];

  const kospi = findIndexRow(kospiRows, ["코스피", "코스피지수"]);
  const kosdaq = findIndexRow(kosdaqRows, ["코스닥", "코스닥지수", "코스닥(외국주포함)"]);

  return {
    trade_date: tradeDate,
    kospi_close: kospi ? toNumber(kospi.CLSPRC_IDX) : undefined,
    kospi_return_1d: kospi ? asDecimalPercent(kospi.FLUC_RT) : undefined,
    kosdaq_close: kosdaq ? toNumber(kosdaq.CLSPRC_IDX) : undefined,
    kosdaq_return_1d: kosdaq ? asDecimalPercent(kosdaq.FLUC_RT) : undefined,
    market_total_trading_value: (toNumber(kospi?.ACC_TRDVAL) ?? 0) + (toNumber(kosdaq?.ACC_TRDVAL) ?? 0),
    collected_at: new Date().toISOString(),
  };
}

export async function collectStockMaster(tradeDate) {
  const kospiUrl = getEnv("KRX_STOCK_MASTER_KOSPI_URL");
  const kosdaqUrl = getEnv("KRX_STOCK_MASTER_KOSDAQ_URL");

  if (!isConfigured(getEnv("KRX_API_KEY")) || !kospiUrl || !kosdaqUrl) {
    return pending(
      "collectStockMaster",
      "KRX stock master collector is waiting for KRX_API_KEY, KRX_STOCK_MASTER_KOSPI_URL, and KRX_STOCK_MASTER_KOSDAQ_URL.",
    );
  }

  const [kospiPayload, kosdaqPayload] = await Promise.all([
    fetchKrx(kospiUrl, tradeDate),
    fetchKrx(kosdaqUrl, tradeDate),
  ]);

  const rows = [...mapMasterRows(kospiPayload), ...mapMasterRows(kosdaqPayload)];

  return {
    collector: "collectStockMaster",
    status: rows.length > 0 ? "completed" : "empty",
    detail: `KRX stock master rows fetched: ${rows.length}`,
    source: getEnv("KRX_OPEN_API_BASE_URL", "https://openapi.krx.co.kr"),
    row: null,
    rows,
  };
}

export async function collectMarketFactors(tradeDate) {
  const kospiUrl = getEnv("KRX_MARKET_INDEX_KOSPI_URL");
  const kosdaqUrl = getEnv("KRX_MARKET_INDEX_KOSDAQ_URL");
  if (!isConfigured(getEnv("KRX_API_KEY")) || !kospiUrl || !kosdaqUrl) {
    return pending(
      "collectMarketFactors",
      "KRX market factor collector is waiting for KRX_API_KEY, KRX_MARKET_INDEX_KOSPI_URL, and KRX_MARKET_INDEX_KOSDAQ_URL.",
    );
  }

  const [kospiPayload, kosdaqPayload] = await Promise.all([
    fetchKrx(kospiUrl, tradeDate),
    fetchKrx(kosdaqUrl, tradeDate),
  ]);
  const row = mapIndexRowsToMarketFactors(kospiPayload, kosdaqPayload, tradeDate);
  return {
    collector: "collectMarketFactors",
    status: Object.keys(row).length > 1 ? "completed" : "empty",
    detail: "KRX market index payload fetched and mapped.",
    source: getEnv("KRX_OPEN_API_BASE_URL", "https://openapi.krx.co.kr"),
    row,
    rows: [],
  };
}

export async function collectStockDailySnapshot(tradeDate) {
  const kospiUrl = getEnv("KRX_STOCK_DAILY_KOSPI_URL");
  const kosdaqUrl = getEnv("KRX_STOCK_DAILY_KOSDAQ_URL");

  if (!isConfigured(getEnv("KRX_API_KEY")) || !kospiUrl || !kosdaqUrl) {
    return pending(
      "collectStockDailySnapshot",
      "KRX stock snapshot collector is waiting for KRX_API_KEY, KRX_STOCK_DAILY_KOSPI_URL, and KRX_STOCK_DAILY_KOSDAQ_URL.",
    );
  }

  const payloads = await Promise.all([
    fetchKrx(kospiUrl, tradeDate),
    fetchKrx(kosdaqUrl, tradeDate),
  ]);
  const rows = payloads.flatMap((payload) => mapStockDailyRows(payload, tradeDate));

  return {
    collector: "collectStockDailySnapshot",
    status: rows.length > 0 ? "completed" : "empty",
    detail: `KRX stock daily rows fetched: ${rows.length}`,
    source: getEnv("KRX_OPEN_API_BASE_URL", "https://openapi.krx.co.kr"),
    row: null,
    rows,
  };
}
