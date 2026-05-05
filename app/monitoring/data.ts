import { Pool } from "pg";

import type { MonitoringOverview } from "./shared";

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }

  return pool;
}

function toDateText(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFeatureInfluences(metadata: Record<string, unknown>) {
  const featureNames = Array.isArray(metadata.featureNames) ? metadata.featureNames : [];
  const model = metadata.model as { weights?: unknown } | undefined;
  const weights = Array.isArray(model?.weights) ? model.weights : [];

  const rows = featureNames
    .map((featureName, index) => ({
      featureName: String(featureName),
      weight: toNumber(weights[index]) ?? 0,
    }))
    .filter((row) => row.weight !== 0);

  const maxAbs = rows.reduce((accumulator, row) => Math.max(accumulator, Math.abs(row.weight)), 0);

  return rows
    .map((row) => ({
      featureName: row.featureName,
      weight: row.weight,
      normalizedMagnitude: maxAbs > 0 ? Math.abs(row.weight) / maxAbs : 0,
      direction: row.weight >= 0 ? "positive" as const : "negative" as const,
    }))
    .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight));
}

export async function getMonitoringOverview(requestedSectorCode: string | null = null): Promise<MonitoringOverview> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for monitoring.");
  }

  const client = await getPool().connect();

  try {
    const [statusResult, modelResult] = await Promise.all([
      client.query(`
        select
          (select max(trade_date) from stock_daily_snapshot) as latest_stock_trade_date,
          (select max(trade_date) from market_daily_factors) as latest_market_trade_date,
          (select count(*)::integer from stock_master) as stock_master_count,
          (select count(*)::integer from stock_industry_classification where is_current = 1) as classified_count,
          (
            select count(*)::integer
            from stock_master m
            left join stock_industry_classification c
              on c.ticker = m.ticker
             and c.is_current = 1
            where c.ticker is null
          ) as missing_classification_count,
          (
            select max(created_at)
            from (
              select created_at from stock_prediction_daily
              union all
              select created_at from sector_prediction_daily
            ) predictions
          ) as latest_prediction_run_at
      `),
      client.query(`
        select model_version, model_type, trained_from, trained_to, created_at, metadata
        from model_registry
        where status = 'active'
        order by model_type, created_at desc
      `),
    ]);

    const statusRow = statusResult.rows[0] ?? {};
    const activeModels = modelResult.rows.map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const metrics = (metadata.metrics ?? {}) as Record<string, unknown>;
      return {
        modelVersion: String(row.model_version),
        modelType: String(row.model_type),
        trainedFrom: toDateText(row.trained_from),
        trainedTo: toDateText(row.trained_to),
        createdAt: new Date(String(row.created_at)).toISOString(),
        algorithm: String(metadata.algorithm ?? "unknown"),
        featureCount: Array.isArray(metadata.featureNames) ? metadata.featureNames.length : 0,
        accuracy: toNumber(metrics.accuracy),
        auc: toNumber(metrics.auc),
        topBucketHitRatio: toNumber(metrics.topBucketHitRatio),
        topBucketAvgExcess: toNumber(metrics.topBucketAvgExcess),
        featureInfluences: toFeatureInfluences(metadata),
      };
    });

    const activeSectorModelVersion = activeModels.find((entry) => entry.modelType === "sector")?.modelVersion ?? null;
    const activeStockModelVersion = activeModels.find((entry) => entry.modelType === "stock")?.modelVersion ?? null;

    const latestPredictionResult = await client.query(
      `
        select max(prediction_date) as latest_prediction_date
        from (
          select prediction_date from sector_prediction_daily where ($1::varchar is null or model_version = $1)
          union all
          select prediction_date from stock_prediction_daily where ($2::varchar is null or model_version = $2)
        ) prediction_dates
      `,
      [activeSectorModelVersion, activeStockModelVersion],
    );

    const sectorResult = activeSectorModelVersion
      ? await client.query(
        `
          with latest as (
            select max(prediction_date) as prediction_date
            from sector_prediction_daily
            where model_version = $1
          ),
          previous as (
            select
              sector_code,
              rank,
              row_number() over (partition by sector_code, model_version order by prediction_date desc) as rn
            from sector_prediction_daily
            where model_version = $1
          )
          select
            p.prediction_date,
            p.sector_code,
            p.sector_name,
            p.probability,
            p.rank,
            p.model_version,
            prev.rank as previous_rank
          from sector_prediction_daily p
          join latest l on l.prediction_date = p.prediction_date
          left join previous prev
            on prev.sector_code = p.sector_code
           and prev.rn = 2
          where p.model_version = $1
          order by p.rank
          limit 12
        `,
        [activeSectorModelVersion],
      )
      : { rows: [] };

    const topSectors = sectorResult.rows.map((row) => ({
      predictionDate: toDateText(row.prediction_date),
      sectorCode: String(row.sector_code),
      sectorName: String(row.sector_name),
      probability: Number(row.probability),
      rank: Number(row.rank),
      previousRank: row.previous_rank === null ? null : Number(row.previous_rank),
      modelVersion: String(row.model_version),
    }));

    const effectiveSelectedSectorCode = requestedSectorCode && topSectors.some((row) => row.sectorCode === requestedSectorCode)
      ? requestedSectorCode
      : topSectors[0]?.sectorCode ?? null;
    const effectiveSelectedSectorName = topSectors.find((row) => row.sectorCode === effectiveSelectedSectorCode)?.sectorName ?? null;

    const stockResult = activeStockModelVersion
      ? await client.query(
        `
          with latest as (
            select max(prediction_date) as prediction_date
            from stock_prediction_daily
            where model_version = $1
          ),
          previous as (
            select
              ticker,
              rank,
              row_number() over (partition by ticker, model_version order by prediction_date desc) as rn
            from stock_prediction_daily
            where model_version = $1
          )
          select
            p.prediction_date,
            p.ticker,
            m.name_kr,
            p.sector_name,
            p.probability,
            p.rank,
            p.model_version,
            prev.rank as previous_rank
          from stock_prediction_daily p
          join latest l on l.prediction_date = p.prediction_date
          join stock_master m on m.ticker = p.ticker
          left join previous prev
            on prev.ticker = p.ticker
           and prev.rn = 2
          where p.model_version = $1
            and ($2::varchar is null or p.sector_code = $2)
          order by p.rank
          limit 20
        `,
        [activeStockModelVersion, effectiveSelectedSectorCode],
      )
      : { rows: [] };

    const performanceResult = await client.query(
      `
        with ranked_eval as (
          select
            prediction_date,
            entity_type,
            model_version,
            count(*) filter (where hit_flag = 1)::integer as hit_count,
            count(*)::integer as total_count,
            avg(actual_excess_return_5d) as avg_excess_return,
            avg(predicted_probability) as avg_probability
          from prediction_evaluation_daily
          where (
            (entity_type = 'sector' and model_version = $1 and entity_key in (
              select sector_code
              from sector_prediction_daily sp
              where sp.prediction_date = prediction_evaluation_daily.prediction_date
                and sp.model_version = prediction_evaluation_daily.model_version
                and sp.rank <= 5
            )) or
            (entity_type = 'stock' and model_version = $2 and entity_key in (
              select ticker
              from stock_prediction_daily sp
              where sp.prediction_date = prediction_evaluation_daily.prediction_date
                and sp.model_version = prediction_evaluation_daily.model_version
                and sp.rank <= 20
            ))
          )
          group by prediction_date, entity_type, model_version
        )
        select *
        from ranked_eval
        order by prediction_date desc, entity_type
        limit 20
      `,
      [activeSectorModelVersion, activeStockModelVersion],
    );

    return {
      dataStatus: {
        latestStockTradeDate: toDateText(statusRow.latest_stock_trade_date),
        latestMarketTradeDate: toDateText(statusRow.latest_market_trade_date),
        stockMasterCount: Number(statusRow.stock_master_count ?? 0),
        classifiedCount: Number(statusRow.classified_count ?? 0),
        missingClassificationCount: Number(statusRow.missing_classification_count ?? 0),
        latestPredictionRunAt: statusRow.latest_prediction_run_at ? new Date(String(statusRow.latest_prediction_run_at)).toISOString() : null,
      },
      activeModels,
      latestPredictionDate: toDateText(latestPredictionResult.rows[0]?.latest_prediction_date),
      selectedSectorCode: effectiveSelectedSectorCode,
      selectedSectorName: effectiveSelectedSectorName,
      topSectors,
      topStocks: stockResult.rows.map((row) => ({
        predictionDate: toDateText(row.prediction_date),
        ticker: String(row.ticker),
        name: String(row.name_kr),
        sectorName: row.sector_name ? String(row.sector_name) : null,
        probability: Number(row.probability),
        rank: Number(row.rank),
        previousRank: row.previous_rank === null ? null : Number(row.previous_rank),
        modelVersion: String(row.model_version),
      })),
      performance: performanceResult.rows.map((row) => ({
        predictionDate: toDateText(row.prediction_date),
        entityType: String(row.entity_type),
        modelVersion: String(row.model_version),
        hitCount: Number(row.hit_count ?? 0),
        totalCount: Number(row.total_count ?? 0),
        hitRatio: Number(row.total_count ?? 0) > 0 ? Number(row.hit_count ?? 0) / Number(row.total_count) : 0,
        avgExcessReturn: toNumber(row.avg_excess_return),
        avgProbability: toNumber(row.avg_probability),
      })),
    };
  } finally {
    client.release();
  }
}
