# KRX Daily Batch Overview

## Scope

- Universe: `KOSPI`, `KOSDAQ`
- History window: `2024-01-01` to current trade date
- Primary target: 5-trading-day excess return probability vs sector

## Batch order

1. Validate `trade_date`
2. Sync `stock_master`
3. Load `market_daily_factors`
4. Load `stock_daily_snapshot`
5. Build `sector_daily_snapshot`
6. Run quality checks

## Current implementation status

- Executable batch entrypoint exists: `scripts/run-krx-batch.mjs`
- Schema file exists: `sql/001_init_schema.sql`
- Batch execution creates persisted run artifacts under `artifacts/batch-runs/`
- FRED and ECOS collectors are implemented but require API configuration
- KRX collectors are scaffolded and still need endpoint mapping
- KRX holiday calendar integration is not implemented yet

## Commands

```bash
npm run db:schema
npm run db:apply
npm run batch:run -- --date=2026-03-20
npm run batch:backfill -- --from=2024-01-01 --to=2024-01-10
```

## Database

The default database target is local PostgreSQL on `localhost:5432`.

- Connection string: `postgresql://postgres:postgres@localhost:5432/stock_anal`
- Recommended runtime: Docker Compose
- Setup guide: [docs/db-setup.md](/d:/Project/stock_anal/docs/db-setup.md)
