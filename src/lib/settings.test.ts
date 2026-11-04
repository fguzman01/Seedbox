import { describe, expect, it } from "vitest";
import { ingestMinAgeHours, maxNewPerFeed, maxPendingDays } from "./settings";

describe("work and ingest settings", () => {
  it("uses the ADR-0009 defaults when unset or invalid", () => {
    expect(maxPendingDays({})).toBe(14);
    expect(ingestMinAgeHours({})).toBe(24);
    expect(maxNewPerFeed({})).toBe(25);
    expect(maxPendingDays({ SEEDBOX_MAX_PENDING_DAYS: "soon" })).toBe(14);
    expect(ingestMinAgeHours({ SEEDBOX_INGEST_MIN_AGE_HOURS: "-1" })).toBe(24);
    expect(maxNewPerFeed({ SEEDBOX_MAX_NEW_PER_FEED: "0" })).toBe(25);
    expect(maxNewPerFeed({ SEEDBOX_MAX_NEW_PER_FEED: " " })).toBe(25);
  });

  it("reads configured values", () => {
    expect(maxPendingDays({ SEEDBOX_MAX_PENDING_DAYS: "7" })).toBe(7);
    expect(ingestMinAgeHours({ SEEDBOX_INGEST_MIN_AGE_HOURS: "0" })).toBe(0);
    expect(maxNewPerFeed({ SEEDBOX_MAX_NEW_PER_FEED: "10.7" })).toBe(10);
  });
});
