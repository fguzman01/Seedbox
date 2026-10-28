import { createHackerNewsAdapter } from "./hackernews";
import type { SourceAdapter } from "./types";

const factories: Record<string, () => SourceAdapter> = {
  hackernews: () => createHackerNewsAdapter(),
};

export const SOURCE_IDS = Object.keys(factories);

export function getSource(id: string): SourceAdapter {
  const factory = factories[id];
  if (!factory) {
    throw new Error(`Unknown source "${id}". Available: ${SOURCE_IDS.join(", ")}`);
  }
  return factory();
}
