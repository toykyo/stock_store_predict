"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type {
  CurrentSectorStatusRow,
  CurrentSectorStockRow,
  PredictedSectorStockRow,
  TopSectorPrediction,
} from "./shared";
import { formatDate, formatPercent, formatRankChange, formatRatio } from "./shared";

type Props = {
  currentSectors: CurrentSectorStatusRow[];
  latestCurrentSectorTradeDate: string | null;
  topSectors: TopSectorPrediction[];
  selectedSectorCode: string | null;
};

type DialogState =
  | { type: "current"; sectorCode: string; sectorName: string }
  | { type: "predicted"; sectorCode: string; sectorName: string }
  | null;

type DialogDataState =
  | { status: "idle"; rows: []; error: null }
  | { status: "loading"; rows: []; error: null }
  | { status: "loaded"; rows: CurrentSectorStockRow[] | PredictedSectorStockRow[]; error: null }
  | { status: "error"; rows: []; error: string };

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  if (value >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(1)}B`;
  }

  if (value >= 1_0000) {
    return `${(value / 1_0000).toFixed(0)}M`;
  }

  return value.toLocaleString("en-US");
}

function StockDialog({
  dialog,
  dataState,
  onClose,
}: {
  dialog: DialogState;
  dataState: DialogDataState;
  onClose: () => void;
}) {
  if (!dialog) {
    return null;
  }

  const title = dialog.type === "current" ? "Current sector constituents" : "Predicted stocks";
  const subtitle = dialog.type === "current"
    ? "Latest stored trade date constituent stocks"
    : "Latest active stock-model predictions inside this sector";

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div className="dialog-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{subtitle}</p>
            <h3>{title}</h3>
            <small>{dialog.sectorName}</small>
          </div>
          <button className="dialog-close" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {dataState.status === "loading" ? <div className="table-empty">Loading…</div> : null}
        {dataState.status === "error" ? <div className="table-empty">{dataState.error}</div> : null}
        {dataState.status === "loaded" && dataState.rows.length === 0 ? (
          <div className="table-empty">No rows available for this sector.</div>
        ) : null}

        {dataState.status === "loaded" && dataState.rows.length > 0 ? (
          dialog.type === "current" ? (
            <div className="table-block dialog-table">
              <div className="table-row header dialog-stock-row">
                <span>Ticker</span>
                <span>Stock</span>
                <span>Mkt</span>
                <span>Close</span>
                <span>1D Ret.</span>
                <span>T.Value</span>
                <span>M.Cap</span>
              </div>
              {(dataState.rows as CurrentSectorStockRow[]).map((row) => (
                <div className="table-row dialog-stock-row" key={row.ticker}>
                  <span>{row.ticker}</span>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{formatDate(row.tradeDate)}</small>
                  </span>
                  <span>{row.market ?? "-"}</span>
                  <span>{formatMoney(row.closePrice)}</span>
                  <span>{formatPercent(row.changeRate)}</span>
                  <span>{formatMoney(row.tradingValue)}</span>
                  <span>{formatMoney(row.marketCap)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-block dialog-table">
              <div className="table-row header dialog-prediction-row">
                <span>Rank</span>
                <span>Ticker</span>
                <span>Stock</span>
                <span>Sector</span>
                <span>Prob.</span>
              </div>
              {(dataState.rows as PredictedSectorStockRow[]).map((row) => (
                <div className="table-row dialog-prediction-row" key={`${row.ticker}-${row.rank}`}>
                  <span>{row.rank}</span>
                  <span>{row.ticker}</span>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{formatDate(row.predictionDate)}</small>
                  </span>
                  <span>{row.sectorName ?? dialog.sectorName}</span>
                  <span>{formatRatio(row.probability)}</span>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

export function PredictionPanels({
  currentSectors,
  latestCurrentSectorTradeDate,
  topSectors,
  selectedSectorCode,
}: Props) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [currentSearch, setCurrentSearch] = useState("");
  const [predictionSearch, setPredictionSearch] = useState("");
  const [dataState, setDataState] = useState<DialogDataState>({
    status: "idle",
    rows: [],
    error: null,
  });

  const normalizedCurrentSearch = currentSearch.trim().toLowerCase();
  const normalizedPredictionSearch = predictionSearch.trim().toLowerCase();

  const filteredCurrentSectors = normalizedCurrentSearch
    ? currentSectors.filter((row) => row.searchKeywords.toLowerCase().includes(normalizedCurrentSearch))
    : currentSectors;

  const filteredTopSectors = normalizedPredictionSearch
    ? topSectors.filter((row) => row.searchKeywords.toLowerCase().includes(normalizedPredictionSearch))
    : topSectors;

  const visibleCurrentSectors = normalizedCurrentSearch ? filteredCurrentSectors : filteredCurrentSectors.slice(0, 12);
  const visibleTopSectors = normalizedPredictionSearch ? filteredTopSectors : filteredTopSectors.slice(0, 12);

  useEffect(() => {
    if (!dialog) {
      setDataState({ status: "idle", rows: [], error: null });
      return;
    }

    const controller = new AbortController();
    const endpoint = dialog.type === "current"
      ? `/api/monitoring/current-sector-stocks?sector=${encodeURIComponent(dialog.sectorCode)}`
      : `/api/monitoring/predicted-stocks?sector=${encodeURIComponent(dialog.sectorCode)}`;

    setDataState({ status: "loading", rows: [], error: null });

    fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        return response.json();
      })
      .then((rows) => {
        setDataState({
          status: "loaded",
          rows: Array.isArray(rows) ? rows : [],
          error: null,
        });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") {
          return;
        }

        setDataState({
          status: "error",
          rows: [],
          error: "Unable to load rows for this sector.",
        });
      });

    return () => controller.abort();
  }, [dialog]);

  return (
    <>
      <section className="dashboard-grid dashboard-grid-double">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Latest actual sector move</p>
              <h2>Current sector status</h2>
              <small>Latest stored trade date {formatDate(latestCurrentSectorTradeDate)} 기준 실제 업종 순위입니다.</small>
            </div>
          </div>
          <div className="panel-search">
            <input
              className="panel-search-input"
              type="text"
              value={currentSearch}
              onChange={(event) => setCurrentSearch(event.target.value)}
              placeholder="Search sector or stock"
            />
          </div>
          <div className="table-block">
            <div className="table-row header current-sector-row">
              <span>C.Rank</span>
              <span>Sector</span>
              <span>Mkt</span>
              <span>1D Ret.</span>
            </div>
            {visibleCurrentSectors.map((row) => (
              <button
                className="table-row table-row-button current-sector-row"
                key={`current-${row.sectorCode}`}
                type="button"
                onClick={() => setDialog({ type: "current", sectorCode: row.sectorCode, sectorName: row.sectorName })}
              >
                <span>{row.currentRank}</span>
                <span>
                  <strong>{row.sectorName}</strong>
                  <small>{row.sectorCode}</small>
                  <small>{row.currentStockCount} stocks available</small>
                </span>
                <span>{row.market ?? "-"}</span>
                <span>{formatPercent(row.sectorReturn1d)}</span>
              </button>
            ))}
            {visibleCurrentSectors.length === 0 ? <div className="table-empty">No sectors match this search.</div> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Top sectors</p>
              <h2>Sector predictions</h2>
              <small>Click a sector row to open predicted stocks. Current rank is the latest realized sector rank based on the most recent stored trade date.</small>
            </div>
          </div>
          <div className="panel-search">
            <input
              className="panel-search-input"
              type="text"
              value={predictionSearch}
              onChange={(event) => setPredictionSearch(event.target.value)}
              placeholder="Search sector or stock"
            />
          </div>
          <div className="table-block">
            <div className="table-row header sector-prediction-row">
              <span>P.Rank</span>
              <span>Sector</span>
              <span>Prob.</span>
              <span>C.Rank</span>
              <span>R.Chg</span>
            </div>
            {visibleTopSectors.map((row) => (
              <button
                className={`table-row table-row-button sector-prediction-row ${selectedSectorCode === row.sectorCode ? "selected" : ""}`}
                key={`${row.sectorCode}-${row.modelVersion}`}
                type="button"
                onClick={() => setDialog({ type: "predicted", sectorCode: row.sectorCode, sectorName: row.sectorName })}
              >
                <span>{row.rank}</span>
                <span>
                  <strong>{row.sectorName}</strong>
                  <small>{row.modelVersion}</small>
                  <small>{row.predictedStockCount} stocks available</small>
                  <small className="row-actions">
                    <Link
                      className="row-action-button detail"
                      href={`/sector/${encodeURIComponent(row.sectorCode)}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      Detail
                    </Link>
                  </small>
                </span>
                <span>{formatRatio(row.probability)}</span>
                <span>
                  <strong>{row.currentRank ?? "-"}</strong>
                  <small>{formatDate(row.currentRankTradeDate)}</small>
                </span>
                <span>{formatRankChange(row.rank, row.previousRank)}</span>
              </button>
            ))}
            {visibleTopSectors.length === 0 ? <div className="table-empty">No sectors match this search.</div> : null}
          </div>
        </section>
      </section>

      <StockDialog dialog={dialog} dataState={dataState} onClose={() => setDialog(null)} />
    </>
  );
}
