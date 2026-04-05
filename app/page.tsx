"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_FILTERS,
  DEFAULT_QUERY,
  MARKET_OPTIONS,
  SECTOR_OPTIONS,
  buildCheckpoints,
  buildSearchFilters,
  filterStocks,
  formatPercent,
  formatPrice,
  parseNaturalLanguage,
  type FilterState,
  type SortKey,
  type Stock,
} from "./stocks/shared";

type StocksApiResponse = {
  stocks: Stock[];
  source: "live" | "fallback";
  updatedAt: string;
};

const PAGE_SIZE = 8;
const SECTOR_PAGE_SIZE = 7;

type SectorRanking = {
  sector: Stock["sector"];
  averageChangePct: number;
  count: number;
  leader: string;
};

function buildQueryString(filters: FilterState) {
  const params = new URLSearchParams({
    market: filters.market,
    sector: filters.sector,
    perMax: String(filters.perMax),
    pbrMax: String(filters.pbrMax),
    roeMin: String(filters.roeMin),
    volumeRankMax: String(filters.volumeRankMax),
    momentumMin: String(filters.momentumMin),
  });

  return params.toString();
}

function formatUpdatedAt(value: string) {
  if (!value) {
    return "업데이트 대기 중";
  }

  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildResultNarrative(query: string, filters: FilterState) {
  const parsed = parseNaturalLanguage(query);
  const parts = [
    parsed.market ? `시장 ${parsed.market}` : null,
    parsed.sector ? `섹터 ${parsed.sector}` : null,
    parsed.perMax !== undefined ? `PER ${parsed.perMax} 이하` : null,
    parsed.pbrMax !== undefined ? `PBR ${parsed.pbrMax} 이하` : null,
    parsed.roeMin !== undefined ? `ROE ${parsed.roeMin} 이상` : null,
    parsed.volumeRankMax !== undefined ? `거래량 순위 ${parsed.volumeRankMax}% 이내` : null,
    parsed.momentumMin !== undefined ? `모멘텀 ${parsed.momentumMin}% 이상` : null,
  ].filter((item): item is string => Boolean(item));

  if (parts.length === 0) {
    return `입력한 자연어 검색을 기반으로 후보를 찾고, 이후 고정 필터를 적용한 결과입니다.`;
  }

  return `자연어 검색에서 ${parts.join(", ")} 조건을 해석해 후보를 찾은 뒤, 좌측 고정 필터를 적용한 결과입니다.`;
}

export default function HomePage() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [draftQuery, setDraftQuery] = useState(DEFAULT_QUERY);
  const [queryFilters, setQueryFilters] = useState<FilterState>(buildSearchFilters(DEFAULT_QUERY));
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [selectedTicker, setSelectedTicker] = useState("005930");
  const [compareTickers, setCompareTickers] = useState<string[]>(["005930", "000660"]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [dataSource, setDataSource] = useState<"live" | "fallback">("fallback");
  const [updatedAt, setUpdatedAt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAllSectors, setShowAllSectors] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentSectorPage, setCurrentSectorPage] = useState(1);

  const visibleSectors = showAllSectors ? SECTOR_OPTIONS : SECTOR_OPTIONS.slice(0, 8);

  useEffect(() => {
    let cancelled = false;

    async function loadStocks() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/stocks?${buildQueryString(queryFilters)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as StocksApiResponse;

        if (cancelled) {
          return;
        }

        setStocks(payload.stocks);
        setDataSource(payload.source);
        setUpdatedAt(payload.updatedAt);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadStocks();

    return () => {
      cancelled = true;
    };
  }, [queryFilters]);

  const filteredStocks = useMemo(() => filterStocks(stocks, filters), [filters, stocks]);

  const sectorRankings = useMemo<SectorRanking[]>(() => {
    const grouped = new Map<
      Stock["sector"],
      { totalChangePct: number; count: number; leader: string; leaderChangePct: number }
    >();

    for (const stock of stocks) {
      const current = grouped.get(stock.sector);

      if (!current) {
        grouped.set(stock.sector, {
          totalChangePct: stock.changePct,
          count: 1,
          leader: stock.name,
          leaderChangePct: stock.changePct,
        });
        continue;
      }

      current.totalChangePct += stock.changePct;
      current.count += 1;

      if (stock.changePct > current.leaderChangePct) {
        current.leader = stock.name;
        current.leaderChangePct = stock.changePct;
      }
    }

    return [...grouped.entries()]
      .map(([sector, value]) => ({
        sector,
        averageChangePct: value.totalChangePct / value.count,
        count: value.count,
        leader: value.leader,
      }))
      .sort((a, b) => b.averageChangePct - a.averageChangePct);
  }, [stocks]);

  const sortedStocks = useMemo(() => {
    return [...filteredStocks].sort((a, b) => {
      if (sortKey === "price") {
        return b.price - a.price;
      }

      if (sortKey === "change") {
        return b.changePct - a.changePct;
      }

      return b.score - a.score;
    });
  }, [filteredStocks, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedStocks.length / PAGE_SIZE));
  const sectorTotalPages = Math.max(1, Math.ceil(sectorRankings.length / SECTOR_PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentSectorPage((page) => Math.min(page, sectorTotalPages));
  }, [sectorTotalPages]);

  const pagedStocks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedStocks.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedStocks]);

  const pagedSectors = useMemo(() => {
    const start = (currentSectorPage - 1) * SECTOR_PAGE_SIZE;
    return sectorRankings.slice(start, start + SECTOR_PAGE_SIZE);
  }, [currentSectorPage, sectorRankings]);

  const selectedStock = useMemo(() => {
    return sortedStocks.find((stock) => stock.ticker === selectedTicker) ?? sortedStocks[0] ?? null;
  }, [selectedTicker, sortedStocks]);

  useEffect(() => {
    if (!selectedStock && sortedStocks[0]) {
      setSelectedTicker(sortedStocks[0].ticker);
      return;
    }

    if (!selectedStock) {
      setCompareTickers([]);
    }
  }, [selectedStock, sortedStocks]);

  const compareStocks = compareTickers
    .map((ticker) => sortedStocks.find((stock) => stock.ticker === ticker))
    .filter((stock): stock is Stock => Boolean(stock));

  const confidence = Math.min(98, 60 + Object.keys(parseNaturalLanguage(query)).length * 8);
  const resultNarrative = useMemo(() => buildResultNarrative(query, queryFilters), [query, queryFilters]);

  function applyQuery() {
    setQuery(draftQuery);
    setQueryFilters(buildSearchFilters(draftQuery));
    setCurrentPage(1);
  }

  function resetFilters() {
    setDraftQuery(DEFAULT_QUERY);
    setQuery(DEFAULT_QUERY);
    setQueryFilters(buildSearchFilters(DEFAULT_QUERY));
    setFilters(DEFAULT_FILTERS);
    setSortKey("score");
    setSelectedTicker("005930");
    setCompareTickers(["005930", "000660"]);
    setShowAllSectors(false);
    setCurrentPage(1);
  }

  function toggleCompare(ticker: string) {
    setCompareTickers((current) => {
      if (current.includes(ticker)) {
        return current.filter((item) => item !== ticker);
      }

      return [...current.slice(-1), ticker];
    });
  }

  function movePage(page: number) {
    setCurrentPage(Math.min(Math.max(1, page), totalPages));
  }

  function moveSectorPage(page: number) {
    setCurrentSectorPage(Math.min(Math.max(1, page), sectorTotalPages));
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Stock Agent</p>
          <h1>검색 결과와 고정 필터를 분리한 스크리너</h1>
          <p className="hero-copy">
            자연어 검색은 후보군을 만들고, 좌측 패널은 사용자가 직접 조절하는 고정 필터만 담당합니다. 결과 영역에는
            입력한 자연어가 어떤 결과로 연결됐는지 문장으로 보여줍니다.
          </p>
        </div>
        <div className="hero-actions">
          <button className="primary" onClick={applyQuery}>
            조건 분석
          </button>
          <button className="secondary" onClick={resetFilters}>
            초기화
          </button>
        </div>
      </section>

      <section className="dashboard-grid">
        <aside className="panel filters sticky-panel">
          <div className="panel-head">
            <p className="label">수동 조건 패널</p>
            <h2>섹터 랭킹</h2>
            <p className="helper-copy">
              2024-01-01부터 현재까지를 기준으로 섹터를 상승률 순서대로 보여주는 자리입니다. 현재는 연결된 데이터 기준
              미리보기 구조이며, 이후 KRX 공식 분류/기간 수익률 계산으로 교체하면 됩니다.
            </p>
          </div>

          <div className="field-group">
            <p className="field-title">시장</p>
            <div className="choice-row">
              {MARKET_OPTIONS.map((market) => (
                <button
                  key={market}
                  className={`chip-button${filters.market === market ? " active" : ""}`}
                  onClick={() => {
                    setFilters((current) => ({ ...current, market }));
                    setCurrentPage(1);
                  }}
                >
                  {market}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <div className="field-title-row">
              <p className="field-title">섹터 상승률 순위</p>
              <span className="subtle">2024.01.01 ~ 현재</span>
            </div>
            <div className="sector-rank-list">
              <button
                className={`sector-rank-item${filters.sector === "전체" ? " active" : ""}`}
                onClick={() => {
                  setFilters((current) => ({ ...current, sector: "전체" }));
                  setCurrentPage(1);
                }}
              >
                <div className="sector-rank-main">
                  <strong>전체 섹터 보기</strong>
                  <span className="subtle">필터 해제</span>
                </div>
                <span className="sector-rank-value">-</span>
              </button>
              {pagedSectors.map((sector, index) => (
                <button
                  key={sector.sector}
                  className={`sector-rank-item${filters.sector === sector.sector ? " active" : ""}`}
                  onClick={() => {
                    setFilters((current) => ({ ...current, sector: sector.sector }));
                    setCurrentPage(1);
                  }}
                >
                  <div className="sector-rank-main">
                    <strong>
                      {String((currentSectorPage - 1) * SECTOR_PAGE_SIZE + index + 1).padStart(2, "0")}.{" "}
                      {sector.sector}
                    </strong>
                    <span className="subtle">
                      종목 {sector.count}개 · 대표 {sector.leader}
                    </span>
                  </div>
                  <span className={`sector-rank-value ${sector.averageChangePct < 0 ? "down" : "up"}`}>
                    {formatPercent(sector.averageChangePct)}
                  </span>
                </button>
              ))}
            </div>
            {sectorRankings.length > SECTOR_PAGE_SIZE ? (
              <div className="pagination compact-pagination">
                <button
                  className="secondary pagination-button"
                  onClick={() => moveSectorPage(currentSectorPage - 1)}
                  disabled={currentSectorPage === 1}
                >
                  이전
                </button>
                <div className="pagination-pages">
                  {Array.from({ length: sectorTotalPages }, (_, index) => {
                    const page = index + 1;
                    return (
                      <button
                        key={page}
                        className={`page-chip${page === currentSectorPage ? " active" : ""}`}
                        onClick={() => moveSectorPage(page)}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="secondary pagination-button"
                  onClick={() => moveSectorPage(currentSectorPage + 1)}
                  disabled={currentSectorPage === sectorTotalPages}
                >
                  다음
                </button>
              </div>
            ) : null}
          </div>

          <div className="field-group">
            <div className="field-title-row">
              <p className="field-title">빠른 섹터 선택</p>
              {SECTOR_OPTIONS.length > 8 ? (
                <button className="inline-toggle" onClick={() => setShowAllSectors((current) => !current)}>
                  {showAllSectors ? "접기" : `more ${SECTOR_OPTIONS.length - 8}`}
                </button>
              ) : null}
            </div>
            <div className="choice-grid">
              {visibleSectors.map((sector) => (
                <button
                  key={sector}
                  className={`chip-button${filters.sector === sector ? " active" : ""}`}
                  onClick={() => {
                    setFilters((current) => ({ ...current, sector }));
                    setCurrentPage(1);
                  }}
                >
                  {sector}
                </button>
              ))}
            </div>
          </div>

          <div className="field-group">
            <p className="field-title">밸류에이션</p>
            <label className="metric editable">
              <span>PER 최대</span>
              <input
                type="number"
                value={filters.perMax}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, perMax: Number(event.target.value) }));
                  setCurrentPage(1);
                }}
              />
            </label>
            <label className="metric editable">
              <span>PBR 최대</span>
              <input
                type="number"
                step="0.1"
                value={filters.pbrMax}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, pbrMax: Number(event.target.value) }));
                  setCurrentPage(1);
                }}
              />
            </label>
            <label className="metric editable">
              <span>ROE 최소</span>
              <input
                type="number"
                value={filters.roeMin}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, roeMin: Number(event.target.value) }));
                  setCurrentPage(1);
                }}
              />
            </label>
          </div>

          <div className="field-group">
            <p className="field-title">수급 / 거래량 대용 지표</p>
            <label className="metric editable">
              <span>거래량 순위 최대 %</span>
              <input
                type="number"
                value={filters.volumeRankMax}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    volumeRankMax: Number(event.target.value),
                  }));
                  setCurrentPage(1);
                }}
              />
            </label>
            <label className="metric editable">
              <span>20일 모멘텀 최소</span>
              <input
                type="number"
                value={filters.momentumMin}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    momentumMin: Number(event.target.value),
                  }));
                  setCurrentPage(1);
                }}
              />
            </label>
          </div>

          <div className="stack-actions">
            <button className="primary full" onClick={applyQuery}>
              검색 다시 적용
            </button>
            <button className="secondary full" onClick={resetFilters}>
              전체 초기화
            </button>
          </div>
        </aside>

        <div className="main-column">
          <section className="query-card">
            <div className="query-copy">
              <p className="label">자연어 조건 입력</p>
              <textarea
                className="query-input"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                rows={3}
              />
            </div>
            <div className="query-actions status-panel">
              <span className="confidence">해석 신뢰도 {confidence}%</span>
              <span className="subtle">데이터: {dataSource === "live" ? "live" : "fallback mock"}</span>
              <span className="subtle">업데이트 {formatUpdatedAt(updatedAt)}</span>
              <button className="primary" onClick={applyQuery}>
                분석
              </button>
            </div>
          </section>

          <section className="content-grid">
            <section className="panel results">
              <div className="panel-head inline">
                <div>
                  <p className="label">검색 결과</p>
                  <h2>
                    검색 {stocks.length}개 · 고정 필터 적용 {sortedStocks.length}개
                  </h2>
                </div>
                <div className="sort-row">
                  <button
                    className={`sort-button${sortKey === "score" ? " active" : ""}`}
                    onClick={() => setSortKey("score")}
                  >
                    종합점수순
                  </button>
                  <button
                    className={`sort-button${sortKey === "price" ? " active" : ""}`}
                    onClick={() => setSortKey("price")}
                  >
                    현재가순
                  </button>
                  <button
                    className={`sort-button${sortKey === "change" ? " active" : ""}`}
                    onClick={() => setSortKey("change")}
                  >
                    상승률순
                  </button>
                </div>
              </div>

              <div className="result-story">
                <p className="label">자연어 검색 해석 결과</p>
                <p className="result-story-copy">{resultNarrative}</p>
                <div className="result-story-meta">
                  <span>현재 페이지 {currentPage} / {totalPages}</span>
                  <span>페이지당 {PAGE_SIZE}개</span>
                </div>
              </div>

              <div className="table-card">
                <div className="table-header table-grid">
                  <span>종목명</span>
                  <span>현재가</span>
                  <span>등락률</span>
                  <span>PER</span>
                  <span>ROE</span>
                  <span>선정 이유</span>
                </div>
                {pagedStocks.map((stock) => (
                  <button
                    key={stock.ticker}
                    className={`table-row table-grid interactive-row${
                      stock.ticker === selectedStock?.ticker ? " selected" : ""
                    }`}
                    onClick={() => setSelectedTicker(stock.ticker)}
                  >
                    <div>
                      <strong>{stock.name}</strong>
                      <p className="subtle">
                        {stock.ticker} · {stock.market}
                      </p>
                    </div>
                    <span>{formatPrice(stock.price, stock.market)}</span>
                    <span className={stock.changePct < 0 ? "down" : "up"}>
                      {formatPercent(stock.changePct)}
                    </span>
                    <span>{stock.per.toFixed(1)}</span>
                    <span>{stock.roe.toFixed(1)}</span>
                    <span>{stock.reasons.join(", ")}</span>
                  </button>
                ))}
                {!isLoading && sortedStocks.length === 0 ? (
                  <div className="empty-state">현재 고정 필터 조건을 만족하는 종목이 없습니다.</div>
                ) : null}
                {isLoading ? <div className="empty-state">데이터를 불러오는 중입니다.</div> : null}
                {error ? <div className="empty-state">오류: {error}</div> : null}
              </div>

              {sortedStocks.length > PAGE_SIZE ? (
                <div className="pagination">
                  <button
                    className="secondary pagination-button"
                    onClick={() => movePage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    이전
                  </button>
                  <div className="pagination-pages">
                    {Array.from({ length: totalPages }, (_, index) => {
                      const page = index + 1;
                      return (
                        <button
                          key={page}
                          className={`page-chip${page === currentPage ? " active" : ""}`}
                          onClick={() => movePage(page)}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="secondary pagination-button"
                    onClick={() => movePage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    다음
                  </button>
                </div>
              ) : null}

              <div className="compare-strip">
                <p className="label">비교 선택</p>
                <div className="tag-list">
                  {sortedStocks.slice(0, 6).map((stock) => (
                    <button
                      key={stock.ticker}
                      className={`tag-button${compareTickers.includes(stock.ticker) ? " active" : ""}`}
                      onClick={() => toggleCompare(stock.ticker)}
                    >
                      {stock.name}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <aside className="panel detail">
              {selectedStock ? (
                <>
                  <div className="panel-head">
                    <p className="label">종목 상세</p>
                    <h2>{selectedStock.name}</h2>
                    <p className="subtle">
                      {selectedStock.ticker} · {selectedStock.sector} · {selectedStock.market}
                    </p>
                  </div>

                  <div className="price-box">
                    <div>
                      <p className="price">{formatPrice(selectedStock.price, selectedStock.market)}</p>
                      <p className={selectedStock.changePct < 0 ? "down" : "up"}>
                        {formatPercent(selectedStock.changePct)}
                      </p>
                    </div>
                    <div className="meta-grid">
                      <div>
                        <span>시가총액</span>
                        <strong>{selectedStock.marketCap}</strong>
                      </div>
                      <div>
                        <span>PBR</span>
                        <strong>{selectedStock.pbr.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span>ROE</span>
                        <strong>{selectedStock.roe.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span>배당수익률</span>
                        <strong>{selectedStock.dividendYield.toFixed(1)}%</strong>
                      </div>
                    </div>
                  </div>

                  <div className="tabs">
                    <span className="tab active">요약</span>
                    <span className="tab">재무</span>
                    <span className="tab">차트</span>
                    <span className="tab">뉴스/공시</span>
                    <span className="tab">Agent 메모</span>
                  </div>

                  <div className="detail-section">
                    <p className="field-title">검색 기준 충족 근거</p>
                    <ul className="bullet-list">
                      {buildCheckpoints(selectedStock, queryFilters).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="detail-section">
                    <p className="field-title">리스크 체크</p>
                    <ul className="bullet-list muted">
                      {selectedStock.risks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="detail-section">
                    <p className="field-title">비교 종목</p>
                    <div className="tag-list">
                      {compareStocks.length > 0 ? (
                        compareStocks.map((stock) => (
                          <span key={stock.ticker} className="tag">
                            {stock.name} · {formatPercent(stock.changePct)}
                          </span>
                        ))
                      ) : (
                        <span className="subtle">비교할 종목을 선택하세요.</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">선택된 종목이 없습니다.</div>
              )}
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}
