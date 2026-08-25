const DEFAULT_SKEW = 1;
const TWO_PI = 2 * Math.PI;
const NO_CLAMP = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY };

const runningTotals = (weights) => {
  let running = 0;
  return weights.map((weight) => {
    running += weight;
    return running;
  });
};

const totalOf = (totals) => totals[totals.length - 1];

const firstTotalAbove = (totals, target) => {
  let low = 0;
  let high = totals.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (totals[middle] > target) {
      high = middle;
      continue;
    }
    low = middle + 1;
  }
  return low;
};

const indexByWeight = (totals, random) => firstTotalAbove(totals, random.next() * totalOf(totals));

const weightedPickFrom = (entries) => {
  const values = entries.map(({ value }) => value);
  const totals = runningTotals(entries.map(({ weight }) => weight));
  return (context) => values[indexByWeight(totals, context.random)];
};

const asEntries = (weights) => Object.entries(weights).map(([value, weight]) => ({ value, weight }));

const weightedPick = (weights) => weightedPickFrom(asEntries(weights));

const harmonicWeights = (ranks, skew) => Array.from({ length: ranks }, (_, index) => (index + 1) ** -skew);

const zipfInteger = (min, max, skew = DEFAULT_SKEW) => {
  const totals = runningTotals(harmonicWeights(max - min + 1, skew));
  return (context) => min + indexByWeight(totals, context.random);
};

// Box-Muller turns a pair of uniforms into a pair of standard normals. The first
// uniform is taken as 1 - next() because next() yields [0, 1) and the logarithm of
// zero is infinite. Only the cosine normal is kept: caching the sine one for the next
// call would make a value depend on how many values preceded it, and every generator
// here must draw the same numbers from the stream whatever else the row contains.
const standardNormal = (random) => Math.sqrt(-2 * Math.log(1 - random.next())) * Math.cos(TWO_PI * random.next());

const clampedTo = ({ min, max }, value) => Math.min(max, Math.max(min, value));

const normalInteger =
  (mean, stdDev, clamp = NO_CLAMP) =>
  (context) =>
    clampedTo(clamp, Math.round(mean + standardNormal(context.random) * stdDev));

module.exports = { normalInteger, weightedPick, weightedPickFrom, zipfInteger };
