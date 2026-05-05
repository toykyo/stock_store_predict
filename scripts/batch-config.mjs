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
    name: "load_dart_disclosure_events",
    description: "Collect DART disclosure events for the trade date and persist raw disclosure rows.",
    output: "dart_disclosure_event upsert payload",
  },
  {
    name: "build_stock_disclosure_daily",
    description: "Aggregate raw DART disclosures into stock-level daily disclosure features.",
    output: "stock_disclosure_daily rebuild result",
  },
  {
    name: "build_sector_daily_snapshot",
    description: "Aggregate sector-level daily metrics from stock snapshots and index series.",
    output: "sector_daily_snapshot upsert payload",
  },
  {
    name: "build_feature_target_daily",
    description: "Refresh derived feature and target tables for sector and stock prediction.",
    output: "feature/target rebuild result",
  },
  {
    name: "run_prediction_models",
    description: "Apply active baseline models to the latest feature rows and refresh prediction evaluations.",
    output: "prediction upsert payload",
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
  dart_disclosure_event: ["OpenDART list.json"],
  stock_disclosure_daily: ["Derived from dart_disclosure_event"],
  sector_daily_snapshot: ["Derived from stock_daily_snapshot + stock_industry_classification"],
  feature_target_daily: ["Derived from sector_daily_snapshot + stock_daily_snapshot + market_daily_factors"],
  prediction_daily: ["Derived from active model_registry + latest feature tables"],
};
