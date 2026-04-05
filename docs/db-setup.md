# Database Setup

## Default choice

The project uses local PostgreSQL by default.

- Host: `localhost`
- Port: `5432`
- Database: `stock_anal`
- User: `postgres`
- Password: `postgres`

Use [docker-compose.yml](/d:/Project/stock_anal/docker-compose.yml) to run it.

## Where data is stored

If you use Docker Compose, the actual database files are stored in the Docker named volume:

- `postgres_data`

This means the DB is not stored as plain files inside the project directory.

## Start database

```bash
docker compose up -d
```

## Apply schema

```bash
npm run db:apply
```

## Verify

```bash
docker compose ps
```
