/** Opportunity scoring (ADR-0005). Every axis is 0–10; higher is better. */

export const AXES = ["frequency", "intensity", "willingness", "competition", "buildability"] as const;
export type Axis = (typeof AXES)[number];

export const AXIS_LABELS: Record<Axis, string> = {
  frequency: "Frecuencia",
  intensity: "Intensidad",
  willingness: "Disposición a pagar",
  competition: "Competencia",
  buildability: "Ajuste al constructor",
};

export type Weights = Record<Axis, number>;

/** Default weights from docs/VISION.md. */
export const DEFAULT_WEIGHTS: Weights = {
  frequency: 25,
  intensity: 20,
  willingness: 25,
  competition: 15,
  buildability: 15,
};

/** Pain counts per level, as aggregated from the evidence. */
export interface EvidenceCounts {
  authorCount: number;
  intensityLow: number;
  intensityMedium: number;
  intensityHigh: number;
  willingnessNone: number;
  willingnessImplied: number;
  willingnessExplicit: number;
}

/** Scores set by the AI assessment, or null when the opportunity was not assessed yet. */
export interface MarketScores {
  competitionScore: number | null;
  buildabilityScore: number | null;
}

export type AxisScores = Record<Axis, number | null>;

/** Number of distinct authors at which frequency reaches 10. */
const FREQUENCY_SATURATION = 10;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.min(10, Math.max(0, n));

/** Log scale, so the first people sharing a pain count more than the twentieth. */
export function frequencyScore(authors: number): number {
  if (authors <= 0) return 0;
  return round1(clamp((10 * Math.log(1 + authors)) / Math.log(1 + FREQUENCY_SATURATION)));
}

function weightedAverage(parts: [count: number, value: number][]): number | null {
  const total = parts.reduce((sum, [count]) => sum + count, 0);
  if (total === 0) return null;
  return round1(parts.reduce((sum, [count, value]) => sum + count * value, 0) / total);
}

export function axisScores(evidence: EvidenceCounts, market: MarketScores): AxisScores {
  return {
    frequency: frequencyScore(evidence.authorCount),
    intensity: weightedAverage([
      [evidence.intensityLow, 3],
      [evidence.intensityMedium, 6],
      [evidence.intensityHigh, 10],
    ]),
    willingness: weightedAverage([
      [evidence.willingnessNone, 0],
      [evidence.willingnessImplied, 6],
      [evidence.willingnessExplicit, 10],
    ]),
    competition: market.competitionScore === null ? null : clamp(market.competitionScore),
    buildability: market.buildabilityScore === null ? null : clamp(market.buildabilityScore),
  };
}

export interface TotalScore {
  total: number;
  /** True when some axis has no score yet and its weight was left out. */
  partial: boolean;
}

/** Weighted average over the axes that have a score, renormalizing the weights. */
export function totalScore(axes: AxisScores, weights: Weights): TotalScore {
  let weighted = 0;
  let weightSum = 0;
  let partial = false;
  for (const axis of AXES) {
    const score = axes[axis];
    if (score === null) {
      if (weights[axis] > 0) partial = true;
      continue;
    }
    weighted += score * weights[axis];
    weightSum += weights[axis];
  }
  return { total: weightSum === 0 ? 0 : round1(weighted / weightSum), partial };
}

/** Parses `?w=25,20,25,15,15`. Invalid input falls back to the defaults. */
export function parseWeights(param: string | string[] | undefined): Weights {
  const raw = Array.isArray(param) ? param[0] : param;
  const values = raw?.split(",").map(Number);
  if (!values || values.length !== AXES.length) return DEFAULT_WEIGHTS;
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return DEFAULT_WEIGHTS;
  if (values.every((v) => v === 0)) return DEFAULT_WEIGHTS;
  return Object.fromEntries(AXES.map((axis, i) => [axis, Math.round(values[i])])) as Weights;
}

export function serializeWeights(weights: Weights): string {
  return AXES.map((axis) => weights[axis]).join(",");
}

export function isDefaultWeights(weights: Weights): boolean {
  return AXES.every((axis) => weights[axis] === DEFAULT_WEIGHTS[axis]);
}
