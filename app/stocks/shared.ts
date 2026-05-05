export const MARKET_OPTIONS = ["전체", "KOSPI", "KOSDAQ"] as const;

export type Market = (typeof MARKET_OPTIONS)[number];
export type SortKey = "score" | "tradingValue" | "change" | "marketCap" | "momentum";

export type Stock = {
  ticker: string;
  name: string;
  market: Exclude<Market, "전체">;
  sector: string;
  price: number;
  changePct: number;
  changePrice: number | null;
  volume: number | null;
  tradingValue: number | null;
  marketCapValue: number | null;
  sharesOutstanding: number | null;
  marketSegmentName: string | null;
  securityTypeName: string | null;
  momentum20d: number | null;
  volumeRankPct: number | null;
  score: number;
  reasons: string[];
  risks: string[];
};

export type SectorSummary = {
  sector: string;
  stockCount: number;
  averageChangePct: number;
  tradingValue: number;
  marketCapValue: number;
  leaderTicker: string | null;
  leaderName: string | null;
  leaderChangePct: number | null;
};

export type MarketFactorSummary = {
  tradeDate: string | null;
  kospiClose: number | null;
  kospiReturn1d: number | null;
  kosdaqClose: number | null;
  kosdaqReturn1d: number | null;
  usdkrwClose: number | null;
  kr10yYield: number | null;
  us10yYield: number | null;
  wtiClose: number | null;
  sp500Return1d: number | null;
};

export type CoverageSummary = {
  latestTradeDate: string | null;
  stockRows: number;
  classifiedRows: number;
  missingClassificationRows: number;
};

export type FilterState = {
  market: Market;
  sector: string;
  query: string;
  minChangePct: number;
  minTradingValue: number;
  onlyCommonStock: boolean;
  excludeRiskSegments: boolean;
};

export type StocksApiResponse = {
  stocks: Stock[];
  sectors: SectorSummary[];
  marketFactors: MarketFactorSummary | null;
  coverage: CoverageSummary;
  source: "database" | "fallback";
  updatedAt: string;
};

export const DEFAULT_FILTERS: FilterState = {
  market: "전체",
  sector: "전체",
  query: "",
  minChangePct: -30,
  minTradingValue: 0,
  onlyCommonStock: true,
  excludeRiskSegments: true,
};

export function formatPrice(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatLargeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  if (Math.abs(value) >= 1_0000_0000_0000) {
    return `${(value / 1_0000_0000_0000).toFixed(1)}조`;
  }

  if (Math.abs(value) >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(0)}억`;
  }

  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return value.slice(0, 10);
}