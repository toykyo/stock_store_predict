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
  predictedStockCount: number;
  currentRank: number | null;
  currentRankTradeDate: string | null;
  previousRank: number | null;
  modelVersion: string;
  searchKeywords: string;
};

export type CurrentSectorStatusRow = {
  tradeDate: string | null;
  sectorCode: string;
  sectorName: string;
  market: string | null;
  currentRank: number;
  currentStockCount: number;
  sectorReturn1d: number | null;
  searchKeywords: string;
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

export type CurrentSectorStockRow = {
  tradeDate: string | null;
  ticker: string;
  name: string;
  market: string | null;
  closePrice: number | null;
  changeRate: number | null;
  tradingValue: number | null;
  marketCap: number | null;
};

export type PredictedSectorStockRow = {
  predictionDate: string | null;
  ticker: string;
  name: string;
  sectorName: string | null;
  rank: number;
  probability: number;
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

export type PredictionHistoryRow = {
  predictionDate: string | null;
  entityType: "sector" | "stock";
  entityKey: string;
  displayName: string;
  sectorName: string | null;
  modelVersion: string;
  predictedRank: number;
  predictedProbability: number;
  actualExcessReturn5d: number | null;
  hitFlag: number | null;
  evaluated: boolean;
};

export type PredictionHistorySeriesPoint = {
  predictionDate: string;
  avgPredictedProbability: number | null;
  avgActualExcessReturn5d: number | null;
  hitRatio: number | null;
  totalCount: number;
  evaluatedCount: number;
};

export type PredictionProbabilityBucketRow = {
  entityType: "sector" | "stock";
  bucketLabel: string;
  rowCount: number;
  hitRatio: number | null;
  avgExcessReturn5d: number | null;
};

export type PredictionRankDiagnosticsRow = {
  entityType: "sector" | "stock";
  predictedRank: number;
  rowCount: number;
  hitRatio: number | null;
  avgExcessReturn5d: number | null;
};

export type PredictionSectorDiagnosticsRow = {
  sectorName: string;
  rowCount: number;
  hitRatio: number | null;
  avgExcessReturn5d: number | null;
};

export type PredictionHistoryDetail = {
  activeSectorModelVersion: string | null;
  activeStockModelVersion: string | null;
  sectorSeries: PredictionHistorySeriesPoint[];
  stockSeries: PredictionHistorySeriesPoint[];
  rows: PredictionHistoryRow[];
  availablePredictionDates: string[];
  selectedPredictionDate: string | null;
  probabilityBuckets: PredictionProbabilityBucketRow[];
  rankDiagnostics: PredictionRankDiagnosticsRow[];
  weakSectors: PredictionSectorDiagnosticsRow[];
};

export type CurrentPolicyItem = {
  scope: "sector" | "stock" | "service";
  policyKey: string;
  label: string;
  value: string;
  note: string | null;
};

export type ModelAdjustmentLogRow = {
  adjustmentId: string;
  adjustmentScope: string;
  policyKey: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string;
  appliedBy: string;
  appliedAt: string;
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
  latestCurrentSectorTradeDate: string | null;
  selectedSectorCode: string | null;
  selectedSectorName: string | null;
  currentSectors: CurrentSectorStatusRow[];
  topSectors: TopSectorPrediction[];
  topStocks: TopStockPrediction[];
  performance: PerformanceRow[];
  predictionHistory: PredictionHistoryRow[];
  currentPolicies: CurrentPolicyItem[];
  latestAdjustments: ModelAdjustmentLogRow[];
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
