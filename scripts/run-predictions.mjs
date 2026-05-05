import { closePool, withClient } from "./lib/db.mjs";
import { predictProbability } from "./lib/logistic-regression.mjs";
import {
  getActiveModels,
  getLatestPredictionFeatureRows,
  refreshPredictionEvaluations,
  replaceSectorPredictions,
  replaceStockPredictions,
} from "./repositories/prediction-pipeline.mjs";

const STOCK_PREDICTION_TOP_SECTOR_COUNT = 5;

function rankRows(rows) {
  return rows
    .sort((left, right) => right.probability - left.probability)
    .map((row, index) => ({
      ...row,
      score: row.probability,
      rank: index + 1,
    }));
}

function getSerializedModel(modelRow) {
  const metadata = modelRow.metadata ?? {};
  return metadata.model;
}

async function run() {
  const result = await withClient(async (client) => {
    const models = await getActiveModels(client);
    const outputs = [];
    const sectorModelRow = models.find((row) => row.model_type === "sector");
    const stockModelRow = models.find((row) => row.model_type === "stock");
    let selectedSectorCodes = [];

    if (sectorModelRow) {
      const sectorModel = getSerializedModel(sectorModelRow);
      if (!sectorModel) {
        outputs.push({
          modelType: "sector",
          modelVersion: sectorModelRow.model_version,
          status: "skipped",
          reason: "Model metadata is missing serialized weights.",
        });
      } else {
        const featureRows = await getLatestPredictionFeatureRows(client, "sector");
        if (featureRows.length === 0) {
          outputs.push({
            modelType: "sector",
            modelVersion: sectorModelRow.model_version,
            status: "skipped",
            reason: "No feature rows available for latest trade date.",
          });
        } else {
          const predictionDate = featureRows[0].trade_date;
          const ranked = rankRows(featureRows.map((row) => ({
            sector_code: row.sector_code,
            sector_name: row.sector_name,
            probability: predictProbability(sectorModel, row),
          })));
          selectedSectorCodes = ranked.slice(0, STOCK_PREDICTION_TOP_SECTOR_COUNT).map((row) => row.sector_code);
          await replaceSectorPredictions(client, predictionDate, sectorModelRow.model_version, ranked);
          outputs.push({
            modelType: "sector",
            modelVersion: sectorModelRow.model_version,
            predictionDate,
            rows: ranked.length,
            selectedSectorCount: selectedSectorCodes.length,
            status: "completed",
          });
        }
      }
    }

    if (stockModelRow) {
      const stockModel = getSerializedModel(stockModelRow);
      if (!stockModel) {
        outputs.push({
          modelType: "stock",
          modelVersion: stockModelRow.model_version,
          status: "skipped",
          reason: "Model metadata is missing serialized weights.",
        });
      } else if (selectedSectorCodes.length === 0) {
        outputs.push({
          modelType: "stock",
          modelVersion: stockModelRow.model_version,
          status: "skipped",
          reason: "No selected sectors available from sector predictions.",
        });
      } else {
        const featureRows = await getLatestPredictionFeatureRows(client, "stock", { sectorCodes: selectedSectorCodes });
        if (featureRows.length === 0) {
          outputs.push({
            modelType: "stock",
            modelVersion: stockModelRow.model_version,
            status: "skipped",
            reason: "No stock feature rows available inside selected sectors.",
          });
        } else {
          const predictionDate = featureRows[0].trade_date;
          const ranked = rankRows(featureRows.map((row) => ({
            ticker: row.ticker,
            sector_code: row.sector_code,
            sector_name: row.sector_name,
            probability: predictProbability(stockModel, row),
          })));
          await replaceStockPredictions(client, predictionDate, stockModelRow.model_version, ranked);
          outputs.push({
            modelType: "stock",
            modelVersion: stockModelRow.model_version,
            predictionDate,
            rows: ranked.length,
            selectedSectorCount: selectedSectorCodes.length,
            status: "completed",
          });
        }
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
