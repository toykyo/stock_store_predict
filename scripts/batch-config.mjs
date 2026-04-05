export const BATCH_STEPS = [
  {
    name: "validate_trade_date",
    description: "Validate the requested trade date and skip weekends.",
    output: "In-memory validation result",
  },
  {
    name: "sync_stock_master",
    description: "Refresh KOSPI and KOSDAQ stock master payloads from KRX basic info APIs.",
    output: "stock_master upsert payload",
  },
  {
    name: "load_market_daily_factors",
    description: "Collect market-level factors from KRX index APIs, ECOS, and FRED.",
    output: "market_daily_factors upsert payload",
  },
  {
    name: "load_stock_daily_snapshot",
    description: "Collect KOSPI and KOSDAQ daily stock OHLCV payloads by trade date.",
    output: "stock_daily_snapshot upsert payload",
  },
  {
    name: "build_sector_daily_snapshot",
    description: "Aggregate sector-level daily metrics from stock snapshots and index series.",
    output: "sector_daily_snapshot upsert payload",
  },
  {
    name: "run_quality_checks",
    description: "Validate duplicates, missing values, and row-count anomalies before downstream processing.",
    output: "quality report",
  },
];

export const SOURCE_MAP = {
  stock_master: ["유가증권종목기본정보", "코스닥종목기본정보"],
  market_daily_factors: ["KOSPI시리즈일별시세정보", "KOSDAQ시리즈일별시세정보", "ECOS", "FRED", "Fed/BLS/BOK calendars"],
  stock_daily_snapshot: ["유가증권일별매매정보", "코스닥일별매매정보"],
  sector_daily_snapshot: ["Derived from KRX index series + stock_daily_snapshot"],
};
