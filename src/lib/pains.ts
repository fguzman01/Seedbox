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
  legal: "Legal",
  real_estate: "Inmobiliario",
  logistics: "Logística",
  consumer: "Consumo personal",
  other: "Otro",
} as const;

export type Vertical = keyof typeof VERTICAL_LABELS;
export const VERTICALS = Object.keys(VERTICAL_LABELS) as [Vertical, ...Vertical[]];

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
