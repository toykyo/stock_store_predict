import { closePool, withClient } from "./lib/db.mjs";
import { predictProbability, trainLogisticRegression } from "./lib/logistic-regression.mjs";
import { getTrainingDataset, saveModelRegistry, saveTrainingRun } from "./repositories/prediction-pipeline.mjs";

const STOCK_PREDICTION_TOP_SECTOR_COUNT = 5;

const FEATURE_SETS = {
  sector: [
    "sector_return_1d",
    "sector_return_5d",
    "sector_return_20d",
    "sector_volatility_20d",
    "sector_breadth_ratio",
    "sector_trading_value_ratio_5d",
    "sector_excess_vs_market_1d",
    "kospi_return_1d",
    "kosdaq_return_1d",
    "kosdaq_excess_return_vs_kospi",
    "usdkrw_return_1d",
    "dxy_close",
    "kr_10y_yield",
    "kr_3y_yield",
    "kr_10y_change_5d",
    "kr_term_spread_10y_3y",
    "us_10y_yield",
    "us_2y_yield",
    "us_10y_change_5d",
    "us_term_spread_10y_2y",
    "wti_return_5d",
    "brent_return_5d",
    "nasdaq_return_1d",
    "sox_return_1d",
    "sp500_return_1d",
    "vix_close",
    "vix_return_1d",
    "sox_return_1d_x_semiconductor",
    "nasdaq_return_1d_x_semiconductor",
    "usdkrw_return_1d_x_export_electronics",
    "wti_return_5d_x_chemical",
    "brent_return_5d_x_chemical",
    "kr_term_spread_10y_3y_x_financial",
    "kr_3y_yield_x_financial",
    "nasdaq_return_1d_x_biotech",
    "us_2y_yield_x_biotech",
    "kr_3y_yield_x_construction",
    "kosdaq_excess_return_vs_kospi_x_content",
    "leader_stock_return_5d",
    "top3_market_cap_avg_return_5d",
    "top5_market_cap_avg_return_5d",
    "sector_up_ratio_5d",
    "sector_cross_sectional_volatility_5d",
    "sector_return_concentration_top3",
    "sector_trading_value_concentration_top5",
  ],
  stock: [
    "stock_return_1d",
    "stock_return_5d",
    "stock_return_20d",
    "stock_volatility_20d",
    "trading_value_ratio_5d",
    "market_cap_log",
    "stock_turnover_ratio",
    "relative_volume_5d",
    "relative_volume_20d",
    "price_vs_ma20",
    "price_vs_ma60",
    "price_distance_from_20d_high",
    "price_distance_from_60d_high",
    "relative_strength_vs_sector_20d",
    "stock_rank_in_sector_by_return_5d",
    "total_disclosure_count_1d",
    "periodic_disclosure_count_1d",
    "major_issue_disclosure_count_1d",
    "issuance_disclosure_count_1d",
    "equity_disclosure_count_1d",
    "other_disclosure_count_1d",
    "is_earnings_disclosure_day",
    "is_capital_raise_disclosure_day",
    "is_order_contract_disclosure_day",
    "is_major_corporate_action_day",
    "sector_return_1d",
    "sector_return_5d",
    "sector_breadth_ratio",
    "excess_vs_sector_1d",
    "excess_vs_sector_5d",
    "kospi_return_1d",
    "kosdaq_return_1d",
    "kosdaq_excess_return_vs_kospi",
    "usdkrw_return_1d",
    "dxy_close",
    "kr_10y_yield",
    "kr_3y_yield",
    "us_10y_yield",
    "us_2y_yield",
    "wti_return_5d",
    "brent_return_5d",
    "nasdaq_return_1d",
    "sox_return_1d",
    "sp500_return_1d",
    "vix_close",
    "vix_return_1d",
  ],
};

function chooseFeatureNames(rows, candidates, options = {}) {
  const labeledRows = rows.filter((row) => row.label === 0 || row.label === 1);
  const thresholds = [0.95, 0.9, 0.8, 0.7, 0.6];
  const coverage = Object.fromEntries(
    candidates.map((name) => {
      const finiteCount = labeledRows.filter((row) => Number.isFinite(Number(row[name]))).length;
      return [name, labeledRows.length === 0 ? 0 : finiteCount / labeledRows.length];
    }),
  );

  let selected = [];
  for (const threshold of thresholds) {
    selected = candidates.filter((name) => coverage[name] >= threshold);
    if (selected.length >= 8) {
      break;
    }
  }

  if (selected.length === 0) {
    selected = candidates.filter((name) => coverage[name] > 0);
  }

  if (typeof options.shouldForceInclude === "function") {
    const forced = candidates.filter((name) => coverage[name] > 0 && options.shouldForceInclude(name, coverage[name]));
    selected = [...new Set([...selected, ...forced])];
  }

  return {
    selected,
    coverage,
    skipped: candidates.filter((name) => !selected.includes(name)),
  };
}

function toDateText(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function buildSelectedSectorKeySet(rows, model, topN) {
  const grouped = new Map();

  for (const row of rows) {
    const tradeDate = toDateText(row.trade_date);
    if (!grouped.has(tradeDate)) {
      grouped.set(tradeDate, []);
    }

    grouped.get(tradeDate).push({
      tradeDate,
      sectorCode: row.entity_key,
      probability: predictProbability(model, row),
    });
  }

  const selected = new Set();

  for (const [tradeDate, groupRows] of grouped.entries()) {
    groupRows
      .sort((left, right) => right.probability - left.probability)
      .slice(0, topN)
      .forEach((row) => {
        selected.add(`${tradeDate}|${row.sectorCode}`);
      });
  }

  return selected;
}

function filterStockRowsBySelectedSectors(rows, selectedSectorKeySet) {
  return rows.filter((row) => selectedSectorKeySet.has(`${toDateText(row.trade_date)}|${row.sector_code}`));
}

async function trainOneModel(client, modelType, sourceRows, metadataOverrides = {}) {
  const rows = sourceRows;
  const featureSelection = chooseFeatureNames(rows, FEATURE_SETS[modelType], {
    shouldForceInclude: (name) => modelType === "sector" && name.includes("_x_"),
  });
  const featureNames = featureSelection.selected;
  const trainingRunId = `${modelType}-training-${Date.now()}`;
  const modelVersion = `${modelType}-baseline-${Date.now()}`;
  const startedAt = new Date().toISOString();

  const trainedFrom = rows[0]?.trade_date ?? null;
  const trainedTo = rows.at(-1)?.trade_date ?? null;

  try {
    const { model, metrics } = trainLogisticRegression(rows, featureNames, {
      learningRate: modelType === "stock" ? 0.03 : 0.05,
      iterations: modelType === "stock" ? 12 : 20,
      batchSize: modelType === "stock" ? 4096 : 2048,
      l2: 0.0005,
      splitRatio: 0.8,
    });

    await saveModelRegistry(client, {
      model_version: modelVersion,
      model_type: modelType,
      feature_version: "v1",
      horizon_days: 5,
      trained_from: trainedFrom,
      trained_to: trainedTo,
      status: "active",
      metadata: {
        algorithm: "logistic_regression",
        featureNames,
        skippedFeatureNames: featureSelection.skipped,
        featureCoverage: featureSelection.coverage,
        sourceRowCount: sourceRows.length,
        sampledRowCount: rows.length,
        model,
        metrics,
        ...metadataOverrides,
      },
    });

    await saveTrainingRun(client, {
      training_run_id: trainingRunId,
      model_version: modelVersion,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "completed",
      metrics_json: metrics,
    });

    return {
      modelType,
      modelVersion,
      metadata: {
        model,
      },
      metrics,
    };
  } catch (error) {
    await saveModelRegistry(client, {
      model_version: modelVersion,
      model_type: modelType,
      feature_version: "v1",
      horizon_days: 5,
      trained_from: trainedFrom,
      trained_to: trainedTo,
      status: "failed",
      metadata: {
        algorithm: "logistic_regression",
        featureNames,
        skippedFeatureNames: featureSelection.skipped,
        featureCoverage: featureSelection.coverage,
        sourceRowCount: sourceRows.length,
        sampledRowCount: rows.length,
        error: error instanceof Error ? error.message : String(error),
        ...metadataOverrides,
      },
    });

    await saveTrainingRun(client, {
      training_run_id: trainingRunId,
      model_version: modelVersion,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      metrics_json: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

async function run() {
  const result = await withClient(async (client) => {
    const sectorSourceRows = await getTrainingDataset(client, "sector");
    const sector = await trainOneModel(client, "sector", sectorSourceRows);
    const sectorModel = sector.metadata?.model;

    const stockSourceRows = await getTrainingDataset(client, "stock");
    const selectedSectorKeySet = buildSelectedSectorKeySet(sectorSourceRows, sectorModel, STOCK_PREDICTION_TOP_SECTOR_COUNT);
    const filteredStockRows = filterStockRowsBySelectedSectors(stockSourceRows, selectedSectorKeySet);

    const stock = await trainOneModel(client, "stock", filteredStockRows, {
      selectionMode: "top_sectors_only",
      selectorModelType: "sector",
      selectorModelVersion: sector.modelVersion,
      selectedSectorCount: STOCK_PREDICTION_TOP_SECTOR_COUNT,
      selectedDateSectorPairs: selectedSectorKeySet.size,
      preFilterSourceRowCount: stockSourceRows.length,
    });
    return { sector, stock };
  });

  console.log(JSON.stringify(result, null, 2));
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
