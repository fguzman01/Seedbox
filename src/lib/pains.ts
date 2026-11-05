import { z } from "zod";

/** Software verticals a pain can belong to (ADR-0002). Labels are shown in the UI. */
export const VERTICAL_LABELS = {
  smb: "Pymes",
  freelance: "Freelancers y agencias",
  devtools: "Herramientas para devs",
  productivity: "Productividad",
  finance: "Finanzas",
  health: "Salud",
  education: "Educación",
  marketing: "Marketing y ventas",
  ecommerce: "E-commerce",
  hr: "Recursos humanos",
  career: "Trabajo y carrera",
  legal: "Legal",
  real_estate: "Inmobiliario",
  logistics: "Logística",
  consumer: "Consumo personal",
  other: "Otro",
} as const;

export type Vertical = keyof typeof VERTICAL_LABELS;
export const VERTICALS = Object.keys(VERTICAL_LABELS) as [Vertical, ...Vertical[]];

/**
 * Kinds of pain (H17): a concrete task or situation that fails, or a latent, sustained need
 * without a failing task. The extraction does not produce a type yet (H18); evaluation labels do.
 */
export const PAIN_TYPES = ["concrete", "latent"] as const;
export type PainType = (typeof PAIN_TYPES)[number];
export const PAIN_TYPE_LABELS = { concrete: "Concreto", latent: "Latente" } as const;

/** A pain without a type is read as concrete, so data labeled before H17 keeps its meaning. */
export function painType(pain: { type?: PainType | null }): PainType {
  return pain.type ?? "concrete";
}

export const INTENSITIES = ["low", "medium", "high"] as const;
export const WILLINGNESS_TO_PAY = ["none", "implied", "explicit"] as const;

export const INTENSITY_LABELS = { low: "Leve", medium: "Moderado", high: "Fuerte" } as const;
export const WTP_LABELS = { none: null, implied: "Pago implícito", explicit: "Pagaría" } as const;

export const extractedPainSchema = z.object({
  description: z
    .string()
    .describe("The problem in one or two sentences, written in Spanish, without proposing a solution."),
  persona: z.string().describe("Who suffers it, in Spanish (e.g. 'dueños de agencias pequeñas')."),
  quote: z
    .string()
    .describe("A short verbatim excerpt from the post, in its original language, proving the pain."),
  vertical: z.enum(VERTICALS),
  intensity: z.enum(INTENSITIES).describe("How strongly the author feels the pain."),
  willingness_to_pay: z
    .enum(WILLINGNESS_TO_PAY)
    .describe("explicit: says they pay or would pay; implied: already spends time/money on it."),
});

export const extractionSchema = z.object({
  pains: z.array(extractedPainSchema),
});

export type ExtractedPain = z.infer<typeof extractedPainSchema>;
