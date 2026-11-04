import { describe, expect, it } from "vitest";
import { attributionFor, licenseUrl } from "./attribution";
import { feedLabel, feedOf, sourceLabel } from "./types";

const question = {
  source: "stackexchange",
  url: "https://money.stackexchange.com/questions/170001/split-bills",
  author: "Ana López",
  sourceMetadata: {
    site: "money",
    ownerLink: "https://money.stackexchange.com/users/4242/ana",
    license: "CC BY-SA 3.0",
  },
};

describe("attributionFor", () => {
  it("credits the question, author with profile, site and license with link", () => {
    expect(attributionFor(question)).toEqual({
      questionUrl: "https://money.stackexchange.com/questions/170001/split-bills",
      author: "Ana López",
      authorUrl: "https://money.stackexchange.com/users/4242/ana",
      site: "money.stackexchange.com",
      license: "CC BY-SA 3.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    });
  });

  it("keeps only the name of a deleted user and points to the licensing help without a license", () => {
    expect(
      attributionFor({ ...question, author: "user98765", sourceMetadata: { site: "money", ownerLink: null } }),
    ).toMatchObject({ author: "user98765", authorUrl: null, license: "CC BY-SA", licenseUrl: "https://stackoverflow.com/help/licensing" });
  });

  it("is not needed for other sources", () => {
    expect(attributionFor({ source: "hackernews", url: "https://news.ycombinator.com/item?id=1" })).toBeNull();
    expect(attributionFor({ source: "reddit", url: "https://www.reddit.com/r/x", sourceMetadata: { license: "CC BY-SA 4.0" } })).toBeNull();
  });
});

describe("licenseUrl", () => {
  it("links each CC BY-SA version", () => {
    expect(licenseUrl("CC BY-SA 2.5")).toBe("https://creativecommons.org/licenses/by-sa/2.5/");
    expect(licenseUrl("CC BY-SA 4.0")).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(licenseUrl("MIT")).toBeNull();
    expect(licenseUrl(null)).toBeNull();
  });
});

describe("feeds and labels", () => {
  it("reads the feed from the subreddit or the site", () => {
    expect(feedOf({ subreddit: "SaaS" })).toBe("SaaS");
    expect(feedOf({ site: "money" })).toBe("money");
    expect(feedOf({ points: 3 })).toBeNull();
    expect(feedOf(null)).toBeNull();
    expect(feedLabel("reddit", "SaaS")).toBe("r/SaaS");
    expect(feedLabel("stackexchange", "money")).toBe("money");
  });

  it("labels Stack Exchange items with the site's domain", () => {
    expect(sourceLabel("stackexchange", question.sourceMetadata, question.url)).toBe("money.stackexchange.com");
    expect(sourceLabel("stackexchange", { site: "money" })).toBe("money");
    expect(sourceLabel("stackexchange", null)).toBe("stackexchange");
  });
});
