# Collector Status

## Working today

- Batch orchestration and artifact logging
- PostgreSQL schema definition and apply script
- FRED market factor collector implementation
- ECOS market factor collector implementation
- Market factor upsert path when DATABASE_URL is configured

## Waiting for configuration

- `KRX_API_KEY`
- `KRX_STOCK_MASTER_URL`
- `KRX_SECTOR_CLASSIFICATION_URL`
- `KRX_MARKET_FACTORS_URL`
- `KRX_STOCK_DAILY_URL`
- `KRX_STOCK_FLOW_URL`
- `KRX_STOCK_FOREIGN_URL`
- `ECOS_API_KEY`
- `ECOS_*` series codes
- `FRED_API_KEY`

## Current limitations

- KRX payload normalization is not implemented yet
- KRX holiday calendar ingestion is not implemented yet
- Stock master and stock daily upsert paths are not implemented yet
- Sector snapshot build is still a planned step