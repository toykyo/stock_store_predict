import { DEFAULT_FILTERS, filterStocks, type FilterState, type Stock } from "./shared";

type UniverseStock = Stock & {
  symbol: string;
};

const STOCK_UNIVERSE: UniverseStock[] = [
  {
    ticker: "005930",
    symbol: "005930.KS",
    name: "삼성전자",
    market: "KOSPI",
    sector: "반도체",
    price: 74200,
    changePct: 1.82,
    marketCap: "443조",
    per: 14.1,
    pbr: 1.4,
    roe: 11.8,
    dividendYield: 2.6,
    volumeRankPct: 18,
    momentum20d: 8.4,
    score: 92,
    reasons: ["저PER", "거래대금 상위", "20일 상승 추세"],
    risks: ["메모리 가격 변동성", "외국인 수급 둔화 가능성"],
  },
  {
    ticker: "000660",
    symbol: "000660.KS",
    name: "SK하이닉스",
    market: "KOSPI",
    sector: "반도체",
    price: 186500,
    changePct: 2.44,
    marketCap: "136조",
    per: 13.6,
    pbr: 1.9,
    roe: 15.2,
    dividendYield: 1.1,
    volumeRankPct: 12,
    momentum20d: 12.1,
    score: 95,
    reasons: ["추세 강함", "실적 회복", "ROE 우수"],
    risks: ["단기 급등 부담", "업황 민감도 높음"],
  },
  {
    ticker: "042700",
    symbol: "042700.KS",
    name: "한미반도체",
    market: "KOSPI",
    sector: "반도체",
    price: 121800,
    changePct: -0.64,
    marketCap: "11조",
    per: 12.3,
    pbr: 2.8,
    roe: 18.7,
    dividendYield: 0.8,
    volumeRankPct: 24,
    momentum20d: 5.8,
    score: 86,
    reasons: ["장비 수요 기대", "ROE 상위", "밸류 부담 제한적"],
    risks: ["수주 공백 가능성", "변동성 확대 구간"],
  },
  {
    ticker: "214150",
    symbol: "214150.KQ",
    name: "클래시스",
    market: "KOSDAQ",
    sector: "의료기기",
    price: 56600,
    changePct: 1.73,
    marketCap: "3조",
    per: 14.8,
    pbr: 3.0,
    roe: 23.6,
    dividendYield: 0.8,
    volumeRankPct: 19,
    momentum20d: 9.1,
    score: 88,
    reasons: ["미용의료기기 강세", "ROE 우수", "실적 안정"],
    risks: ["해외 매출 둔화 가능성", "밸류 재평가 부담"],
  },
  {
    ticker: "137310",
    symbol: "137310.KQ",
    name: "에스디바이오센서",
    market: "KOSDAQ",
    sector: "의료기기",
    price: 11820,
    changePct: 0.58,
    marketCap: "1조",
    per: 10.2,
    pbr: 1.1,
    roe: 10.8,
    dividendYield: 1.9,
    volumeRankPct: 27,
    momentum20d: 5.4,
    score: 80,
    reasons: ["저PER", "진단기기 대표주"],
    risks: ["코로나 특수 종료", "성장성 둔화"],
  },
  {
    ticker: "247540",
    symbol: "247540.KQ",
    name: "에코프로비엠",
    market: "KOSDAQ",
    sector: "2차전지",
    price: 238000,
    changePct: 0.72,
    marketCap: "23조",
    per: 28.6,
    pbr: 4.2,
    roe: 14.3,
    dividendYield: 0.3,
    volumeRankPct: 14,
    momentum20d: 6.1,
    score: 74,
    reasons: ["성장성", "수급 집중"],
    risks: ["밸류에이션 부담", "소재 가격 민감"],
  },
  {
    ticker: "066970",
    symbol: "066970.KQ",
    name: "엘앤에프",
    market: "KOSDAQ",
    sector: "2차전지",
    price: 127600,
    changePct: -1.14,
    marketCap: "4조",
    per: 19.8,
    pbr: 2.6,
    roe: 12.2,
    dividendYield: 0.1,
    volumeRankPct: 28,
    momentum20d: 4.1,
    score: 70,
    reasons: ["실적 턴어라운드 기대"],
    risks: ["단기 수익성 저하", "변동성 큼"],
  },
  {
    ticker: "196170",
    symbol: "196170.KQ",
    name: "알테오젠",
    market: "KOSDAQ",
    sector: "바이오",
    price: 301500,
    changePct: 3.15,
    marketCap: "16조",
    per: 41.2,
    pbr: 7.4,
    roe: 17.1,
    dividendYield: 0,
    volumeRankPct: 10,
    momentum20d: 16.4,
    score: 81,
    reasons: ["기술 이전 기대", "강한 모멘텀"],
    risks: ["이벤트 의존도 높음", "밸류 부담 매우 큼"],
  },
  {
    ticker: "035420",
    symbol: "035420.KS",
    name: "NAVER",
    market: "KOSPI",
    sector: "인터넷",
    price: 214000,
    changePct: 0.95,
    marketCap: "34조",
    per: 17.2,
    pbr: 1.3,
    roe: 8.6,
    dividendYield: 0.6,
    volumeRankPct: 22,
    momentum20d: 3.8,
    score: 68,
    reasons: ["광고 회복", "AI 기대감"],
    risks: ["ROE 약함", "성장률 둔화"],
  },
  {
    ticker: "035720",
    symbol: "035720.KS",
    name: "카카오",
    market: "KOSPI",
    sector: "플랫폼",
    price: 45600,
    changePct: 1.12,
    marketCap: "20조",
    per: 12.7,
    pbr: 1.0,
    roe: 10.6,
    dividendYield: 0,
    volumeRankPct: 25,
    momentum20d: 6.4,
    score: 79,
    reasons: ["반등 추세", "저평가 구간"],
    risks: ["규제 민감", "광고 경기 영향"],
  },
  {
    ticker: "263750",
    symbol: "263750.KQ",
    name: "펄어비스",
    market: "KOSDAQ",
    sector: "게임",
    price: 39800,
    changePct: 2.32,
    marketCap: "3조",
    per: 14.9,
    pbr: 1.7,
    roe: 11.2,
    dividendYield: 0,
    volumeRankPct: 29,
    momentum20d: 8.2,
    score: 82,
    reasons: ["신작 기대", "거래 증가"],
    risks: ["실적 변동성", "출시 일정 리스크"],
  },
  {
    ticker: "005380",
    symbol: "005380.KS",
    name: "현대차",
    market: "KOSPI",
    sector: "자동차",
    price: 243500,
    changePct: 0.88,
    marketCap: "51조",
    per: 6.3,
    pbr: 0.7,
    roe: 13.4,
    dividendYield: 4.2,
    volumeRankPct: 17,
    momentum20d: 7.3,
    score: 93,
    reasons: ["저PER", "주주환원", "실적 견조"],
    risks: ["환율 민감", "미국 관세 변수"],
  },
  {
    ticker: "105560",
    symbol: "105560.KS",
    name: "KB금융",
    market: "KOSPI",
    sector: "금융",
    price: 84900,
    changePct: 1.04,
    marketCap: "33조",
    per: 5.1,
    pbr: 0.5,
    roe: 10.4,
    dividendYield: 5.0,
    volumeRankPct: 16,
    momentum20d: 5.9,
    score: 91,
    reasons: ["밸류 매력", "배당 매력"],
    risks: ["금리 하락 영향", "대손비용 변수"],
  },
  {
    ticker: "012450",
    symbol: "012450.KS",
    name: "한화에어로스페이스",
    market: "KOSPI",
    sector: "방산",
    price: 384000,
    changePct: 2.18,
    marketCap: "18조",
    per: 14.5,
    pbr: 2.4,
    roe: 18.1,
    dividendYield: 0.7,
    volumeRankPct: 20,
    momentum20d: 11.4,
    score: 90,
    reasons: ["수주 잔고", "강한 추세"],
    risks: ["수출 일정 변동", "정책 변수"],
  },
  {
    ticker: "017670",
    symbol: "017670.KS",
    name: "SK텔레콤",
    market: "KOSPI",
    sector: "통신",
    price: 56500,
    changePct: 0.41,
    marketCap: "12조",
    per: 10.9,
    pbr: 0.9,
    roe: 10.3,
    dividendYield: 6.2,
    volumeRankPct: 30,
    momentum20d: 5.1,
    score: 84,
    reasons: ["배당 안정", "방어주 성격"],
    risks: ["성장성 제한", "규제 이슈"],
  },
  {
    ticker: "TSM",
    symbol: "TSM",
    name: "TSMC ADR",
    market: "US",
    sector: "반도체",
    price: 168.3,
    changePct: 1.26,
    marketCap: "$870B",
    per: 21.4,
    pbr: 5.6,
    roe: 24.8,
    dividendYield: 1.4,
    volumeRankPct: 26,
    momentum20d: 7.7,
    score: 88,
    reasons: ["업종 대표주", "ROE 우수"],
    risks: ["미국 시장 밸류 부담", "환율 영향"],
  },
];

type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  trailingPE?: number;
  priceToBook?: number;
  dividendYield?: number;
};

function formatMarketCap(value: number | undefined, market: Stock["market"]) {
  if (!value || Number.isNaN(value)) {
    return "-";
  }

  if (market === "US") {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);
  }

  return `${new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value)}원`;
}

function scoreStock(stock: Stock) {
  const perScore = Math.max(0, 25 - stock.per);
  const roeScore = Math.min(30, stock.roe * 1.5);
  const momentumScore = Math.max(0, stock.momentum20d * 2);
  const volumeScore = Math.max(0, 30 - stock.volumeRankPct);
  return Math.round(perScore + roeScore + momentumScore + volumeScore);
}

export async function getStocks(filters: FilterState = DEFAULT_FILTERS) {
  const baseStocks = STOCK_UNIVERSE.map(({ symbol: _symbol, ...stock }) => stock);

  try {
    const symbols = STOCK_UNIVERSE.map((stock) => stock.symbol).join(",");
    const response = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      quoteResponse?: {
        result?: YahooQuote[];
      };
    };

    const quoteMap = new Map(
      (payload.quoteResponse?.result ?? []).map((quote) => [quote.symbol, quote]),
    );

    const merged = STOCK_UNIVERSE.map(({ symbol, ...stock }) => {
      const quote = quoteMap.get(symbol);
      const livePrice = quote?.regularMarketPrice ?? stock.price;
      const liveChangePct = quote?.regularMarketChangePercent ?? stock.changePct;
      const livePer = quote?.trailingPE ?? stock.per;
      const livePbr = quote?.priceToBook ?? stock.pbr;
      const liveDividendYield =
        quote?.dividendYield !== undefined ? quote.dividendYield * 100 : stock.dividendYield;

      const hydrated: Stock = {
        ...stock,
        price: livePrice,
        changePct: liveChangePct,
        per: Number.isFinite(livePer) ? livePer : stock.per,
        pbr: Number.isFinite(livePbr) ? livePbr : stock.pbr,
        dividendYield: Number.isFinite(liveDividendYield) ? liveDividendYield : stock.dividendYield,
        marketCap: formatMarketCap(quote?.marketCap, stock.market),
      };

      return {
        ...hydrated,
        score: scoreStock(hydrated),
      };
    });

    return {
      stocks: filterStocks(merged, filters),
      source: "live" as const,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      stocks: filterStocks(baseStocks, filters),
      source: "fallback" as const,
      updatedAt: new Date().toISOString(),
    };
  }
}
