import Link from "next/link";

import { getMonitoringOverview } from "./monitoring/data";
import { PredictionPanels } from "./monitoring/prediction-panels";
import { formatDate, formatDateTime, formatPercent, formatRankChange, formatRatio } from "./monitoring/shared";

function MetricCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "up" | "down" }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function toSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
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

      <PredictionPanels
        currentSectors={overview.currentSectors}
        latestCurrentSectorTradeDate={overview.latestCurrentSectorTradeDate}
        topSectors={overview.topSectors}
        selectedSectorCode={overview.selectedSectorCode}
      />

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
