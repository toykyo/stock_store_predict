function sigmoid(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, avg) {
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function aucScore(labels, scores) {
  const pairs = labels.map((label, index) => ({ label, score: scores[index] })).sort((a, b) => a.score - b.score);
  let negativeCount = 0;
  let positiveCount = 0;
  let rankSum = 0;

  pairs.forEach((pair, index) => {
    if (pair.label === 1) {
      positiveCount += 1;
      rankSum += index + 1;
    } else {
      negativeCount += 1;
    }
  });

  if (positiveCount === 0 || negativeCount === 0) {
    return null;
  }

  return (rankSum - positiveCount * (positiveCount + 1) / 2) / (positiveCount * negativeCount);
}

export function trainLogisticRegression(rows, featureNames, options = {}) {
  const learningRate = options.learningRate ?? 0.05;
  const iterations = options.iterations ?? 600;
  const l2 = options.l2 ?? 0.0005;
  const splitRatio = options.splitRatio ?? 0.8;
  const batchSize = options.batchSize ?? null;

  const filtered = rows.filter((row) => (
    row.label === 0 || row.label === 1
  ) && featureNames.every((name) => Number.isFinite(Number(row[name]))));

  if (filtered.length < 50) {
    throw new Error("Not enough rows to train logistic regression.");
  }

  const splitIndex = Math.max(20, Math.floor(filtered.length * splitRatio));
  const trainingRows = filtered.slice(0, splitIndex);
  const validationRows = filtered.slice(splitIndex);

  const means = {};
  const stds = {};

  for (const featureName of featureNames) {
    const values = trainingRows.map((row) => Number(row[featureName]));
    const avg = mean(values);
    const std = standardDeviation(values, avg);
    means[featureName] = avg;
    stds[featureName] = std > 0 ? std : 1;
  }

  const weights = new Array(featureNames.length).fill(0);
  let bias = 0;

  const effectiveBatchSize = Number.isFinite(batchSize) && batchSize > 0
    ? Math.min(Math.floor(batchSize), trainingRows.length)
    : trainingRows.length;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let startIndex = 0; startIndex < trainingRows.length; startIndex += effectiveBatchSize) {
      const endIndex = Math.min(startIndex + effectiveBatchSize, trainingRows.length);
      const gradient = new Array(featureNames.length).fill(0);
      let biasGradient = 0;

      for (let rowIndex = startIndex; rowIndex < endIndex; rowIndex += 1) {
        const row = trainingRows[rowIndex];
        let linear = bias;
        for (let index = 0; index < featureNames.length; index += 1) {
          const featureName = featureNames[index];
          const standardized = (Number(row[featureName]) - means[featureName]) / stds[featureName];
          linear += weights[index] * standardized;
        }

        const prediction = sigmoid(linear);
        const error = prediction - Number(row.label);
        biasGradient += error;

        for (let index = 0; index < featureNames.length; index += 1) {
          const featureName = featureNames[index];
          const standardized = (Number(row[featureName]) - means[featureName]) / stds[featureName];
          gradient[index] += error * standardized;
        }
      }

      const denominator = endIndex - startIndex;
      bias -= learningRate * (biasGradient / denominator);

      for (let index = 0; index < featureNames.length; index += 1) {
        weights[index] -= learningRate * ((gradient[index] / denominator) + l2 * weights[index]);
      }
    }
  }

  const model = {
    featureNames,
    means,
    stds,
    weights,
    bias,
  };

  const validationScores = validationRows.map((row) => predictProbability(model, row));
  const validationLabels = validationRows.map((row) => Number(row.label));
  const validationPredictions = validationScores.map((score) => (score >= 0.5 ? 1 : 0));
  const accuracy = validationRows.length === 0
    ? null
    : validationPredictions.filter((value, index) => value === validationLabels[index]).length / validationRows.length;

  const ranked = validationRows
    .map((row, index) => ({
      probability: validationScores[index],
      label: validationLabels[index],
      actualExcess: Number(row.actual_excess_return_5d ?? 0),
    }))
    .sort((left, right) => right.probability - left.probability);
  const topBucket = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.2)));
  const topBucketHitRatio = topBucket.length === 0
    ? null
    : topBucket.filter((row) => row.label === 1).length / topBucket.length;
  const topBucketAvgExcess = topBucket.length === 0
    ? null
    : topBucket.reduce((sum, row) => sum + row.actualExcess, 0) / topBucket.length;

  return {
    model,
    metrics: {
      trainingRows: trainingRows.length,
      validationRows: validationRows.length,
      accuracy,
      auc: validationRows.length > 1 ? aucScore(validationLabels, validationScores) : null,
      topBucketHitRatio,
      topBucketAvgExcess,
    },
  };
}

export function predictProbability(model, row) {
  let linear = model.bias;
  for (let index = 0; index < model.featureNames.length; index += 1) {
    const featureName = model.featureNames[index];
    const value = Number(row[featureName]);
    const standardized = (value - model.means[featureName]) / model.stds[featureName];
    linear += model.weights[index] * standardized;
  }

  return sigmoid(linear);
}
