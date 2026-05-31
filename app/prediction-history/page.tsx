import Link from "next/link";

import { getPredictionHistoryDetail } from "../monitoring/data";
import { formatDate, formatPercent, formatRatio } from "../monitoring/shared";

type PredictionHistoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MetricSeriesPoint = {
  predictionDate: string;
  value: number | null;
};

function toPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function buildMetricChart(points: MetricSeriesPoint[], width: number, height: number) {
  const padding = { top: 20, right: 14, bottom: 28, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const validValues = points.map((point) => point.value).filter((value): value is number => value !== null);
  const min = validValues.length > 0 ? Math.min(...validValues) : 0;
  const max = validValues.length > 0 ? Math.max(...validValues) : 1;
  const range = Math.max(max - min, 0.0001);

  const chartPoints = points
    .map((point, index) => {
      if (point.value === null) {
        return null;
      }

      return {
        x: padding.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * innerWidth),
        y: padding.top + (1 - (point.value - min) / range) * innerHeight,
        predictionDate: point.predictionDate,
        value: point.value,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);

  return {
    padding,
    chartPoints,
    min,
    max,
    mid: min + (max - min) / 2,
    path: toPath(chartPoints),
  };
}

function HistoryMetricChart({
  title,
  caption,
  color,
  points,
  formatter,
}: {
  title: string;
  caption: string;
  color: string;
  points: MetricSeriesPoint[];
  formatter: (value: number | null | undefined) => string;
}) {
  const width = 1040;
  const height = 220;
  const chart = buildMetricChart(points, width, height);
  const firstDate = points[0]?.predictionDate ?? null;
  const lastDate = points.at(-1)?.predictionDate ?? null;

  return (
    <div className="trend-chart-wrap">
      <div className="legend-row">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: color }} />
          {title}
        </span>
      </div>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        {[chart.max, chart.mid, chart.min].map((tick) => {
          const y =
            chart.padding.top +
            (1 - (tick - chart.min) / Math.max(chart.max - chart.min, 0.0001)) *
              (height - chart.padding.top - chart.padding.bottom);

          return (
            <g key={`${title}-${tick}`}>
              <line
                x1={chart.padding.left}
                y1={y}
                x2={width - chart.padding.right}
                y2={y}
                stroke="#eef1e8"
                strokeWidth="1"
              />
              <text x={12} y={y + 4} fontSize="10" fill="#647066">
                {formatter(tick)}
              </text>
            </g>
          );
        })}

        <path d={chart.path} fill="none" stroke={color} strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />

        {chart.chartPoints[0] ? <circle cx={chart.chartPoints[0].x} cy={chart.chartPoints[0].y} r="3" fill={color} /> : null}
        {chart.chartPoints.at(-1) ? <circle cx={chart.chartPoints.at(-1)!.x} cy={chart.chartPoints.at(-1)!.y} r="3" fill={color} /> : null}

        {firstDate ? (
          <text x={chart.padding.left} y={16} fontSize="8" fill="#647066">
            {firstDate}
          </text>
        ) : null}
        {lastDate ? (
          <text x={width - chart.padding.right - 70} y={16} fontSize="8" fill="#647066">
            {lastDate}
          </text>
        ) : null}
      </svg>
      <p className="chart-caption">{caption}</p>
    </div>
  );
}

function formatStatus(hitFlag: number | null, evaluated: boolean) {
  if (!evaluated) {
    return "Pending";
  }

  return hitFlag === 1 ? "Hit" : "Miss";
}

export default async function PredictionHistoryPage({ searchParams }: PredictionHistoryPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const dateParam = Array.isArray(resolvedSearchParams.date) ? resolvedSearchParams.date[0] : resolvedSearchParams.date;
  const requestedDate =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : null;
  const detail = await getPredictionHistoryDetail(requestedDate);
  const sectorBuckets = detail.probabilityBuckets.filter((row) => row.entityType === "sector");
  const stockBuckets = detail.probabilityBuckets.filter((row) => row.entityType === "stock");
  const sectorRanks = detail.rankDiagnostics.filter((row) => row.entityType === "sector").slice(0, 5);
  const stockRanks = detail.rankDiagnostics.filter((row) => row.entityType === "stock").slice(0, 10);

  return (
    <main className="monitor-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">History</p>
          <h1>Prediction history detail</h1>
          <p className="hero-copy">
            Predicted probability and realized 5-day return are shown separately. The charts aggregate daily
            prediction rows from the active sector and stock models.
          </p>
        </div>
        <div className="hero-meta">
          <span>active sector model</span>
          <strong>{detail.activeSectorModelVersion ?? "-"}</strong>
          <small>Active stock model {detail.activeStockModelVersion ?? "-"}</small>
        </div>
      </section>

      <section className="page-actions">
        <Link className="detail-link" href="/">
          Back to monitoring
        </Link>
      </section>

      <section className="detail-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Diagnostics</p>
              <h2>Miss analysis</h2>
              <small>Use these summaries first before changing features or model class. The goal is to find where misses are concentrated.</small>
            </div>
          </div>

          <div className="detail-grid">
            <div className="table-block">
              <div className="table-row header diagnostics-row">
                <span>Bucket</span>
                <span>Type</span>
                <span>Rows</span>
                <span>Hit ratio</span>
                <span>Avg return</span>
              </div>
              {[...sectorBuckets, ...stockBuckets].map((row) => (
                <div className="table-row diagnostics-row" key={`${row.entityType}-${row.bucketLabel}`}>
                  <span>{row.bucketLabel}</span>
                  <span>{row.entityType}</span>
                  <span>{row.rowCount}</span>
                  <span>{formatRatio(row.hitRatio)}</span>
                  <span>{formatPercent(row.avgExcessReturn5d)}</span>
                </div>
              ))}
            </div>

            <div className="table-block">
              <div className="table-row header diagnostics-row">
                <span>Rank</span>
                <span>Type</span>
                <span>Rows</span>
                <span>Hit ratio</span>
                <span>Avg return</span>
              </div>
              {[...sectorRanks, ...stockRanks].map((row) => (
                <div className="table-row diagnostics-row" key={`${row.entityType}-${row.predictedRank}`}>
                  <span>P.Rank {row.predictedRank}</span>
                  <span>{row.entityType}</span>
                  <span>{row.rowCount}</span>
                  <span>{formatRatio(row.hitRatio)}</span>
                  <span>{formatPercent(row.avgExcessReturn5d)}</span>
                </div>
              ))}
            </div>

            <div className="table-block">
              <div className="table-row header weak-sector-row">
                <span>Weak sector</span>
                <span>Rows</span>
                <span>Hit ratio</span>
                <span>Avg return</span>
              </div>
              {detail.weakSectors.map((row) => (
                <div className="table-row weak-sector-row" key={row.sectorName}>
                  <span>{row.sectorName}</span>
                  <span>{row.rowCount}</span>
                  <span>{formatRatio(row.hitRatio)}</span>
                  <span>{formatPercent(row.avgExcessReturn5d)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Sector</p>
              <h2>Sector prediction history</h2>
              <small>Top 5 sector predictions aggregated by prediction date.</small>
            </div>
          </div>
          <div className="detail-grid">
            <HistoryMetricChart
              title="Predicted probability"
              caption="Average predicted 5-day upside probability for daily top sector picks."
              color="#c43b2f"
              points={detail.sectorSeries.map((row) => ({
                predictionDate: row.predictionDate,
                value: row.avgPredictedProbability,
              }))}
              formatter={formatRatio}
            />
            <HistoryMetricChart
              title="Realized return"
              caption="Average realized 5-day return after the prediction date. Pending dates remain empty until evaluation is available."
              color="#17211d"
              points={detail.sectorSeries.map((row) => ({
                predictionDate: row.predictionDate,
                value: row.avgActualExcessReturn5d,
              }))}
              formatter={formatPercent}
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Stock</p>
              <h2>Stock prediction history</h2>
              <small>Top 20 stock predictions aggregated by prediction date.</small>
            </div>
          </div>
          <div className="detail-grid">
            <HistoryMetricChart
              title="Predicted probability"
              caption="Average predicted 5-day upside probability for daily top stock picks."
              color="#c43b2f"
              points={detail.stockSeries.map((row) => ({
                predictionDate: row.predictionDate,
                value: row.avgPredictedProbability,
              }))}
              formatter={formatRatio}
            />
            <HistoryMetricChart
              title="Realized return"
              caption="Average realized 5-day return after the prediction date. Pending dates remain empty until evaluation is available."
              color="#17211d"
              points={detail.stockSeries.map((row) => ({
                predictionDate: row.predictionDate,
                value: row.avgActualExcessReturn5d,
              }))}
              formatter={formatPercent}
            />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Rows</p>
              <h2>Accumulated prediction rows</h2>
              <small>
                {detail.selectedPredictionDate
                  ? `Prediction rows for ${detail.selectedPredictionDate} with prediction and realized outcome separated.`
                  : "Latest 400 prediction rows with prediction and realized outcome separated."}
              </small>
            </div>
            <form className="history-filter-form" method="get">
              <label className="history-filter-label" htmlFor="prediction-date">
                Prediction date
              </label>
              <div className="history-filter-controls">
                <select id="prediction-date" name="date" defaultValue={detail.selectedPredictionDate ?? ""}>
                  <option value="">Latest rows</option>
                  {detail.availablePredictionDates.map((predictionDate) => (
                    <option key={predictionDate} value={predictionDate}>
                      {predictionDate}
                    </option>
                  ))}
                </select>
                <button type="submit">Apply</button>
              </div>
            </form>
          </div>
          <div className="table-block">
            <div className="table-row header prediction-history-detail-row">
              <span>Date</span>
              <span>Type</span>
              <span>Name</span>
              <span>Pred.</span>
              <span>Actual</span>
              <span>Status</span>
            </div>
            {detail.rows.length > 0 ? (
              detail.rows.map((row) => (
                <div className="table-row prediction-history-detail-row" key={`${row.predictionDate}-${row.entityType}-${row.entityKey}-${row.modelVersion}`}>
                  <span>{formatDate(row.predictionDate)}</span>
                  <span>
                    <strong>{row.entityType}</strong>
                    <small>P.Rank {row.predictedRank}</small>
                  </span>
                  <span>
                    <strong>{row.displayName}</strong>
                    <small>{row.entityType === "stock" ? row.sectorName ?? "-" : row.entityKey}</small>
                  </span>
                  <span>{formatRatio(row.predictedProbability)}</span>
                  <span>{row.evaluated ? formatPercent(row.actualExcessReturn5d) : "-"}</span>
                  <span>
                    <strong>{formatStatus(row.hitFlag, row.evaluated)}</strong>
                    <small>{row.modelVersion}</small>
                  </span>
                </div>
              ))
            ) : (
              <div className="table-empty">No prediction rows found for the selected date.</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
