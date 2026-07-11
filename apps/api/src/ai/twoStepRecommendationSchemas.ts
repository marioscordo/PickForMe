import { z } from "zod";

export const TwoStepSourceKindSchema = z.enum(["pdf", "html", "image", "text", "unknown"]);
export const TwoStepConfidenceSchema = z.enum(["high", "medium", "low"]);
export const TwoStepCommittedConfidenceSchema = z.enum(["high", "medium"]);

const OptionalNullableStringSchema = z.string().trim().min(1).nullable().optional();

export const TwoStepProfileSafetySchema = z.object({
  hasKnownConflict: z.boolean(),
  uncertainForAllergy: z.boolean(),
  conflictReason: OptionalNullableStringSchema
});

export const TwoStepMenuSourceInputSchema = z.object({
  kind: TwoStepSourceKindSchema,
  text: z.string().optional(),
  urls: z.array(z.string().trim().min(1)).optional(),
  sourceUrl: OptionalNullableStringSchema,
  sourceLabel: OptionalNullableStringSchema
});

export const MainDishAIRecommendationSchema = z.object({
  rank: z.number(),
  nameOriginal: z.string().trim().min(1),
  translatedName: z.string().trim().min(1),
  descriptionOriginal: OptionalNullableStringSchema,
  translatedDescription: OptionalNullableStringSchema,
  priceRaw: OptionalNullableStringSchema,
  sourceEvidence: OptionalNullableStringSchema,
  sourceKind: TwoStepSourceKindSchema.optional(),
  sourceUrl: OptionalNullableStringSchema,
  sourceCategoryOriginal: OptionalNullableStringSchema,
  reason: z.string().trim().min(1),
  confidence: TwoStepConfidenceSchema,
  profileSafety: TwoStepProfileSafetySchema
});

export const CommittedMainDishRecommendationSchema = z.object({
  committed: z.literal(true),
  rank: z.number(),
  nameOriginal: z.string().trim().min(1),
  translatedName: z.string().trim().min(1),
  priceRaw: OptionalNullableStringSchema,
  sourceEvidence: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  confidence: TwoStepCommittedConfidenceSchema
});

export const RejectedMainDishRecommendationSchema = z.object({
  committed: z.literal(false),
  rank: z.number(),
  nameOriginal: z.string().trim().min(1).optional(),
  rejectionReason: z.string().trim().min(1)
});

export const MainDishCommitResultSchema = z.discriminatedUnion("committed", [
  CommittedMainDishRecommendationSchema,
  RejectedMainDishRecommendationSchema
]);

export const StarterAIRecommendationSchema = z.object({
  targetMainDishRank: z.number().optional(),
  targetMainDishNameOriginal: z.string().trim().min(1),
  nameOriginal: z.string().trim().min(1),
  translatedName: z.string().trim().min(1),
  priceRaw: OptionalNullableStringSchema,
  sourceEvidence: OptionalNullableStringSchema,
  sourceKind: TwoStepSourceKindSchema.optional(),
  sourceUrl: OptionalNullableStringSchema,
  sourceCategoryOriginal: OptionalNullableStringSchema,
  pairingReason: z.string().trim().min(1),
  confidence: TwoStepConfidenceSchema,
  profileSafety: TwoStepProfileSafetySchema
});

export const CommittedStarterRecommendationSchema = z.object({
  committed: z.literal(true),
  targetMainDishNameOriginal: z.string().trim().min(1),
  nameOriginal: z.string().trim().min(1),
  translatedName: z.string().trim().min(1),
  priceRaw: OptionalNullableStringSchema,
  sourceEvidence: z.string().trim().min(1),
  pairingReason: z.string().trim().min(1),
  confidence: TwoStepCommittedConfidenceSchema
});

export const RejectedStarterRecommendationSchema = z.object({
  committed: z.literal(false),
  targetMainDishNameOriginal: z.string().trim().min(1),
  nameOriginal: z.string().trim().min(1).optional(),
  rejectionReason: z.string().trim().min(1)
});

export const StarterCommitResultSchema = z.discriminatedUnion("committed", [
  CommittedStarterRecommendationSchema,
  RejectedStarterRecommendationSchema
]);

export const MainDishAIResponseSchema = z.object({
  recommendations: z.array(MainDishAIRecommendationSchema).max(3)
});

export const MainDishCommitResponseSchema = z.object({
  results: z.array(MainDishCommitResultSchema).max(3)
});

export const StarterAIResponseSchema = z.object({
  recommendation: StarterAIRecommendationSchema.nullable().optional()
});

export const StarterCommitResponseSchema = z.object({
  result: StarterCommitResultSchema
});

export type TwoStepSourceKind = z.infer<typeof TwoStepSourceKindSchema>;
export type TwoStepConfidence = z.infer<typeof TwoStepConfidenceSchema>;
export type TwoStepCommittedConfidence = z.infer<typeof TwoStepCommittedConfidenceSchema>;
export type TwoStepProfileSafety = z.infer<typeof TwoStepProfileSafetySchema>;
export type TwoStepMenuSourceInput = z.infer<typeof TwoStepMenuSourceInputSchema>;
export type MainDishAIRecommendation = z.infer<typeof MainDishAIRecommendationSchema>;
export type CommittedMainDishRecommendation = z.infer<typeof CommittedMainDishRecommendationSchema>;
export type RejectedMainDishRecommendation = z.infer<typeof RejectedMainDishRecommendationSchema>;
export type MainDishCommitResult = z.infer<typeof MainDishCommitResultSchema>;
export type StarterAIRecommendation = z.infer<typeof StarterAIRecommendationSchema>;
export type CommittedStarterRecommendation = z.infer<typeof CommittedStarterRecommendationSchema>;
export type RejectedStarterRecommendation = z.infer<typeof RejectedStarterRecommendationSchema>;
export type StarterCommitResult = z.infer<typeof StarterCommitResultSchema>;
