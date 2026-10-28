import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createClaudeAssessor, normalizeAssessment, type AssessmentInput } from "./assessment";

const input: AssessmentInput = {
  title: "Facturación simple para agencias pequeñas",
  summary: "Las herramientas son caras o para contadores.",
  pains: [{ description: "Facturar es caro", persona: "agencias", quote: "too expensive" }],
};

const output = {
  competitors: [
    { name: "FreshBooks", url: "https://www.freshbooks.com", note: "Completo pero caro." },
    { name: "Sin link", url: "no es una url", note: "…" },
    { name: "Malicioso", url: "javascript:alert(1)", note: "…" },
  ],
  competition_score: 6.6,
  competition_rationale: " Hay opciones, pero caras. ",
  buildability_score: 9,
  buildability_rationale: "App web simple.",
};

const usage = { input_tokens: 5000, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

interface ParseParams {
  model: string;
  tools: { type: string; max_uses?: number }[];
  output_config: { effort: string };
  messages: { role: string; content: unknown }[];
}

function fakeClient(responses: { stop_reason: string; parsed_output: unknown; content?: unknown[] }[]) {
  const queue = [...responses];
  // Snapshot the messages: the assessor keeps appending to the same array.
  const calls: ParseParams[] = [];
  const parse = vi.fn(async (params: ParseParams) => {
    calls.push({ ...params, messages: [...params.messages] });
    return { usage, content: [], ...queue.shift()! };
  });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, calls };
}

describe("normalizeAssessment", () => {
  it("rounds and clamps scores, trims text and drops competitors without an http(s) link", () => {
    const assessment = normalizeAssessment({ ...output, buildability_score: 14 });
    expect(assessment).toEqual({
      competitionScore: 7,
      competitionRationale: "Hay opciones, pero caras.",
      competitors: [{ name: "FreshBooks", url: "https://www.freshbooks.com", note: "Completo pero caro." }],
      buildabilityScore: 10,
      buildabilityRationale: "App web simple.",
    });
  });
});

describe("createClaudeAssessor", () => {
  it("uses web search and medium effort, and returns the normalized assessment", async () => {
    const { client, calls } = fakeClient([{ stop_reason: "end_turn", parsed_output: output }]);

    const result = await createClaudeAssessor({ client, model: "claude-opus-5-5" }).assess(input);

    expect(result.assessment.competitionScore).toBe(7);
    expect(result.usage?.inputTokens).toBe(5000);
    expect(calls[0].tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]);
    expect(calls[0].output_config.effort).toBe("medium");
    expect(calls[0].messages[0].content).toContain("<title>Facturación simple para agencias pequeñas</title>");
    expect(calls[0].messages[0].content).toContain("Quote: too expensive");
  });

  it("can run without web search", async () => {
    const { client, calls } = fakeClient([{ stop_reason: "end_turn", parsed_output: output }]);
    await createClaudeAssessor({ client, webSearch: false }).assess(input);
    expect(calls[0].tools).toEqual([]);
  });

  it("resumes when the server-side search loop pauses, adding up usage", async () => {
    const paused = [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "invoicing" } }];
    const { client, calls } = fakeClient([
      { stop_reason: "pause_turn", parsed_output: null, content: paused },
      { stop_reason: "end_turn", parsed_output: output },
    ]);

    const result = await createClaudeAssessor({ client }).assess(input);

    expect(calls).toHaveLength(2);
    expect(calls[1].messages).toHaveLength(2);
    expect(calls[1].messages[1]).toEqual({ role: "assistant", content: paused });
    expect(result.usage?.inputTokens).toBe(10000);
  });

  it("gives up after too many pauses", async () => {
    const { client } = fakeClient(
      Array.from({ length: 5 }, () => ({ stop_reason: "pause_turn", parsed_output: null })),
    );
    await expect(createClaudeAssessor({ client }).assess(input)).rejects.toThrow("continuations");
  });

  it("throws when the output cannot be parsed", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal", parsed_output: null }]);
    await expect(createClaudeAssessor({ client }).assess(input)).rejects.toThrow("refusal");
  });

  it("uses SEEDBOX_ASSESSMENT_MODEL when no model is given", () => {
    vi.stubEnv("SEEDBOX_ASSESSMENT_MODEL", "claude-sonnet-5-5");
    const { client } = fakeClient([]);
    expect(createClaudeAssessor({ client }).model).toBe("claude-sonnet-5-5");
    vi.unstubAllEnvs();
  });
});
