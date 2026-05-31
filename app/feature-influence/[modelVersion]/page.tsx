import Link from "next/link";
import { notFound } from "next/navigation";

import { getMonitoringOverview } from "../../monitoring/data";
import { formatDate, formatDateTime } from "../../monitoring/shared";

function formatFeatureLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("usdkrw", "USDKRW")
    .replaceAll("kr ", "KR ")
    .replaceAll("us ", "US ")
    .replaceAll("wti", "WTI")
    .replaceAll("sp500", "S&P500");
}

export default async function FeatureInfluenceDetailPage({
  params,
}: {
  params: Promise<{ modelVersion: string }>;
}) {
  const { modelVersion } = await params;
  const overview = await getMonitoringOverview();
  const model = overview.activeModels.find((entry) => entry.modelVersion === modelVersion);

  if (!model) {
    notFound();
  }

  return (
    <main className="monitor-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Model Interpretation</p>
          <h1>{model.modelType} feature influence</h1>
          <p className="hero-copy">
            This page shows the coefficient-based feature influence for the active {model.modelType} model. Positive
            weights increase the predicted probability, negative weights decrease it.
          </p>
        </div>
        <div className="hero-meta">
          <span>Model version</span>
          <strong>{model.modelVersion}</strong>
          <small>Created {formatDateTime(model.createdAt)}</small>
        </div>
      </section>

      <section className="page-actions">
        <Link className="detail-link" href="/">
          Back to monitoring
        </Link>
      </section>

      <section className="influence-page-grid">
        <article className="panel influence-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{model.algorithm}</p>
              <h2>{model.modelVersion}</h2>
            </div>
            <div className="influence-panel-meta">
              <span>{model.featureCount} features</span>
              <small>
                {formatDate(model.trainedFrom)} to {formatDate(model.trainedTo)}
              </small>
            </div>
          </div>

          <div className="model-grid">
            <article className="model-card">
              <dl>
                <div>
                  <dt>Accuracy</dt>
                  <dd>{model.accuracy === null ? "-" : `${(model.accuracy * 100).toFixed(1)}%`}</dd>
                </div>
                <div>
                  <dt>AUC</dt>
                  <dd>{model.auc === null ? "-" : model.auc.toFixed(3)}</dd>
                </div>
                <div>
                  <dt>Top bucket hit</dt>
                  <dd>{model.topBucketHitRatio === null ? "-" : `${(model.topBucketHitRatio * 100).toFixed(1)}%`}</dd>
                </div>
                <div>
                  <dt>Top bucket avg return</dt>
                  <dd>{model.topBucketAvgExcess === null ? "-" : `${model.topBucketAvgExcess >= 0 ? "+" : ""}${(model.topBucketAvgExcess * 100).toFixed(2)}%`}</dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="influence-table">
            <div className="table-row header">
              <span>Feature</span>
              <span>Direction</span>
              <span>Weight</span>
              <span>Magnitude</span>
            </div>
            {model.featureInfluences.map((feature) => (
              <div className="table-row influence-detail-row" key={`${model.modelVersion}-${feature.featureName}`}>
                <span>
                  <strong>{formatFeatureLabel(feature.featureName)}</strong>
                </span>
                <span className={feature.direction === "positive" ? "up" : "down"}>
                  {feature.direction === "positive" ? "positive" : "negative"}
                </span>
                <span className={feature.direction === "positive" ? "up" : "down"}>
                  {feature.weight >= 0 ? "+" : ""}
                  {feature.weight.toFixed(4)}
                </span>
                <span>
                  <div className="influence-bar-track">
                    <div
                      className={`influence-bar ${feature.direction}`}
                      style={{ width: `${Math.max(8, feature.normalizedMagnitude * 100)}%` }}
                    />
                  </div>
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
