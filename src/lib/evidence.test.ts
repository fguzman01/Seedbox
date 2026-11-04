import { describe, expect, it } from "vitest";
import { isWeakEvidence, meetsMinAuthors, weakEvidenceExplanation } from "./evidence";

describe("weak evidence", () => {
  it("marks opportunities with fewer than two distinct authors", () => {
    expect(isWeakEvidence(0)).toBe(true);
    expect(isWeakEvidence(1)).toBe(true);
    expect(isWeakEvidence(2)).toBe(false);
    expect(isWeakEvidence(10)).toBe(false);
  });

  it("explains why, distinguishing a single author from no identifiable author", () => {
    expect(weakEvidenceExplanation(1)).toMatch(/^Sólo una persona/);
    expect(weakEvidenceExplanation(0)).toMatch(/^Ninguna de sus señales tiene un autor/);
    expect(weakEvidenceExplanation(1)).toContain("otro autor distinto");
  });
});

describe("meetsMinAuthors", () => {
  it("treats 1 as no filter and the others as a lower bound", () => {
    expect(meetsMinAuthors(0, 1)).toBe(true);
    expect(meetsMinAuthors(1, 2)).toBe(false);
    expect(meetsMinAuthors(2, 2)).toBe(true);
    expect(meetsMinAuthors(2, 3)).toBe(false);
    expect(meetsMinAuthors(7, 3)).toBe(true);
  });
});
