# Collector Status

## Working today

- Batch orchestration and artifact logging
- PostgreSQL schema definition and apply script
- FRED market factor collector implementation and DB upsert
- ECOS market factor collector implementation and DB upsert
- KRX stock master payload normalization
- KRX stock daily payload normalization
- KRX market index payload normalization
- Partial-success batch execution when one collector fails

## Configured in current environment

- `DATABASE_URL`
- `FRED_API_KEY`
- `ECOS_API_KEY`
- `ECOS_USDKRW_STAT_CODE`
- `ECOS_USDKRW_ITEM_CODE1`
- `ECOS_KR10Y_STAT_CODE`
- `ECOS_KR10Y_ITEM_CODE1`
- `KRX_API_KEY`
- `KRX_STOCK_MASTER_KOSPI_URL`
- `KRX_STOCK_MASTER_KOSDAQ_URL`
- `KRX_STOCK_DAILY_KOSPI_URL`
- `KRX_STOCK_DAILY_KOSDAQ_URL`
- `KRX_MARKET_INDEX_KOSPI_URL`
- `KRX_MARKET_INDEX_KOSDAQ_URL`

## Current runtime status

- FRED requests succeed and `market_daily_factors` rows are being written
- ECOS requests succeed with the configured codes
- KRX requests currently return `401` because the API services are still pending approval
- Docker/PostgreSQL-backed batch logging is working

## Current limitations

- KRX holiday calendar ingestion is not implemented yet
- `sector_daily_snapshot` build is still a planned step
- Investor flow and foreign ownership collectors are excluded from the MVP because they require separate licensed data
- Stock-to-industry classification is still limited to security group / market segment fields from KRX stock master APIs