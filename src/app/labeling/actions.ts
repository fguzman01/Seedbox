"use server";

import { notFound, redirect } from "next/navigation";
import { loadDataset, saveDataset, type ExpectedPain } from "@/lib/eval/dataset";
import { applyLabel, LabelError } from "@/lib/eval/labeling";

/** Saves a label and moves on to the next unlabeled post. Development only. */
export async function saveLabel(id: string, expected: ExpectedPain[], notes: string) {
  if (process.env.NODE_ENV === "production") notFound();

  try {
    const items = applyLabel(await loadDataset(), id, expected, notes);
    await saveDataset(items);
  } catch (error) {
    if (error instanceof LabelError) return { error: error.message };
    throw error;
  }
  redirect("/labeling");
}
