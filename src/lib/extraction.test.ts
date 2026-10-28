import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createClaudeExtractor, keepVerifiedPains, type ExtractionInput } from "./extraction";
import type { ExtractedPain } from "./pains";

const input: ExtractionInput = {
  source: "hackernews",
  title: "Ask HN: How do you manage invoices for a small agency?",
  body: "We're 4 people and still use spreadsheets.\n\nEvery tool I tried is either too expensive or built for accountants. I'd happily pay $20/month for something simple.",
};

const pain: ExtractedPain = {
  description: "Las agencias pequeñas no encuentran una herramienta de facturación simple y barata.",
  persona: "dueños de agencias pequeñas",
  quote: "Every tool I tried is either too expensive or built for accountants.",
  vertical: "freelance",
  intensity: "medium",
  willingness_to_pay: "explicit",
};

/** The subset of request params these tests inspect. */
interface ParseParams {
  model: string;
  fallbacks: unknown;
  output_config: { effort: string; format: { type: string } };
  system: { cache_control: unknown }[];
  messages: { content: string }[];
}

const usage = {
  input_tokens: 900,
  output_tokens: 150,
  cache_read_input_tokens: 600,
  cache_creation_input_tokens: 0,
};

function fakeClient(response: { stop_reason?: string; parsed_output?: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const parse = vi.fn(async (_params: ParseParams) => ({ usage, ...response }));
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

describe("keepVerifiedPains", () => {
  it("keeps pains whose quote appears in the post, ignoring case, spacing and quote style", () => {
    const quote = "we’re 4 PEOPLE   and still use spreadsheets.";
    expect(keepVerifiedPains(input, [{ ...pain, quote }])).toHaveLength(1);
  });

  it("drops pains with invented or empty quotes", () => {
    const invented = { ...pain, quote: "Invoicing takes me 10 hours a week." };
    const empty = { ...pain, quote: "  " };
    expect(keepVerifiedPains(input, [pain, invented, empty])).toEqual([pain]);
  });

  it("matches quotes taken from the title", () => {
    const fromTitle = { ...pain, quote: "How do you manage invoices for a small agency?" };
    expect(keepVerifiedPains(input, [fromTitle])).toHaveLength(1);
  });
});

describe("createClaudeExtractor", () => {
  it("sends the post with structured output, low effort and a cached system prompt", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: { pains: [pain] } });
    const extractor = createClaudeExtractor({ client, model: "claude-opus-5-5" });

    const result = await extractor.extract(input);

    expect(result).toEqual({
      pains: [pain],
      usage: { inputTokens: 900, outputTokens: 150, cacheReadTokens: 600, cacheWriteTokens: 0 },
    });
    const params = parse.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.fallbacks).toBe("default");
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages[0].content).toContain("<title>Ask HN: How do you manage invoices");
    expect(params.messages[0].content).toContain("I'd happily pay $20/month");
  });

  it("filters out pains with quotes not found in the post", async () => {
    const invented = { ...pain, quote: "made up" };
    const { client } = fakeClient({ stop_reason: "end_turn", parsed_output: { pains: [invented] } });
    expect((await createClaudeExtractor({ client }).extract(input)).pains).toEqual([]);
  });

  it("returns no pains when the model refuses", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
    expect((await createClaudeExtractor({ client }).extract(input)).pains).toEqual([]);
  });

  it("throws when the output cannot be parsed, so the signal is retried", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", parsed_output: null });
    await expect(createClaudeExtractor({ client }).extract(input)).rejects.toThrow("max_tokens");
  });

  it("uses SEEDBOX_EXTRACTION_MODEL when no model is given", () => {
    vi.stubEnv("SEEDBOX_EXTRACTION_MODEL", "claude-haiku-5-5");
    const { client } = fakeClient({});
    expect(createClaudeExtractor({ client }).model).toBe("claude-haiku-5-5");
    vi.unstubAllEnvs();
  });
});
