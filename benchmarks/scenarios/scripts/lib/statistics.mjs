const DEFAULT_DECIMALS = 3;

export function summarizeSamples(
  input,
  {
    p99MinimumSamples = Number.POSITIVE_INFINITY,
    decimals = DEFAULT_DECIMALS,
  } = {},
) {
  const samples = validateSamples(input);
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    samples.length;
  const p99Available = samples.length >= p99MinimumSamples;

  return Object.freeze({
    count: samples.length,
    percentileMethod: 'nearest-rank',
    standardDeviationMethod: 'population',
    p50Ms: round(nearestRank(sorted, 0.5), decimals),
    p95Ms: round(nearestRank(sorted, 0.95), decimals),
    p99Ms: p99Available
      ? round(nearestRank(sorted, 0.99), decimals)
      : null,
    p99Status: p99Available ? 'available' : 'N/A: insufficient samples',
    p99ObservedSamples: samples.length,
    p99RequiredSamples: Number.isFinite(p99MinimumSamples)
      ? p99MinimumSamples
      : null,
    maxMs: round(sorted.at(-1), decimals),
    meanMs: round(mean, decimals),
    standardDeviationMs: round(Math.sqrt(variance), decimals),
  });
}

export function nearestRank(input, percentile) {
  const sorted = [...validateSamples(input)].sort((left, right) => left - right);
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new RangeError('percentile must be in (0, 1].');
  }
  const rank = Math.ceil(percentile * sorted.length) - 1;
  return sorted[Math.max(0, rank)];
}

export function thresholdVerdict(value, maximum) {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum < 0) {
    throw new TypeError('threshold values must be finite and non-negative.');
  }
  return Object.freeze({
    value,
    maximum,
    passed: value <= maximum,
  });
}

function validateSamples(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError('samples must be a non-empty array.');
  }
  for (const value of input) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError('samples must contain finite non-negative numbers.');
    }
  }
  return input;
}

function round(value, decimals) {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new RangeError('decimals must be an integer from 0 through 12.');
  }
  return Number(value.toFixed(decimals));
}
