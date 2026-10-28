import { z } from "zod";

/** Validation for note text; no database imports, so client components can use it. */
export const MAX_NOTE_LENGTH = 5000;

export const noteBodySchema = z
  .string()
  .trim()
  .min(1, "La nota está vacía.")
  .max(MAX_NOTE_LENGTH, `La nota no puede superar ${MAX_NOTE_LENGTH} caracteres.`);
