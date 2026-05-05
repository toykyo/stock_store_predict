import Link from "next/link";

import { getMonitoringOverview } from "./monitoring/data";
import { formatDate, formatDateTime, formatPercent, formatRankChange, formatRatio } from "./monitoring/shared";

function MetricCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "up" | "down" }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>
  | undefined;

function toSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function HomePage({ searchParams }: { searchParams?: SearchParamsInput }) {
  const resolvedSearchParams = searchParams && typeof (searchParams as Promise<Record<string, string | string[] | undefined>>).then === "function"
    ? await searchParams
    : (searchParams ?? {});
  const selectedSectorCode = toSearchParamValue(resolvedSearchParams.sector);
  const overview = await getMonitoringOverview(selectedSectorCode);
  const latestPerformance = overview.performance.slice(0, 6);

  return (
    <main className="monitor-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Prediction Monitoring</p>
          <h1>KRX prediction operating console</h1>
          <p className="hero-copy">
            Source data is updated into PostgreSQL first. Sector snapshots, feature/target tables, baseline models,
            and prediction results are monitored here.
          </p>
        </div>
        <div className="hero-meta">
          <span>Latest prediction date</span>
          <strong>{formatDate(overview.latestPredictionDate)}</strong>
          <small>Last prediction run {formatDateTime(overview.dataStatus.latestPredictionRunAt)}</small>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="stock_master rows" value={String(overview.dataStatus.stockMasterCount)} />
        <MetricCard label="classified rows" value={String(overview.dataStatus.classifiedCount)} />
        <MetricCard
          label="missing classifications"
          value={String(overview.dataStatus.missingClassificationCount)}
          tone={overview.dataStatus.missingClassificationCount > 0 ? "down" : "neutral"}
        />
        <MetricCard label="latest stock date" value={formatDate(overview.dataStatus.latestStockTradeDate)} />
        <MetricCard label="latest market date" value={formatDate(overview.dataStatus.latestMarketTradeDate)} />
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Top sectors</p>
              <h2>Sector predictions</h2>
              <small>Click a sector to filter eligible stock predictions. Rank change means movement versus the previous prediction date.</small>
            </div>
          </div>
          <div className="table-block">
            <div className="table-row header">
              <span>Rank</span>
              <span>Sector</span>
              <span>Probability</span>
              <span>Prev rank change</span>
            </div>
            {overview.topSectors.map((row) => (
              <Link
                className={`table-row table-row-link ${overview.selectedSectorCode === row.sectorCode ? "selected" : ""}`}
                href={`/?sector=${encodeURIComponent(row.sectorCode)}`}
                key={`${row.sectorCode}-${row.modelVersion}`}
              >
                <span>{row.rank}</span>
                <span>
                  <strong>{row.sectorName}</strong>
                  <small>{row.modelVersion}</small>
                </span>
                <span>{formatRatio(row.probability)}</span>
                <span>{formatRankChange(row.rank, row.previousRank)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Stocks inside selected sectors</p>
              <h2>Stock predictions</h2>
              <small>
                {overview.selectedSectorName
                  ? `Selected sector: ${overview.selectedSectorName}. Only stocks that pass the current stock-model filters are shown.`
                  : "No sector selected"}
              </small>
            </div>
          </div>
          <div className="table-block">
            <div className="table-row header">
              <span>Rank</span>
              <span>Stock</span>
              <span>Sector</span>
              <span>Probability</span>
            </div>
            {overview.topStocks.length === 0 ? (
              <div className="table-empty">
                No eligible stock predictions for the selected sector. This usually means no stocks in this sector passed the current stock-model filters.
              </div>
            ) : (
              overview.topStocks.map((row) => (
                <div className="table-row" key={`${row.ticker}-${row.modelVersion}`}>
                  <span>{row.rank}</span>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.ticker}</small>
                  </span>
                  <span>{row.sectorName ?? "-"}</span>
                  <span>{formatRatio(row.probability)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </section>

      <section className="dashboard-grid secondary">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Models</p>
              <h2>Active model registry</h2>
            </div>
          </div>
          <div className="model-grid">
            {overview.activeModels.map((model) => (
              <article className="model-card" key={model.modelVersion}>
                <div className="model-card-header">
                  <strong>{model.modelType}</strong>
                  <span>{model.algorithm}</span>
                </div>
                <dl>
                  <div>
                    <dt>Version</dt>
                    <dd>{model.modelVersion}</dd>
                  </div>
                  <div>
                    <dt>Train window</dt>
                    <dd>{formatDate(model.trainedFrom)} to {formatDate(model.trainedTo)}</dd>
                  </div>
                  <div>
                    <dt>Features</dt>
                    <dd>{model.featureCount}</dd>
                  </div>
                  <div>
                    <dt>Accuracy</dt>
                    <dd>{formatRatio(model.accuracy)}</dd>
                  </div>
                  <div>
                    <dt>AUC</dt>
                    <dd>{model.auc === null ? "-" : model.auc.toFixed(3)}</dd>
                  </div>
                  <div>
                    <dt>Top bucket hit</dt>
                    <dd>{formatRatio(model.topBucketHitRatio)}</dd>
                  </div>
                  <div>
                    <dt>Top bucket avg excess</dt>
                    <dd>{formatPercent(model.topBucketAvgExcess)}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDateTime(model.createdAt)}</dd>
                  </div>
                </dl>
                <Link className="detail-link" href={`/feature-influence/${model.modelVersion}`}>
                  View feature influence
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Performance</p>
              <h2>Recent evaluation</h2>
            </div>
          </div>
          <div className="table-block">
            <div className="table-row header">
              <span>Date</span>
              <span>Type</span>
              <span>Hit ratio</span>
              <span>Avg excess</span>
            </div>
            {latestPerformance.map((row) => (
              <div className="table-row" key={`${row.predictionDate}-${row.entityType}-${row.modelVersion}`}>
                <span>{formatDate(row.predictionDate)}</span>
                <span>
                  <strong>{row.entityType}</strong>
                  <small>{row.modelVersion}</small>
                </span>
                <span>{formatRatio(row.hitRatio)}</span>
                <span>{formatPercent(row.avgExcessReturn)}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
