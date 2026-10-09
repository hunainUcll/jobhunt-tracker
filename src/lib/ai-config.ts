import { z } from "zod";
export const CLASSIFICATIONS = [
  "APPLICATION_CONFIRMATION",
  "RECRUITER_REPLY",
  "INTERVIEW",
  "ASSESSMENT",
  "REJECTION",
  "OFFER",
  "FOLLOW_UP",
  "UNKNOWN",
] as const;
export const DEFAULT_AI_CONFIG = {
  enabled: false,
  url: "http://localhost:11434",
  model: "qwen2.5:3b",
  confidenceThreshold: 0.7,
};
export type LocalAiConfig = typeof DEFAULT_AI_CONFIG;
export function validateOllamaUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Use an HTTP localhost URL without credentials, paths, or query parameters.",
    );
  }
  // Pin localhost to a loopback address rather than relying on DNS or proxies.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}
export const localAiSettingsSchema = z.object({
  enabled: z.boolean(),
  url: z
    .string()
    .trim()
    .max(200)
    .refine((v) => {
      try {
        validateOllamaUrl(v);
        return true;
      } catch {
        return false;
      }
    }, "Only HTTP loopback Ollama URLs are allowed."),
  model: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/, "Invalid model name.")
    .refine(
      (v) => !/(?:cloud|https?:\/\/)/i.test(v),
      "Cloud models are not allowed.",
    ),
  confidenceThreshold: z
    .number()
    .finite()
    .min(0.7, "The minimum confidence threshold is 0.70.")
    .max(1),
});
export const localClassificationSchema = z
  .object({
    isJobRelated: z.boolean(),
    company: z.string().trim().min(1).max(200).nullable(),
    role: z.string().trim().min(1).max(250).nullable(),
    status: z.enum(CLASSIFICATIONS),
    confidence: z.number().finite().min(0).max(1),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .refine(
    (v) => v.isJobRelated || v.status === "UNKNOWN",
    "Non-job emails must have UNKNOWN status.",
  );
export type LocalClassification = z.infer<typeof localClassificationSchema>;
export function configFromSettings(
  settings: {
    localAiEnabled: boolean;
    ollamaUrl: string;
    ollamaModel: string;
    aiConfidenceThreshold: number;
  } | null,
): LocalAiConfig {
  return settings
    ? {
        enabled: settings.localAiEnabled,
        url: settings.ollamaUrl,
        model: settings.ollamaModel,
        confidenceThreshold: Math.max(0.7, settings.aiConfidenceThreshold),
      }
    : { ...DEFAULT_AI_CONFIG };
}
