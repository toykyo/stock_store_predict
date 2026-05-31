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

function formatHitFlag(hitFlag: number | null, evaluated: boolean) {
  if (!evaluated) {
    return "Pending";
  }

  return hitFlag === 1 ? "Hit" : "Miss";
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
                    <dt>Top bucket avg return</dt>
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
              <span>Avg return</span>
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

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Policy</p>
            <h2>Current policy and latest adjustments</h2>
            <small>Operational thresholds and recent manual tuning history should stay explicit as the model is adjusted over time.</small>
          </div>
        </div>
        <section className="dashboard-grid secondary">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Current policy</p>
                <h2>Active policy set</h2>
              </div>
            </div>
            <div className="table-block">
              <div className="table-row header policy-row">
                <span>Scope</span>
                <span>Policy</span>
                <span>Value</span>
                <span>Note</span>
              </div>
              {overview.currentPolicies.map((row) => (
                <div className="table-row policy-row" key={`${row.scope}-${row.policyKey}`}>
                  <span>{row.scope}</span>
                  <span>
                    <strong>{row.label}</strong>
                    <small>{row.policyKey}</small>
                  </span>
                  <span>{row.value}</span>
                  <span>{row.note ?? "-"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Adjustments</p>
                <h2>Latest adjustment log</h2>
              </div>
            </div>
            <div className="table-block">
              <div className="table-row header adjustment-row">
                <span>Date</span>
                <span>Scope</span>
                <span>Change</span>
                <span>Reason</span>
              </div>
              {overview.latestAdjustments.map((row) => (
                <div className="table-row adjustment-row" key={row.adjustmentId}>
                  <span>{formatDateTime(row.appliedAt)}</span>
                  <span>{row.adjustmentScope}</span>
                  <span>
                    <strong>{row.policyKey}</strong>
                    <small>{`${row.previousValue ?? "-"} -> ${row.newValue ?? "-"}`}</small>
                  </span>
                  <span>
                    <strong>{row.reason}</strong>
                    <small>{row.appliedBy}</small>
                  </span>
                </div>
              ))}
              {overview.latestAdjustments.length === 0 ? (
                <div className="table-empty">No adjustment log rows are recorded yet.</div>
              ) : null}
            </div>
          </section>
        </section>
      </section>

      <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">History</p>
              <h2>Prediction history</h2>
              <small>Recent sector and stock predictions joined with realized 5-day outcome when evaluation is available.</small>
            </div>
            <Link className="detail-link" href="/prediction-history">
              Detail
            </Link>
          </div>
          <div className="table-block">
          <div className="table-row header prediction-history-row">
            <span>Date</span>
            <span>Type</span>
            <span>Name</span>
            <span>Prob.</span>
            <span>Excess</span>
            <span>Status</span>
          </div>
          {overview.predictionHistory.map((row) => (
            <div className="table-row prediction-history-row" key={`${row.predictionDate}-${row.entityType}-${row.entityKey}-${row.modelVersion}`}>
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
                <strong>{formatHitFlag(row.hitFlag, row.evaluated)}</strong>
                <small>{row.modelVersion}</small>
              </span>
            </div>
          ))}
          {overview.predictionHistory.length === 0 ? (
            <div className="table-empty">No prediction history rows are available.</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
