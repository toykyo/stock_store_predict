export type ActiveModel = {
  modelVersion: string;
  modelType: string;
  trainedFrom: string | null;
  trainedTo: string | null;
  createdAt: string;
  algorithm: string;
  featureCount: number;
  accuracy: number | null;
  auc: number | null;
  topBucketHitRatio: number | null;
  topBucketAvgExcess: number | null;
  featureInfluences: ModelFeatureInfluence[];
};

export type ModelFeatureInfluence = {
  featureName: string;
  weight: number;
  normalizedMagnitude: number;
  direction: "positive" | "negative";
};

export type TopSectorPrediction = {
  predictionDate: string | null;
  sectorCode: string;
  sectorName: string;
  probability: number;
  rank: number;
  previousRank: number | null;
  modelVersion: string;
};

export type TopStockPrediction = {
  predictionDate: string | null;
  ticker: string;
  name: string;
  sectorName: string | null;
  probability: number;
  rank: number;
  previousRank: number | null;
  modelVersion: string;
};

export type PerformanceRow = {
  predictionDate: string | null;
  entityType: string;
  modelVersion: string;
  hitCount: number;
  totalCount: number;
  hitRatio: number;
  avgExcessReturn: number | null;
  avgProbability: number | null;
};

export type MonitoringOverview = {
  dataStatus: {
    latestStockTradeDate: string | null;
    latestMarketTradeDate: string | null;
    stockMasterCount: number;
    classifiedCount: number;
    missingClassificationCount: number;
    latestPredictionRunAt: string | null;
  };
  activeModels: ActiveModel[];
  latestPredictionDate: string | null;
  selectedSectorCode: string | null;
  selectedSectorName: string | null;
  topSectors: TopSectorPrediction[];
  topStocks: TopStockPrediction[];
  performance: PerformanceRow[];
};

export type SectorTrendPoint = {
  tradeDate: string;
  cumulativeIndex: number;
  sectorReturn1d: number | null;
  predictionProbability: number | null;
};

export type SectorDetail = {
  sectorCode: string;
  sectorName: string;
  market: string | null;
  activeSectorModelVersion: string | null;
  latestPredictionDate: string | null;
  latestPredictionProbability: number | null;
  latestPredictionRank: number | null;
  latestEvaluatedPredictionDate: string | null;
  latestEvaluatedProbability: number | null;
  latestEvaluatedExcessReturn: number | null;
  history: SectorTrendPoint[];
  predictionWindowDates: string[];
};

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${(value * 100).toFixed(1)}%`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return value.slice(0, 10);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRankChange(currentRank: number, previousRank: number | null) {
  if (previousRank === null) {
    return "new";
  }

  const delta = previousRank - currentRank;
  if (delta === 0) {
    return "-";
  }

  return delta > 0 ? `up ${delta}` : `down ${Math.abs(delta)}`;
}
