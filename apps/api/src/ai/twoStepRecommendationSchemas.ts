import { z } from "zod";

export const TwoStepSourceKindSchema = z.enum(["pdf", "html", "image", "text", "unknown"]);
export const TwoStepConfidenceSchema = z.enum(["high", "medium", "low"]);
export const TwoStepCommittedConfidenceSchema = z.enum(["high", "medium"]);

const OptionalNullableStringSchema = z.string().trim().min(1).nullable().optional();
const RequiredNullableStringSchema = z.string().trim().min(1).nullable();
const AttributionEvidenceSourceSchema = z.enum(["name", "description"]).nullable().optional();

export const TwoStepProfileSafetySchema = z.object({
  hasKnownConflict: z.boolean(),
  uncertainForAllergy: z.boolean(),
  conflictReason: OptionalNullableStringSchema,
  checkedAgainst: z.array(z.string().trim().min(1)).optional()
});

export const TwoStepMenuSourceInputSchema = z.object({
  kind: TwoStepSourceKindSchema,
  text: z.string().optional(),
  urls: z.array(z.string().trim().min(1)).optional(),
  sourceUrl: OptionalNullableStringSchema,
  sourceLabel: OptionalNullableStringSchema,
  mainAiInputMode: z.enum(["extracted_text", "pdf_file_fallback"]).optional(),
  extractedTextCharCount: z.number().optional(),
  pdfFallbackReason: z.string().trim().min(1).optional(),
  pdfTextQuality: z.object({
    usableForAnalysis: z.boolean(),
    textLength: z.number(),
    dishCount: z.number(),
    priceCount: z.number(),
    score: z.number(),
    baseScore: z.number()
  }).optional()
});

export const MainDishAIRecommendationSchema = z.object({
  rank: z.number(),
  nameOriginal: z.string().trim().min(1),
  translatedName: z.string().trim().min(1),
  descriptionOriginal: OptionalNullableStringSchema,
  translatedDescription: OptionalNullableStringSchema,
  priceRaw: RequiredNullableStringSchema,
  sourceEvidence: OptionalNullableStringSchema,
  sourceKind: TwoStepSourceKindSchema.optional(),
  sourceUrl: OptionalNullableStringSchema,
  sourceCategoryOriginal: OptionalNullableStringSchema,
  matchedPreferenceValue: OptionalNullableStringSchema,
  profileEvidence: OptionalNullableStringSchema,
  evidenceSource: AttributionEvidenceSourceSchema,
  reason: z.string().trim().min(1),
  confidence: TwoStepConfidenceSchema,
  profileSafety: TwoStepProfileSafetySchema
});

export const MainDishAISafeCandidateRecommendationPayloadSchema = z.object({
  nameOriginal: z.string().trim().min(1).optional(),
  translatedName: z.string().trim().min(1).optional(),
  descriptionOriginal: OptionalNullableStringSchema,
  translatedDescription: OptionalNullableStringSchema,
  priceRaw: RequiredNullableStringSchema,
  sourceEvidence: OptionalNullableStringSchema,
  sourceKind: TwoStepSourceKindSchema.optional(),
  sourceUrl: OptionalNullableStringSchema,
  sourceCategoryOriginal: OptionalNullableStringSchema,
  matchedPreferenceValue: OptionalNullableStringSchema,
  profileEvidence: OptionalNullableStringSchema,
  evidenceSource: AttributionEvidenceSourceSchema,
  reason: z.string().trim().min(1).optional(),
  confidence: TwoStepConfidenceSchema.optional(),
  profileSafety: TwoStepProfileSafetySchema.optional()
});

export const MainDishAIAnalyzedDishSchema = z.object({
  nameOriginal: z.string().trim().min(1),
  descriptionOriginal: OptionalNullableStringSchema,
  price: RequiredNullableStringSchema,
  detectedConflicts: z.array(z.string().trim().min(1)),
  isSafe: z.boolean()
});

export const MainDishAIRemovedDishSchema = z.object({
  nameOriginal: z.string().trim().min(1),
  matchedProfileValue: z.string().trim().min(1),
  profileEvidence: OptionalNullableStringSchema,
  evidenceSource: AttributionEvidenceSourceSchema,
  reason: z.string().trim().min(1)
});

export const MainDishAISafeCandidateSchema = z.object({
  nameOriginal: z.string().trim().min(1),
  descriptionOriginal: OptionalNullableStringSchema,
  scoreReason: z.string().trim().min(1),
  translatedName: z.string().trim().min(1).optional(),
  translatedDescription: OptionalNullableStringSchema,
  priceRaw: RequiredNullableStringSchema,
  sourceEvidence: OptionalNullableStringSchema,
  sourceKind: TwoStepSourceKindSchema.optional(),
  sourceUrl: OptionalNullableStringSchema,
  sourceCategoryOriginal: OptionalNullableStringSchema,
  matchedPreferenceValue: OptionalNullableStringSchema,
  profileEvidence: OptionalNullableStringSchema,
  evidenceSource: AttributionEvidenceSourceSchema,
  confidence: TwoStepConfidenceSchema.optional(),
  profileSafety: TwoStepProfileSafetySchema.optional(),
  recommendationPayload: MainDishAISafeCandidateRecommendationPayloadSchema.optional()
});

export const MainDishAIResultSummarySchema = z.object({
  allDishCount: z.number(),
  removedDishCount: z.number(),
  safeCandidateCount: z.number(),
  recommendationCount: z.number(),
  lessThanThreeReason: OptionalNullableStringSchema
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
  allDishes: z.array(MainDishAIAnalyzedDishSchema),
  removedDishes: z.array(MainDishAIRemovedDishSchema),
  safeCandidates: z.array(MainDishAISafeCandidateSchema),
  recommendations: z.array(MainDishAIRecommendationSchema).max(3)
    .refine((values) => values.length <= 3, "Main AI must not return more than 3 recommendations"),
  resultSummary: MainDishAIResultSummarySchema
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
export type MainDishAISafeCandidateRecommendationPayload = z.infer<typeof MainDishAISafeCandidateRecommendationPayloadSchema>;
export type MainDishAIAnalyzedDish = z.infer<typeof MainDishAIAnalyzedDishSchema>;
export type MainDishAIRemovedDish = z.infer<typeof MainDishAIRemovedDishSchema>;
export type MainDishAISafeCandidate = z.infer<typeof MainDishAISafeCandidateSchema>;
export type MainDishAIResultSummary = z.infer<typeof MainDishAIResultSummarySchema>;
export type CommittedMainDishRecommendation = z.infer<typeof CommittedMainDishRecommendationSchema>;
export type RejectedMainDishRecommendation = z.infer<typeof RejectedMainDishRecommendationSchema>;
export type MainDishCommitResult = z.infer<typeof MainDishCommitResultSchema>;
export type StarterAIRecommendation = z.infer<typeof StarterAIRecommendationSchema>;
export type CommittedStarterRecommendation = z.infer<typeof CommittedStarterRecommendationSchema>;
export type RejectedStarterRecommendation = z.infer<typeof RejectedStarterRecommendationSchema>;
export type StarterCommitResult = z.infer<typeof StarterCommitResultSchema>;
