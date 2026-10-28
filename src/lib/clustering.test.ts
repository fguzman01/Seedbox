import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createClaudeClusterer,
  resolveClustering,
  type ClusteringInput,
  type ClusteringOutput,
} from "./clustering";

const input: ClusteringInput = {
  opportunities: [{ id: 7, title: "Facturación cara para agencias", summary: "…" }],
  pains: [
    { id: 1, description: "Las herramientas de facturación son caras", persona: "agencias", quote: "too expensive", vertical: "freelance" },
    { id: 2, description: "Los clientes pagan tarde", persona: "freelancers", quote: "pay late", vertical: "finance" },
    { id: 3, description: "Cobrar a morosos toma horas", persona: "freelancers", quote: "chasing", vertical: "finance" },
  ],
};

function output(partial: Partial<ClusteringOutput>): ClusteringOutput {
  return { new_opportunities: [], assignments: [], ...partial };
}

describe("resolveClustering", () => {
  it("assigns pains to existing and new opportunities", () => {
    const resolved = resolveClustering(
      input,
      output({
        new_opportunities: [{ ref: "n1", title: " Clientes morosos ", summary: " Cobrar cuesta. " }],
        assignments: [
          { pain_id: 1, opportunity: "o7" },
          { pain_id: 2, opportunity: "n1" },
          { pain_id: 3, opportunity: "n1" },
        ],
      }),
    );

    expect(resolved.create).toEqual([{ ref: "n1", title: "Clientes morosos", summary: "Cobrar cuesta." }]);
    expect([...resolved.assign]).toEqual([
      [1, 7],
      [2, "n1"],
      [3, "n1"],
    ]);
    expect(resolved.unassigned).toEqual([]);
  });

  it("leaves pains with invalid, duplicate or missing assignments unassigned", () => {
    const resolved = resolveClustering(
      input,
      output({
        new_opportunities: [{ ref: "n1", title: "Morosos", summary: "…" }],
        assignments: [
          { pain_id: 1, opportunity: "o99" }, // unknown opportunity
          { pain_id: 2, opportunity: "n1" },
          { pain_id: 2, opportunity: "o7" }, // duplicate: first one wins
          { pain_id: 42, opportunity: "o7" }, // pain not in the batch
          // pain 3 missing
        ],
      }),
    );

    expect([...resolved.assign]).toEqual([[2, "n1"]]);
    expect(resolved.unassigned).toEqual([1, 3]);
  });

  it("skips new opportunities that are unused or have an empty title", () => {
    const resolved = resolveClustering(
      input,
      output({
        new_opportunities: [
          { ref: "n1", title: "Usada", summary: "…" },
          { ref: "n2", title: "Sin usar", summary: "…" },
          { ref: "n3", title: "  ", summary: "…" },
        ],
        assignments: [
          { pain_id: 1, opportunity: "n1" },
          { pain_id: 2, opportunity: "n3" },
        ],
      }),
    );

    expect(resolved.create.map((o) => o.ref)).toEqual(["n1"]);
    expect(resolved.unassigned).toEqual([2, 3]);
  });
});

describe("createClaudeClusterer", () => {
  const usage = { input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 800 };

  function fakeClient(response: { stop_reason: string; parsed_output: unknown }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const parse = vi.fn(async (_params: { model: string; output_config: { effort: string }; messages: { content: string }[] }) => ({ usage, ...response }));
    return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
  }

  it("sends the catalog and the batch, and returns the parsed output with usage", async () => {
    const parsed = output({ assignments: [{ pain_id: 1, opportunity: "o7" }] });
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: parsed });

    const result = await createClaudeClusterer({ client, model: "claude-opus-5-5" }).cluster(input);

    expect(result.output).toEqual(parsed);
    expect(result.usage).toEqual({ inputTokens: 2000, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 800 });
    const params = parse.mock.calls[0][0];
    expect(params.output_config.effort).toBe("medium");
    expect(params.messages[0].content).toContain('<opportunity id="o7">');
    expect(params.messages[0].content).toContain('<pain id="3" vertical="finance">');
  });

  it("marks an empty catalog explicitly", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: output({}) });
    await createClaudeClusterer({ client }).cluster({ ...input, opportunities: [] });
    expect(parse.mock.calls[0][0].messages[0].content).toContain("<catalog>\n(empty)\n</catalog>");
  });

  it("throws when the output cannot be parsed", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", parsed_output: null });
    await expect(createClaudeClusterer({ client }).cluster(input)).rejects.toThrow("max_tokens");
  });

  it("uses SEEDBOX_CLUSTERING_MODEL when no model is given", () => {
    vi.stubEnv("SEEDBOX_CLUSTERING_MODEL", "claude-sonnet-5-5");
    const { client } = fakeClient({ stop_reason: "end_turn", parsed_output: null });
    expect(createClaudeClusterer({ client }).model).toBe("claude-sonnet-5-5");
    vi.unstubAllEnvs();
  });
});
