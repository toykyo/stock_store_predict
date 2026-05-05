import { getEnv } from "../lib/env.mjs";
import { asDecimalPercent, computeReturn, fetchJson, minusDays, toCompactDate } from "../lib/http.mjs";

function isConfigured(value) {
  return Boolean(value) && !value.startsWith("your-");
}

function buildEcosUrl({ statCode, itemCode1 = "?", itemCode2 = "?", itemCode3 = "?", tradeDate, apiKey }) {
  const baseUrl = getEnv("ECOS_BASE_URL", "https://ecos.bok.or.kr/api");
  const start = toCompactDate(minusDays(tradeDate, 10));
  const end = toCompactDate(tradeDate);
  return `${baseUrl}/StatisticSearch/${apiKey}/json/kr/1/100/${statCode}/D/${start}/${end}/${itemCode1}/${itemCode2}/${itemCode3}`;
}

async function fetchEcosSeries(config, tradeDate, apiKey) {
  if (!config.statCode || !config.itemCode1) {
    return null;
  }

  const url = buildEcosUrl({ ...config, tradeDate, apiKey });
  const payload = await fetchJson(url);
  const rows = payload?.StatisticSearch?.row ?? [];
  const normalized = rows
    .map((row) => Number(row.DATA_VALUE))
    .filter((value) => Number.isFinite(value))
    .reverse();

  const current = normalized.at(-1);
  const previous = normalized.length > 1 ? normalized.at(-2) : null;

  if (!Number.isFinite(current)) {
    return null;
  }

  return { current, previous };
}

export async function collectEcosFactors(tradeDate) {
  const apiKey = getEnv("ECOS_API_KEY");
  if (!isConfigured(apiKey)) {
    return {
      collector: "collectEcosFactors",
      status: "blocked",
      detail: "ECOS_API_KEY is missing.",
      source: getEnv("ECOS_BASE_URL", "https://ecos.bok.or.kr/api"),
      row: null,
    };
  }

  const usdkrw = await fetchEcosSeries(
    {
      statCode: getEnv("ECOS_USDKRW_STAT_CODE"),
      itemCode1: getEnv("ECOS_USDKRW_ITEM_CODE1"),
      itemCode2: getEnv("ECOS_USDKRW_ITEM_CODE2", "?"),
      itemCode3: getEnv("ECOS_USDKRW_ITEM_CODE3", "?"),
    },
    tradeDate,
    apiKey,
  );

  const kr10y = await fetchEcosSeries(
    {
      statCode: getEnv("ECOS_KR10Y_STAT_CODE"),
      itemCode1: getEnv("ECOS_KR10Y_ITEM_CODE1"),
      itemCode2: getEnv("ECOS_KR10Y_ITEM_CODE2", "?"),
      itemCode3: getEnv("ECOS_KR10Y_ITEM_CODE3", "?"),
    },
    tradeDate,
    apiKey,
  );

  const kr3y = await fetchEcosSeries(
    {
      statCode: getEnv("ECOS_KR3Y_STAT_CODE"),
      itemCode1: getEnv("ECOS_KR3Y_ITEM_CODE1"),
      itemCode2: getEnv("ECOS_KR3Y_ITEM_CODE2", "?"),
      itemCode3: getEnv("ECOS_KR3Y_ITEM_CODE3", "?"),
    },
    tradeDate,
    apiKey,
  );

  return {
    collector: "collectEcosFactors",
    status: usdkrw || kr10y || kr3y ? "completed" : "empty",
    detail: "ECOS factors collected.",
    source: getEnv("ECOS_BASE_URL", "https://ecos.bok.or.kr/api"),
    row: {
      trade_date: tradeDate,
      usdkrw_close: usdkrw?.current,
      usdkrw_return_1d: usdkrw ? computeReturn(usdkrw.current, usdkrw.previous) : undefined,
      kr_10y_yield: kr10y ? asDecimalPercent(kr10y.current) : undefined,
      kr_3y_yield: kr3y ? asDecimalPercent(kr3y.current) : undefined,
      kr_term_spread_10y_3y: kr10y && kr3y ? asDecimalPercent(kr10y.current - kr3y.current) : undefined,
      collected_at: new Date().toISOString(),
    },
  };
}
