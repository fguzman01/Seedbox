import { describe, expect, it } from "vitest";
import {
  axisScores,
  DEFAULT_WEIGHTS,
  frequencyScore,
  isDefaultWeights,
  parseWeights,
  serializeWeights,
  totalScore,
  type AxisScores,
  type EvidenceCounts,
} from "./scoring";

const evidence: EvidenceCounts = {
  authorCount: 3,
  intensityLow: 1,
  intensityMedium: 1,
  intensityHigh: 2,
  willingnessNone: 2,
  willingnessImplied: 1,
  willingnessExplicit: 1,
};

describe("frequencyScore", () => {
  it("grows logarithmically and saturates at 10 authors", () => {
    expect([0, 1, 3, 5, 10, 50].map(frequencyScore)).toEqual([0, 2.9, 5.8, 7.5, 10, 10]);
  });
});

describe("axisScores", () => {
  it("derives evidence axes from pain counts and passes market scores through", () => {
    expect(axisScores(evidence, { competitionScore: 7, buildabilityScore: 4 })).toEqual({
      frequency: 5.8,
      intensity: 7.3, // (3 + 6 + 10 + 10) / 4
      willingness: 4, // (0 + 0 + 6 + 10) / 4
      competition: 7,
      buildability: 4,
    });
  });

  it("leaves unassessed and evidence-less axes empty", () => {
    const empty = { ...evidence, intensityLow: 0, intensityMedium: 0, intensityHigh: 0 };
    const axes = axisScores(empty, { competitionScore: null, buildabilityScore: null });
    expect(axes.intensity).toBeNull();
    expect(axes.competition).toBeNull();
    expect(axes.buildability).toBeNull();
  });

  it("clamps market scores to 0–10", () => {
    const axes = axisScores(evidence, { competitionScore: 12, buildabilityScore: -1 });
    expect([axes.competition, axes.buildability]).toEqual([10, 0]);
  });
});

describe("totalScore", () => {
  const full: AxisScores = { frequency: 10, intensity: 5, willingness: 10, competition: 0, buildability: 10 };

  it("is the weighted average of all axes", () => {
    // (10*25 + 5*20 + 10*25 + 0*15 + 10*15) / 100
    expect(totalScore(full, DEFAULT_WEIGHTS)).toEqual({ total: 7.5, partial: false });
  });

  it("renormalizes over available axes and marks the total as partial", () => {
    const partial = { ...full, competition: null, buildability: null };
    // (10*25 + 5*20 + 10*25) / 70
    expect(totalScore(partial, DEFAULT_WEIGHTS)).toEqual({ total: 8.6, partial: true });
  });

  it("is not partial when the missing axes have zero weight", () => {
    const partial = { ...full, competition: null };
    expect(totalScore(partial, { ...DEFAULT_WEIGHTS, competition: 0 }).partial).toBe(false);
  });

  it("reorders opportunities when the weights change", () => {
    const loud: AxisScores = { frequency: 10, intensity: 10, willingness: 2, competition: 5, buildability: 5 };
    const paying: AxisScores = { frequency: 3, intensity: 5, willingness: 10, competition: 5, buildability: 5 };
    const moneyFirst = { ...DEFAULT_WEIGHTS, frequency: 5, intensity: 5, willingness: 50 };
    expect(totalScore(loud, DEFAULT_WEIGHTS).total).toBeGreaterThan(totalScore(paying, DEFAULT_WEIGHTS).total);
    expect(totalScore(paying, moneyFirst).total).toBeGreaterThan(totalScore(loud, moneyFirst).total);
  });
});

describe("weights in the URL", () => {
  it("round-trips", () => {
    const weights = { ...DEFAULT_WEIGHTS, willingness: 40 };
    expect(parseWeights(serializeWeights(weights))).toEqual(weights);
    expect(serializeWeights(DEFAULT_WEIGHTS)).toBe("25,20,25,15,15");
  });

  it("falls back to the defaults on missing or invalid input", () => {
    for (const bad of [undefined, "", "1,2,3", "a,b,c,d,e", "-5,20,25,15,15", "0,0,0,0,0", "200,1,1,1,1"]) {
      expect(parseWeights(bad)).toEqual(DEFAULT_WEIGHTS);
    }
  });

  it("uses the first value when the parameter is repeated", () => {
    expect(parseWeights(["10,10,10,10,10", "1,1,1,1,1"]).frequency).toBe(10);
  });

  it("detects the default weights", () => {
    expect(isDefaultWeights(DEFAULT_WEIGHTS)).toBe(true);
    expect(isDefaultWeights({ ...DEFAULT_WEIGHTS, frequency: 30 })).toBe(false);
  });
});
