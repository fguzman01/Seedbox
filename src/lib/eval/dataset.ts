import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { VERTICALS } from "../pains";

export const DEFAULT_DATASET_PATH = path.join("evals", "extraction", "dataset.jsonl");

/** A pain a human expects the extractor to find, identified by its quote in the post. */
export const expectedPainSchema = z.object({
  quote: z.string().min(1),
  vertical: z.enum(VERTICALS),
});

export const evalItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  body: z.string(),
  /** null = not labeled yet; [] = labeled as having no pains. */
  expected: z.array(expectedPainSchema).nullable(),
  notes: z.string().optional(),
});

export type ExpectedPain = z.infer<typeof expectedPainSchema>;
export type EvalItem = z.infer<typeof evalItemSchema>;
export type LabeledEvalItem = EvalItem & { expected: ExpectedPain[] };

export function isLabeled(item: EvalItem): item is LabeledEvalItem {
  return item.expected !== null;
}

export function parseDataset(content: string): EvalItem[] {
  return content
    .split("\n")
    .map((line, i) => [line.trim(), i + 1] as const)
    .filter(([line]) => line.length > 0)
    .map(([line, lineNumber]) => {
      try {
        return evalItemSchema.parse(JSON.parse(line));
      } catch (error) {
        throw new Error(`Invalid dataset line ${lineNumber}: ${(error as Error).message}`);
      }
    });
}

export function serializeDataset(items: EvalItem[]): string {
  return items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : "");
}

// The dataset is only read in development (labeling page) and by scripts, so the
// production build does not need to trace these paths.

/** Returns an empty dataset when the file does not exist yet. */
export async function loadDataset(file = DEFAULT_DATASET_PATH): Promise<EvalItem[]> {
  try {
    return parseDataset(await readFile(/*turbopackIgnore: true*/ file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function saveDataset(items: EvalItem[], file = DEFAULT_DATASET_PATH): Promise<void> {
  await writeFile(/*turbopackIgnore: true*/ file, serializeDataset(items), "utf8");
}
