import { closePool, withClient } from "./lib/db.mjs";
import { predictProbability } from "./lib/logistic-regression.mjs";
import {
  getActiveModels,
  getHistoricalPredictionFeatureRows,
  refreshPredictionEvaluations,
} from "./repositories/prediction-pipeline.mjs";

const STOCK_PREDICTION_TOP_SECTOR_COUNT = 5;

function toDateText(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function chunk(array, size) {
  const output = [];
  for (let index = 0; index < array.length; index += size) {
    output.push(array.slice(index, index + size));
  }
  return output;
}

function rankRowsByDate(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const tradeDate = toDateText(row.trade_date);
    if (!grouped.has(tradeDate)) {
      grouped.set(tradeDate, []);
    }
    grouped.get(tradeDate).push(row);
  }

  const ranked = [];
  for (const [tradeDate, groupRows] of grouped.entries()) {
    groupRows
      .sort((left, right) => right.probability - left.probability)
      .forEach((row, index) => {
        ranked.push({
          ...row,
          prediction_date: tradeDate,
          score: row.probability,
          rank: index + 1,
        });
      });
  }

  return ranked;
}

function buildSelectedSectorKeySetFromRankedRows(rows, topN) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.prediction_date)) {
      grouped.set(row.prediction_date, []);
    }
    grouped.get(row.prediction_date).push(row);
  }

  const selected = new Set();

  for (const [predictionDate, groupRows] of grouped.entries()) {
    groupRows
      .sort((left, right) => left.rank - right.rank)
      .slice(0, topN)
      .forEach((row) => {
        const sectorCode = row.sector_code ?? row.entity_key;
        selected.add(`${predictionDate}|${sectorCode}`);
      });
  }

  return selected;
}

function filterStockRowsBySelectedSectors(rows, selectedSectorKeySet) {
  return rows.filter((row) => selectedSectorKeySet.has(`${toDateText(row.trade_date)}|${row.sector_code}`));
}

async function deleteHistoricalPredictions(client, modelType, modelVersion, cutoffDate) {
  if (modelType === "sector") {
    await client.query(
      `
        delete from sector_prediction_daily
        where model_version = $1
          and prediction_date <= $2
      `,
      [modelVersion, cutoffDate],
    );
    await client.query(
      `
        delete from prediction_evaluation_daily
        where model_version = $1
          and entity_type = 'sector'
          and prediction_date <= $2
      `,
      [modelVersion, cutoffDate],
    );
    return;
  }

  await client.query(
    `
      delete from stock_prediction_daily
      where model_version = $1
        and prediction_date <= $2
    `,
    [modelVersion, cutoffDate],
  );
  await client.query(
    `
      delete from prediction_evaluation_daily
      where model_version = $1
        and entity_type = 'stock'
        and prediction_date <= $2
    `,
    [modelVersion, cutoffDate],
  );
}

async function insertSectorPredictionBatch(client, rows) {
  if (rows.length === 0) {
    return;
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 7;
    values.push(
      row.prediction_date,
      row.sector_code,
      row.sector_name,
      row.model_version,
      row.probability,
      row.score,
      row.rank,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, current_timestamp)`;
  });

  await client.query(
    `
      insert into sector_prediction_daily (
        prediction_date,
        sector_code,
        sector_name,
        model_version,
        probability,
        score,
        rank,
        created_at
      )
      values ${placeholders.join(", ")}
      on conflict (prediction_date, sector_code, model_version) do update
      set sector_name = excluded.sector_name,
          probability = excluded.probability,
          score = excluded.score,
          rank = excluded.rank,
          created_at = current_timestamp
    `,
    values,
  );
}

async function insertStockPredictionBatch(client, rows) {
  if (rows.length === 0) {
    return;
  }

  const values = [];
  const placeholders = rows.map((row, index) => {
    const offset = index * 8;
    values.push(
      row.prediction_date,
      row.ticker,
      row.sector_code,
      row.sector_name,
      row.model_version,
      row.probability,
      row.score,
      row.rank,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, current_timestamp)`;
  });

  await client.query(
    `
      insert into stock_prediction_daily (
        prediction_date,
        ticker,
        sector_code,
        sector_name,
        model_version,
        probability,
        score,
        rank,
        created_at
      )
      values ${placeholders.join(", ")}
      on conflict (prediction_date, ticker, model_version) do update
      set sector_code = excluded.sector_code,
          sector_name = excluded.sector_name,
          probability = excluded.probability,
          score = excluded.score,
          rank = excluded.rank,
          created_at = current_timestamp
    `,
    values,
  );
}

async function evaluateModelHistory(client, modelRow, options = {}) {
  const modelType = modelRow.model_type;
  const modelVersion = modelRow.model_version;
  const metadata = modelRow.metadata ?? {};
  const model = metadata.model;

  if (!model) {
    return {
      modelType,
      modelVersion,
      status: "skipped",
      reason: "Model metadata is missing serialized weights.",
    };
  }

  let featureRows = await getHistoricalPredictionFeatureRows(client, modelType);
  if (modelType === "stock" && options.selectedSectorKeySet instanceof Set) {
    featureRows = filterStockRowsBySelectedSectors(featureRows, options.selectedSectorKeySet);
  }
  if (featureRows.length === 0) {
    return {
      modelType,
      modelVersion,
      status: "skipped",
      reason: "No evaluable feature rows were found.",
    };
  }

  const cutoffDate = String(featureRows.at(-1).trade_date).slice(0, 10);
  const predictionDateFrom = toDateText(featureRows[0].trade_date);
  const predictionDateTo = toDateText(featureRows.at(-1).trade_date);
  await deleteHistoricalPredictions(client, modelType, modelVersion, predictionDateTo);

  const rankedRows = rankRowsByDate(
    featureRows.map((row) => ({
      ...row,
      model_version: modelVersion,
      probability: predictProbability(model, row),
    })),
  );

  const batches = chunk(rankedRows, 500);
  for (const batch of batches) {
    if (modelType === "sector") {
      await insertSectorPredictionBatch(client, batch);
    } else {
      await insertStockPredictionBatch(client, batch);
    }
  }

  return {
    modelType,
    modelVersion,
    status: "completed",
    predictionDateFrom,
    predictionDateTo,
    rows: rankedRows.length,
    dates: new Set(featureRows.map((row) => toDateText(row.trade_date))).size,
    rankedRows,
  };
}

async function run() {
  const result = await withClient(async (client) => {
    const models = await getActiveModels(client);
    const outputs = [];
    const sectorModelRow = models.find((row) => row.model_type === "sector");
    const stockModelRow = models.find((row) => row.model_type === "stock");
    let selectedSectorKeySet = null;

    if (sectorModelRow) {
      const sectorOutput = await evaluateModelHistory(client, sectorModelRow);
      outputs.push({
        ...sectorOutput,
        rankedRows: undefined,
      });
      if (sectorOutput.status === "completed") {
        selectedSectorKeySet = buildSelectedSectorKeySetFromRankedRows(
          sectorOutput.rankedRows,
          STOCK_PREDICTION_TOP_SECTOR_COUNT,
        );
      }
    }

    if (stockModelRow) {
      if (!(selectedSectorKeySet instanceof Set) || selectedSectorKeySet.size === 0) {
        outputs.push({
          modelType: "stock",
          modelVersion: stockModelRow.model_version,
          status: "skipped",
          reason: "No selected sectors available from sector evaluation.",
        });
      } else {
        const stockOutput = await evaluateModelHistory(client, stockModelRow, { selectedSectorKeySet });
        outputs.push({
          ...stockOutput,
          rankedRows: undefined,
        });
      }
    }

    await refreshPredictionEvaluations(client);
    return outputs;
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
