import { getEnv } from "../lib/env.mjs";
import { asDecimalPercent, computeReturn, fetchJson, minusDays } from "../lib/http.mjs";

function isConfigured(value) {
  return Boolean(value) && !value.startsWith("your-");
}

async function fetchFredSeries(seriesId, tradeDate) {
  const apiKey = getEnv("FRED_API_KEY");
  const baseUrl = getEnv("FRED_BASE_URL", "https://api.stlouisfed.org/fred");
  if (!isConfigured(apiKey) || !seriesId) {
    return null;
  }

  const observationStart = minusDays(tradeDate, 10);
  const url = new URL(`${baseUrl}/series/observations`);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("observation_start", observationStart);
  url.searchParams.set("observation_end", tradeDate);
  url.searchParams.set("sort_order", "desc");

  const payload = await fetchJson(url.toString());
  const observations = (payload.observations ?? []).filter((item) => item.value !== ".");
  const [current, previous] = observations;
  if (!current) {
    return null;
  }

  return {
    current: Number(current.value),
    previous: previous ? Number(previous.value) : null,
  };
}

export async function collectFredFactors(tradeDate) {
  const apiKey = getEnv("FRED_API_KEY");
  if (!isConfigured(apiKey)) {
    return {
      collector: "collectFredFactors",
      status: "blocked",
      detail: "FRED_API_KEY is missing.",
      source: getEnv("FRED_BASE_URL", "https://api.stlouisfed.org/fred"),
      row: null,
    };
  }

  const us10 = await fetchFredSeries(getEnv("FRED_US10Y_SERIES_ID", "DGS10"), tradeDate);
  const us2 = await fetchFredSeries(getEnv("FRED_US2Y_SERIES_ID", "DGS2"), tradeDate);
  const wti = await fetchFredSeries(getEnv("FRED_WTI_SERIES_ID", "DCOILWTICO"), tradeDate);
  const brent = await fetchFredSeries(getEnv("FRED_BRENT_SERIES_ID", "DCOILBRENTEU"), tradeDate);
  const sp500 = await fetchFredSeries(getEnv("FRED_SP500_SERIES_ID", "SP500"), tradeDate);
  const nasdaq = await fetchFredSeries(getEnv("FRED_NASDAQ_SERIES_ID", "NASDAQCOM"), tradeDate);
  const sox = await fetchFredSeries(getEnv("FRED_SOX_SERIES_ID", "NASDAQSOX"), tradeDate);
  const vix = await fetchFredSeries(getEnv("FRED_VIX_SERIES_ID", "VIXCLS"), tradeDate);
  const dxy = await fetchFredSeries(getEnv("FRED_DXY_SERIES_ID", "DTWEXBGS"), tradeDate);

  return {
    collector: "collectFredFactors",
    status: us10 || us2 || wti || brent || sp500 || nasdaq || sox || vix || dxy ? "completed" : "empty",
    detail: "FRED factors collected.",
    source: getEnv("FRED_BASE_URL", "https://api.stlouisfed.org/fred"),
    row: {
      trade_date: tradeDate,
      us_2y_yield: us2 ? asDecimalPercent(us2.current) : undefined,
      us_10y_yield: us10 ? asDecimalPercent(us10.current) : undefined,
      us_term_spread_10y_2y: us10 && us2 ? asDecimalPercent(us10.current - us2.current) : undefined,
      wti_close: wti?.current,
      brent_close: brent?.current,
      dxy_close: dxy?.current,
      sp500_return_1d: sp500 ? computeReturn(sp500.current, sp500.previous) : undefined,
      nasdaq_return_1d: nasdaq ? computeReturn(nasdaq.current, nasdaq.previous) : undefined,
      sox_return_1d: sox ? computeReturn(sox.current, sox.previous) : undefined,
      vix_close: vix?.current,
      vix_return_1d: vix ? computeReturn(vix.current, vix.previous) : undefined,
      collected_at: new Date().toISOString(),
    },
  };
}
