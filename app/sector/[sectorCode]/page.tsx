import Link from "next/link";
import { notFound } from "next/navigation";

import { getSectorDetail } from "../../monitoring/data";
import { formatDate, formatDateTime, formatPercent, formatRatio } from "../../monitoring/shared";

type ChartPoint = {
  x: number;
  y: number;
  tradeDate: string;
  cumulativeIndex: number;
};

function addBusinessDays(dateText: string | null, businessDays: number) {
  if (!dateText) {
    return null;
  }

  const cursor = new Date(`${dateText}T00:00:00`);
  let added = 0;

  while (added < businessDays) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }

  return cursor.toISOString().slice(0, 10);
}

function toPath(points: ChartPoint[]) {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function buildChartPoints(values: Array<{ tradeDate: string; cumulativeIndex: number }>, width: number, height: number) {
  const padding = { top: 28, right: 20, bottom: 32, left: 76 };
  const innerWidth = (width - padding.left - padding.right) * 0.9;
  const innerHeight = height - padding.top - padding.bottom;
  const min = Math.min(...values.map((entry) => entry.cumulativeIndex));
  const max = Math.max(...values.map((entry) => entry.cumulativeIndex));
  const range = Math.max(max - min, 0.0001);

  return values.map((entry, index) => ({
    tradeDate: entry.tradeDate,
    cumulativeIndex: entry.cumulativeIndex,
    x: padding.left + (values.length <= 1 ? 0 : (index / (values.length - 1)) * innerWidth),
    y: padding.top + (1 - (entry.cumulativeIndex - min) / range) * innerHeight,
  }));
}

export default async function SectorDetailPage({
  params,
}: {
  params: Promise<{ sectorCode: string }>;
}) {
  const { sectorCode } = await params;
  const detail = await getSectorDetail(decodeURIComponent(sectorCode));

  if (!detail) {
    notFound();
  }

  const chartWidth = 1040;
  const chartHeight = 360;
  const chartPaddingBottom = 32;
  const chartPaddingLeft = 76;
  const chartPaddingTop = 28;
  const chartPaddingRight = 20;
  const innerWidth = chartWidth - chartPaddingLeft - chartPaddingRight;
  const historyWidth = innerWidth * 0.9;
  const points = buildChartPoints(detail.history, chartWidth, chartHeight);
  const fullPath = toPath(points);
  const startPoint = points[0] ?? null;
  const endPoint = points.at(-1) ?? null;
  const forecastEndDate = addBusinessDays(detail.latestPredictionDate, 5);
  const forecastStartPoint = endPoint;
  const forecastEndPoint = endPoint
    ? {
        ...endPoint,
        x: chartPaddingLeft + innerWidth,
      }
    : null;
  const forecastWindowWidth = forecastStartPoint && forecastEndPoint ? Math.max(0, forecastEndPoint.x - forecastStartPoint.x) : 0;

  const guideLineY1 = chartPaddingTop;
  const guideLineY2 = chartHeight - chartPaddingBottom;
  const yAxisValues = (() => {
    const values = detail.history.map((entry) => entry.cumulativeIndex);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mid = min + (max - min) / 2;
    return [
      { label: max.toFixed(1), y: chartPaddingTop },
      { label: mid.toFixed(1), y: chartPaddingTop + (guideLineY2 - chartPaddingTop) / 2 },
      { label: min.toFixed(1), y: guideLineY2 },
    ];
  })();

  return (
    <main className="monitor-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Sector Detail</p>
          <h1>{detail.sectorName}</h1>
          <p className="hero-copy">
            This view shows the full cumulative sector trend from the first stored trade date to the latest trade date.
            The black line is realized history. The red segment marks the next 5-trading-day forecast horizon starting
            from the latest prediction date.
          </p>
        </div>
        <div className="hero-meta">
          <span>Sector code</span>
          <strong>{detail.sectorCode}</strong>
          <small>Active model {detail.activeSectorModelVersion ?? "-"}</small>
        </div>
      </section>

      <section className="page-actions">
        <Link className="detail-link" href={`/?sector=${encodeURIComponent(detail.sectorCode)}`}>
          Back to monitoring
        </Link>
      </section>

      <section className="detail-grid">
        <div className="detail-metrics">
          <div className="metric-card">
            <span>market</span>
            <strong>{detail.market ?? "-"}</strong>
          </div>
          <div className="metric-card">
            <span>5-day outperformance probability</span>
            <strong className={(detail.latestPredictionProbability ?? 0) >= 0.5 ? "up" : "down"}>
              {formatRatio(detail.latestPredictionProbability)}
            </strong>
          </div>
          <div className="metric-card">
            <span>latest rank</span>
            <strong>{detail.latestPredictionRank === null ? "-" : String(detail.latestPredictionRank)}</strong>
          </div>
          <div className="metric-card">
            <span>latest evaluated excess</span>
            <strong className={(detail.latestEvaluatedExcessReturn ?? 0) >= 0 ? "up" : "down"}>
              {formatPercent(detail.latestEvaluatedExcessReturn)}
            </strong>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Trend</p>
              <h2>Cumulative sector path</h2>
              <small>
                Latest prediction date {formatDate(detail.latestPredictionDate)}. Red segment marks the next 5-trading-day
                prediction window through {formatDate(forecastEndDate)}.
              </small>
            </div>
          </div>

          <div className="trend-chart-wrap">
            <div className="legend-row">
              <span className="legend-item">
                <span className="legend-swatch" />
                Historical realized path
              </span>
              <span className="legend-item">
                <span className="legend-swatch prediction" />
                Forecast horizon (T+1 to T+5)
              </span>
            </div>

            <svg
              className="trend-chart"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label={`${detail.sectorName} cumulative trend chart`}
            >
              {forecastStartPoint && forecastEndPoint ? (
                <rect
                  x={forecastStartPoint.x}
                  y={guideLineY1}
                  width={forecastWindowWidth}
                  height={guideLineY2 - guideLineY1}
                  fill="rgba(196, 59, 47, 0.08)"
                />
              ) : null}

              {yAxisValues.map((tick) => (
                <g key={`${detail.sectorCode}-${tick.label}-${tick.y}`}>
                  <line
                    x1={chartPaddingLeft}
                    y1={tick.y}
                    x2={chartWidth - chartPaddingRight}
                    y2={tick.y}
                    stroke="#eef1e8"
                    strokeWidth="1"
                  />
                  <text x={16} y={tick.y + 4} fontSize="10" fill="#647066">
                    {tick.label}
                  </text>
                </g>
              ))}

              {startPoint ? (
                <line
                  x1={startPoint.x}
                  y1={guideLineY1}
                  x2={startPoint.x}
                  y2={guideLineY2}
                  stroke="#9aa49a"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                />
              ) : null}
              {endPoint ? (
                <line
                  x1={endPoint.x}
                  y1={guideLineY1}
                  x2={endPoint.x}
                  y2={guideLineY2}
                  stroke="#9aa49a"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                />
              ) : null}
              {forecastStartPoint ? (
                <line
                  x1={forecastStartPoint.x}
                  y1={guideLineY1}
                  x2={forecastStartPoint.x}
                  y2={guideLineY2}
                  stroke="#c43b2f"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                />
              ) : null}
              {forecastEndPoint ? (
                <line
                  x1={forecastEndPoint.x}
                  y1={guideLineY1}
                  x2={forecastEndPoint.x}
                  y2={guideLineY2}
                  stroke="#c43b2f"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                />
              ) : null}

              <path d={fullPath} fill="none" stroke="#17211d" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
              {forecastStartPoint && forecastEndPoint ? (
                <path
                  d={`M ${forecastStartPoint.x.toFixed(2)} ${forecastStartPoint.y.toFixed(2)} L ${forecastEndPoint.x.toFixed(2)} ${forecastStartPoint.y.toFixed(2)}`}
                  fill="none"
                  stroke="#c43b2f"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}

              {startPoint ? <circle cx={startPoint.x} cy={startPoint.y} r="3" fill="#17211d" /> : null}
              {endPoint ? <circle cx={endPoint.x} cy={endPoint.y} r="3" fill="#17211d" /> : null}
              {forecastStartPoint ? <circle cx={forecastStartPoint.x} cy={forecastStartPoint.y} r="4" fill="#c43b2f" /> : null}
              {forecastEndPoint ? <circle cx={forecastEndPoint.x} cy={forecastEndPoint.y} r="4" fill="#c43b2f" /> : null}

              {startPoint ? (
                <text x={Math.max(8, startPoint.x + 8)} y={16} fontSize="6" fill="#647066">
                  {startPoint.tradeDate}
                </text>
              ) : null}
              {endPoint ? (
                <text x={Math.max(8, endPoint.x - 96)} y={16} fontSize="6" fill="#647066">
                  {endPoint.tradeDate}
                </text>
              ) : null}
              {forecastStartPoint ? (
                <text x={Math.max(8, forecastStartPoint.x + 8)} y={34} fontSize="6" fill="#c43b2f">
                  prediction window
                </text>
              ) : null}
              {forecastStartPoint && forecastEndPoint ? (
                <>
                  <text
                    x={forecastStartPoint.x + 10}
                    y={58}
                    fontSize="14"
                    fontWeight="700"
                    fill="#c43b2f"
                  >
                    {`P = ${formatRatio(detail.latestPredictionProbability)}`}
                  </text>
                  <text
                    x={forecastStartPoint.x + 10}
                    y={76}
                    fontSize="11"
                    fill="#c43b2f"
                  >
                    5-day excess return &gt; 0
                  </text>
                </>
              ) : null}
              {forecastStartPoint ? (
                <text x={Math.max(8, forecastStartPoint.x - 38)} y={chartHeight - 10} fontSize="6" fill="#c43b2f">
                  {formatDate(detail.latestPredictionDate)}
                </text>
              ) : null}
              {forecastEndPoint ? (
                <text x={Math.max(8, forecastEndPoint.x - 54)} y={chartHeight - 10} fontSize="6" fill="#c43b2f">
                  {formatDate(forecastEndDate)}
                </text>
              ) : null}
            </svg>

            <p className="chart-caption">
              The black line is the realized cumulative sector index built from daily sector returns through the latest stored
              trade date. The red segment starts on {formatDate(detail.latestPredictionDate)}
              {detail.latestPredictionProbability !== null ? ` with predicted sector outperformance probability ${formatRatio(detail.latestPredictionProbability)}` : ""}
              {" "}and marks the next 5-trading-day forecast horizon through {formatDate(forecastEndDate)}. It is a horizon marker, not a projected price path.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Evaluation</p>
              <h2>Latest realized comparison</h2>
              <small>Most recent prediction window with realized 5-trading-day outcome.</small>
            </div>
          </div>
          <div className="detail-metrics">
            <div className="metric-card">
              <span>evaluated prediction date</span>
              <strong>{formatDate(detail.latestEvaluatedPredictionDate)}</strong>
            </div>
            <div className="metric-card">
              <span>predicted probability</span>
              <strong>{formatRatio(detail.latestEvaluatedProbability)}</strong>
            </div>
            <div className="metric-card">
              <span>realized excess</span>
              <strong className={(detail.latestEvaluatedExcessReturn ?? 0) >= 0 ? "up" : "down"}>
                {formatPercent(detail.latestEvaluatedExcessReturn)}
              </strong>
            </div>
            <div className="metric-card">
              <span>latest stored trade date</span>
              <strong>{formatDate(endPoint?.tradeDate ?? null)}</strong>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
