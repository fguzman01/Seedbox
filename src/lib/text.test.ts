import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText, quoteAppearsIn } from "./text";

describe("decodeEntities", () => {
  it("decodes numeric and named entities once", () => {
    expect(decodeEntities("&quot;Tom&#39;s&quot; &#x2F; &amp;lt;b&amp;gt; &hellip; &nbsp;x")).toBe(`"Tom's" / &lt;b&gt; …  x`);
  });

  it("leaves unknown or invalid entities as they are", () => {
    expect(decodeEntities("&bogus; &#0; AT&T")).toBe("&bogus; &#0; AT&T");
  });
});

describe("htmlToText", () => {
  it("converts Hacker News paragraphs, tags and entities", () => {
    expect(htmlToText("We&#x27;re <i>4</i> people.<p>$20&#x2F;month &amp; more")).toBe(
      "We're 4 people.\n\n$20/month & more",
    );
  });

  it("turns Stack Exchange blocks into lines, lists into dashes and drops images and URLs", () => {
    const html = [
      "<h2>Context</h2>",
      '<p>I use <a href="https://trello.com" rel="nofollow">Trello</a> daily.<br>Second line.</p>',
      "<ul>\n  <li>First</li>\n  <li>Second <em>item</em></li>\n</ul>",
      "<blockquote><p>Quoted text</p></blockquote>",
      "<hr>",
      "<pre><code>if (a &lt; b) {\n  run();\n}\n</code></pre>",
      '<p><img src="x.png" alt="pic"></p>',
    ].join("\n");
    expect(htmlToText(html)).toBe(
      "Context\n\nI use Trello daily.\nSecond line.\n\n- First\n- Second item\n\nQuoted text\n\nif (a < b) {\n  run();\n}",
    );
  });

  it("keeps markup shown inside code as text", () => {
    expect(htmlToText("<p>Use <code>&lt;div&gt;</code> here</p>")).toBe("Use <div> here");
  });
});

describe("quoteAppearsIn", () => {
  it("ignores case, whitespace and quote styles", () => {
    const post = { title: "Title", body: "I spend   every\nFriday “chasing” clients" };
    expect(quoteAppearsIn('I spend every Friday "chasing"', post)).toBe(true);
    expect(quoteAppearsIn("title", post)).toBe(true);
    expect(quoteAppearsIn("not there", post)).toBe(false);
    expect(quoteAppearsIn("  ", post)).toBe(false);
  });
});
