export const MARKET_OPTIONS = ["전체", "KOSPI", "KOSDAQ", "US"] as const;

export const SECTOR_OPTIONS = [
  "전체",
  "반도체",
  "2차전지",
  "바이오",
  "의료기기",
  "플랫폼",
  "인터넷",
  "게임",
  "소프트웨어",
  "자동차",
  "화학",
  "에너지",
  "조선",
  "방산",
  "금융",
  "건설",
  "통신",
  "유통",
  "엔터테인먼트",
  "헬스케어",
] as const;

export type Market = (typeof MARKET_OPTIONS)[number];
export type Sector = (typeof SECTOR_OPTIONS)[number];
export type SortKey = "score" | "price" | "change";

export type Stock = {
  ticker: string;
  name: string;
  market: Exclude<Market, "전체">;
  sector: Exclude<Sector, "전체">;
  price: number;
  changePct: number;
  marketCap: string;
  per: number;
  pbr: number;
  roe: number;
  dividendYield: number;
  volumeRankPct: number;
  momentum20d: number;
  score: number;
  reasons: string[];
  risks: string[];
};

export type FilterState = {
  market: Market;
  sector: Sector;
  perMax: number;
  pbrMax: number;
  roeMin: number;
  volumeRankMax: number;
  momentumMin: number;
};

export const DEFAULT_QUERY =
  "최근 3개월 상승 추세이면서 PER 15 이하, 거래대금 상위 반도체 종목 찾아줘";

export const BASE_SEARCH_FILTERS: FilterState = {
  market: "전체",
  sector: "전체",
  perMax: 999,
  pbrMax: 999,
  roeMin: -999,
  volumeRankMax: 100,
  momentumMin: -100,
};

export const DEFAULT_FILTERS: FilterState = {
  market: "전체",
  sector: "전체",
  perMax: 999,
  pbrMax: 999,
  roeMin: -999,
  volumeRankMax: 100,
  momentumMin: -100,
};

const SECTOR_ALIASES: Array<{ sector: Exclude<Sector, "전체">; keywords: string[] }> = [
  { sector: "반도체", keywords: ["반도체", "semiconductor", "칩"] },
  { sector: "2차전지", keywords: ["2차전지", "이차전지", "배터리", "2차 전지"] },
  { sector: "바이오", keywords: ["바이오", "바이오테크", "신약"] },
  { sector: "의료기기", keywords: ["의료기기", "미용의료기기", "메디컬", "진단기기", "미용기기"] },
  { sector: "플랫폼", keywords: ["플랫폼"] },
  { sector: "인터넷", keywords: ["인터넷", "포털", "portal"] },
  { sector: "게임", keywords: ["게임", "gaming"] },
  { sector: "소프트웨어", keywords: ["소프트웨어", "software", "saas", "클라우드"] },
  { sector: "자동차", keywords: ["자동차", "완성차", "차부품", "모빌리티"] },
  { sector: "화학", keywords: ["화학", "정유", "석유화학"] },
  { sector: "에너지", keywords: ["에너지", "전력", "원전", "태양광"] },
  { sector: "조선", keywords: ["조선", "shipbuilding"] },
  { sector: "방산", keywords: ["방산", "국방", "디펜스", "defense"] },
  { sector: "금융", keywords: ["금융", "은행", "보험", "증권", "카드"] },
  { sector: "건설", keywords: ["건설", "부동산", "리츠"] },
  { sector: "통신", keywords: ["통신", "5g", "텔레콤"] },
  { sector: "유통", keywords: ["유통", "소매", "리테일", "retail"] },
  { sector: "엔터테인먼트", keywords: ["엔터", "엔터테인먼트", "콘텐츠", "kpop"] },
  { sector: "헬스케어", keywords: ["헬스케어", "건강관리"] },
];

export function formatPrice(value: number, market: Stock["market"]) {
  if (market === "US") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 1,
    }).format(value);
  }

  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function parseNaturalLanguage(query: string): Partial<FilterState> {
  const nextFilters: Partial<FilterState> = {};
  const normalized = query.toLowerCase();

  if (normalized.includes("코스피")) {
    nextFilters.market = "KOSPI";
  } else if (normalized.includes("코스닥")) {
    nextFilters.market = "KOSDAQ";
  } else if (normalized.includes("미국") || normalized.includes("us")) {
    nextFilters.market = "US";
  }

  const matchedSector = SECTOR_ALIASES.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );
  if (matchedSector) {
    nextFilters.sector = matchedSector.sector;
  }

  const perMatch = query.match(/PER\s*(\d+(?:\.\d+)?)\s*이하/i);
  if (perMatch) {
    nextFilters.perMax = Number(perMatch[1]);
  }

  const pbrMatch = query.match(/PBR\s*(\d+(?:\.\d+)?)\s*이하/i);
  if (pbrMatch) {
    nextFilters.pbrMax = Number(pbrMatch[1]);
  }

  const roeMatch = query.match(/ROE\s*(\d+(?:\.\d+)?)\s*이상/i);
  if (roeMatch) {
    nextFilters.roeMin = Number(roeMatch[1]);
  }

  const volumeMatch = query.match(/거래대금\s*상위\s*(\d+)%?/);
  if (volumeMatch) {
    nextFilters.volumeRankMax = Number(volumeMatch[1]);
  } else if (query.includes("거래대금 상위")) {
    nextFilters.volumeRankMax = 30;
  }

  if (query.includes("상승 추세") || query.includes("모멘텀")) {
    nextFilters.momentumMin = 5;
  }

  return nextFilters;
}

export function buildSearchFilters(query: string) {
  const parsed = parseNaturalLanguage(query);
  const ignoreQuantitative = query.includes("조건에 상관없이");

  return {
    market: parsed.market ?? BASE_SEARCH_FILTERS.market,
    sector: parsed.sector ?? BASE_SEARCH_FILTERS.sector,
    perMax: ignoreQuantitative ? BASE_SEARCH_FILTERS.perMax : parsed.perMax ?? BASE_SEARCH_FILTERS.perMax,
    pbrMax: ignoreQuantitative ? BASE_SEARCH_FILTERS.pbrMax : parsed.pbrMax ?? BASE_SEARCH_FILTERS.pbrMax,
    roeMin: ignoreQuantitative ? BASE_SEARCH_FILTERS.roeMin : parsed.roeMin ?? BASE_SEARCH_FILTERS.roeMin,
    volumeRankMax: ignoreQuantitative
      ? BASE_SEARCH_FILTERS.volumeRankMax
      : parsed.volumeRankMax ?? BASE_SEARCH_FILTERS.volumeRankMax,
    momentumMin: ignoreQuantitative
      ? BASE_SEARCH_FILTERS.momentumMin
      : parsed.momentumMin ?? BASE_SEARCH_FILTERS.momentumMin,
  } satisfies FilterState;
}

export function matchesFilters(stock: Stock, filters: FilterState) {
  return (
    (filters.market === "전체" || stock.market === filters.market) &&
    (filters.sector === "전체" || stock.sector === filters.sector) &&
    stock.per <= filters.perMax &&
    stock.pbr <= filters.pbrMax &&
    stock.roe >= filters.roeMin &&
    stock.volumeRankPct <= filters.volumeRankMax &&
    stock.momentum20d >= filters.momentumMin
  );
}

export function filterStocks(stocks: Stock[], filters: FilterState) {
  return stocks.filter((stock) => matchesFilters(stock, filters));
}

export function buildCheckpoints(stock: Stock, filters: FilterState) {
  const perLabel =
    filters.perMax >= BASE_SEARCH_FILTERS.perMax ? "PER 제한 없음" : `PER ${filters.perMax} 이하 조건`;
  const pbrLabel =
    filters.pbrMax >= BASE_SEARCH_FILTERS.pbrMax ? "PBR 제한 없음" : `PBR ${filters.pbrMax} 이하`;
  const roeLabel =
    filters.roeMin <= BASE_SEARCH_FILTERS.roeMin ? "ROE 제한 없음" : `ROE ${filters.roeMin} 이상`;
  const volumeLabel =
    filters.volumeRankMax >= BASE_SEARCH_FILTERS.volumeRankMax
      ? "거래대금 제한 없음"
      : `거래대금 상위 ${filters.volumeRankMax}% 이내`;
  const momentumLabel =
    filters.momentumMin <= BASE_SEARCH_FILTERS.momentumMin
      ? "모멘텀 제한 없음"
      : `최근 20일 수익률 ${formatPercent(stock.momentum20d)}`;

  return [
    `${perLabel} ${stock.per <= filters.perMax ? "충족" : "미충족"}`,
    `${pbrLabel} ${stock.pbr <= filters.pbrMax ? "충족" : "미충족"}`,
    `${roeLabel} ${stock.roe >= filters.roeMin ? "유지" : "부족"}`,
    volumeLabel,
    momentumLabel,
  ];
}
