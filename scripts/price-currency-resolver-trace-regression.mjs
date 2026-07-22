import assert from "node:assert/strict";
import fs from "node:fs";

const {
  createPriceResolverDiagnostics,
  enrichPriceCompatibility,
  parsePriceParts
} = await import("../apps/api/src/recommendation/priceCompatibility.ts");

const originalFetch = globalThis.fetch;

function recommendation(priceRaw, rank = 1) {
  return {
    confidence: "high",
    nameOriginal: `Dish ${rank}`,
    priceRaw,
    profileSafety: {
      hasKnownConflict: false,
      uncertainForAllergy: false
    },
    rank,
    reason: "Reason",
    sourceEvidence: `Dish ${rank}`,
    translatedName: `Gericht ${rank}`
  };
}

function data(count) {
  return {
    dishes: Array.from({ length: count }, (_, index) => ({
      id: `dish_${index + 1}`,
      nameOriginal: `Dish ${index + 1}`,
      price: 12,
      sourceLine: `Dish ${index + 1}`
    })),
    recommendations: Array.from({ length: count }, (_, index) => ({
      dishId: `dish_${index + 1}`,
      reason: "Reason",
      translatedName: `Gericht ${index + 1}`
    }))
  };
}

async function enrich(priceRaws, options = {}) {
  return enrichPriceCompatibility({
    acceptedRecommendations: priceRaws.map((priceRaw, index) => recommendation(priceRaw, index + 1)),
    data: data(priceRaws.length),
    deviceLocale: options.deviceLocale ?? "de-DE",
    sourceContext: options.sourceContext,
    targetLocale: "de-DE"
  });
}

function assertCurrencyStable() {
  assert.equal(parsePriceParts("USD 100")?.currency, "USD");
  assert.equal(parsePriceParts("US$100")?.currency, "USD");
  assert.equal(parsePriceParts("MXN 100")?.currency, "MXN");
  assert.equal(parsePriceParts("MX$100")?.currency, "MXN");
  assert.equal(parsePriceParts("$295", undefined, "precios en pesos mexicanos")?.currency, "MXN");
  assert.equal(parsePriceParts("$295", undefined, "neutral menu context")?.currency, "UNKNOWN");
  assert.equal(parsePriceParts("EUR 10")?.currency, "EUR");
  assert.equal(parsePriceParts("CHF 10")?.currency, "CHF");
  assert.equal(parsePriceParts("GBP 10")?.currency, "GBP");
  assert.equal(parsePriceParts("RUB 10")?.currency, "RUB");
  assert.equal(parsePriceParts("INR 10")?.currency, "INR");
  assert.equal(parsePriceParts("EGP 10")?.currency, "EGP");
}

assertCurrencyStable();

const diagnostics = createPriceResolverDiagnostics();
assert.equal(parsePriceParts("US$100", undefined, undefined, diagnostics)?.currency, "USD");
assert.equal(diagnostics.priceResolverEvaluatedCount, 1);
assert.equal(diagnostics.priceResolverUsdCount, 1);
assert.equal(diagnostics.priceResolverExplicitCount, 1);
assert.equal(diagnostics.priceResolverContextCount, 0);

const mxnDiagnostics = createPriceResolverDiagnostics();
assert.equal(parsePriceParts("MX$100", undefined, undefined, mxnDiagnostics)?.currency, "MXN");
assert.equal(mxnDiagnostics.priceResolverEvaluatedCount, 1);
assert.equal(mxnDiagnostics.priceResolverMxnCount, 1);
assert.equal(mxnDiagnostics.priceResolverExplicitCount, 1);

const contextDiagnostics = createPriceResolverDiagnostics();
assert.equal(parsePriceParts("$295", undefined, "Carta: precios en pesos mexicanos", contextDiagnostics)?.currency, "MXN");
assert.equal(contextDiagnostics.priceResolverEvaluatedCount, 1);
assert.equal(contextDiagnostics.priceResolverMxnCount, 1);
assert.equal(contextDiagnostics.priceResolverContextCount, 1);
assert.equal(contextDiagnostics.priceResolverMexicanPesoMarkerCount, 1);
assert.equal(contextDiagnostics.priceResolverMexicoMarkerCount, 0);
assert.equal(contextDiagnostics.priceResolverMxDomainMarkerCount, 0);

const mexicoDiagnostics = createPriceResolverDiagnostics();
assert.equal(parsePriceParts("$295", undefined, "Carta Mexico", mexicoDiagnostics)?.currency, "MXN");
assert.equal(mexicoDiagnostics.priceResolverContextCount, 1);
assert.equal(mexicoDiagnostics.priceResolverMexicoMarkerCount, 1);

const mxDomainDiagnostics = createPriceResolverDiagnostics();
assert.equal(parsePriceParts("$295", undefined, "https://example.mx/carta", mxDomainDiagnostics)?.currency, "MXN");
assert.equal(mxDomainDiagnostics.priceResolverContextCount, 1);
assert.equal(mxDomainDiagnostics.priceResolverMxDomainMarkerCount, 1);

const unknownDiagnostics = createPriceResolverDiagnostics();
assert.equal(parsePriceParts("$295", undefined, "https://assets.zyrosite.com/menu.pdf", unknownDiagnostics)?.currency, "UNKNOWN");
assert.equal(unknownDiagnostics.priceResolverEvaluatedCount, 1);
assert.equal(unknownDiagnostics.priceResolverUnknownCount, 1);
assert.equal(unknownDiagnostics.priceResolverContextCount, 0);
assert.equal(unknownDiagnostics.priceResolverApproxMissingCount, 0);

let fetchCallCount = 0;
globalThis.fetch = async (value) => {
  fetchCallCount++;
  const url = String(value);
  const match = url.match(/\/v2\/rate\/([A-Z]{3})\/([A-Z]{3})$/);
  assert(match, `Unexpected fetch URL ${url}`);

  const rates = {
    MXN_EUR: 0.05,
    USD_EUR: 0.92
  };
  const rate = rates[`${match[1]}_${match[2]}`];

  if (!rate) {
    return {
      ok: false,
      status: 404,
      json: async () => ({})
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({ date: "2026-07-21", rate })
  };
};

const aggregate = await enrich(["US$100", "MX$100", "$295", undefined], {
  sourceContext: "Carta Mexico precios en pesos mexicanos https://example.mx/carta"
});

assert.equal(aggregate.priceResolverDiagnostics.priceResolverEvaluatedCount, 3);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverSkippedCount, 1);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverMxnCount, 2);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverUsdCount, 1);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverUnknownCount, 0);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverExplicitCount, 2);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverContextCount, 1);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverApproxGeneratedCount, 3);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverApproxMissingCount, 0);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverMexicoMarkerCount, 1);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverMexicanPesoMarkerCount, 1);
assert.equal(aggregate.priceResolverDiagnostics.priceResolverMxDomainMarkerCount, 1);
assert.equal(fetchCallCount, 2);
assert.equal(aggregate.dishes[2].priceDisplay, "MX$295");
assert.match(aggregate.dishes[2].priceApproxDisplay, /^ca\. /);

globalThis.fetch = async () => ({
  ok: false,
  status: 404,
  json: async () => ({})
});

const missingRate = await enrich(["CHF 295"]);

assert.equal(missingRate.dishes[0].priceCurrency, "CHF");
assert.equal(missingRate.priceResolverDiagnostics.priceResolverApproxGeneratedCount, 0);
assert.equal(missingRate.priceResolverDiagnostics.priceResolverApproxMissingCount, 1);
assert.equal(missingRate.dishes[0].priceDisplay, "CHF 295");
assert.equal(missingRate.dishes[0].priceApproxDisplay, undefined);

const unknown = await enrich(["$295"], {
  sourceContext: "https://assets.zyrosite.com/menu.pdf"
});

assert.equal(unknown.priceResolverDiagnostics.priceResolverUnknownCount, 1);
assert.equal(unknown.priceResolverDiagnostics.priceResolverApproxGeneratedCount, 0);
assert.equal(unknown.priceResolverDiagnostics.priceResolverApproxMissingCount, 0);
assert.equal(unknown.dishes[0].priceDisplay, "$295");
assert.equal(unknown.dishes[0].priceApproxDisplay, undefined);

globalThis.fetch = originalFetch;

const route = fs.readFileSync("apps/api/app/api/analyze-menu/route.ts", "utf8");
const priceEnrichmentCallStart = route.indexOf("const mapped = await enrichPriceCompatibility({");
const priceEnrichmentCallEnd = route.indexOf("  });", priceEnrichmentCallStart);
const priceEnrichmentCall = route.slice(priceEnrichmentCallStart, priceEnrichmentCallEnd);

assert(priceEnrichmentCall.includes("augmentedSourceForMainAi.sourceUrl"), "Price enrichment must receive the augmented PDF source URL context");
assert(priceEnrichmentCall.includes("augmentedSourceForMainAi.text"), "Price enrichment must receive the augmented PDF text context");
assert(!priceEnrichmentCall.includes("source.sourceUrl"), "Price enrichment must not fall back to the pre-augmentation source URL");
assert(!priceEnrichmentCall.includes("source.text"), "Price enrichment must not fall back to the pre-augmentation source text");

const augmentCallCount = (route.match(/augmentPdfSourceWithExtractedText\(/g) ?? []).length;
assert.equal(augmentCallCount, 2, "Price enrichment fix must not add another PDF extraction call");

const traceTypeStart = route.indexOf("type ProductionRequestTraceFields = {");
const traceTypeEnd = route.indexOf("};", traceTypeStart);
const traceType = route.slice(traceTypeStart, traceTypeEnd);
const traceBuilderStart = route.indexOf("function buildProductionPriceResolverTraceFields");
const traceBuilderEnd = route.indexOf("function buildProductionSourceHash", traceBuilderStart);
const traceBuilder = route.slice(traceBuilderStart, traceBuilderEnd);

for (const field of [
  "priceResolverEvaluatedCount",
  "priceResolverSkippedCount",
  "priceResolverMxnCount",
  "priceResolverUsdCount",
  "priceResolverUnknownCount",
  "priceResolverExplicitCount",
  "priceResolverContextCount",
  "priceResolverApproxGeneratedCount",
  "priceResolverApproxMissingCount",
  "priceResolverMexicoMarkerCount",
  "priceResolverMexicanPesoMarkerCount",
  "priceResolverMxDomainMarkerCount"
]) {
  assert(traceType.includes(`${field}: number`), `Trace type missing ${field}`);
  assert(traceBuilder.includes(`${field}: diagnostics?.${field} ?? 0`), `Trace builder missing default for ${field}`);
}

for (const forbidden of [
  "priceRaw:",
  "sourceContext:",
  "sourceUrl:",
  "restaurantUrl:",
  "menuText:",
  "nameOriginal:",
  "descriptionOriginal:"
]) {
  assert(!traceType.includes(forbidden), `Trace type must not expose ${forbidden}`);
  assert(!traceBuilder.includes(forbidden), `Trace builder must not expose ${forbidden}`);
}

const fetchCallsInPriceCompatibility = (fs.readFileSync("apps/api/src/recommendation/priceCompatibility.ts", "utf8").match(/fetchWithTimeout\(/g) ?? []).length;
assert.equal(fetchCallsInPriceCompatibility, 2, "Diagnostics must not add another exchange-rate fetch path");

console.log("price currency resolver trace regression passed");
