import assert from "node:assert/strict";

const {
  enrichPriceCompatibility,
  inferCurrencyFromPriceRaw,
  inferSourceCurrencyFromContext,
  parsePriceParts,
  resolveTargetCurrencyFromDeviceLocale
} = await import("../apps/api/src/recommendation/priceCompatibility.ts");

const originalFetch = globalThis.fetch;

globalThis.fetch = async (value) => {
  const url = String(value);
  const match = url.match(/\/v2\/rate\/([A-Z]{3})\/([A-Z]{3})$/);

  if (!match) {
    throw new Error(`Unexpected fetch URL ${url}`);
  }

  const key = `${match[1]}_${match[2]}`;
  const rates = {
    CHF_EUR: 1.05,
    EGP_EUR: 0.019,
    INR_EUR: 0.011,
    RUB_EUR: 0.0098,
    USD_EUR: 0.92
  };
  const rate = rates[key];

  if (!rate) {
    return {
      ok: false,
      status: 404,
      json: async () => ({ message: "not found" })
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({ date: "2026-07-14", rate })
  };
};

assert.equal(resolveTargetCurrencyFromDeviceLocale("de-DE"), "EUR");
assert.equal(resolveTargetCurrencyFromDeviceLocale("de-CH"), "CHF");
assert.equal(resolveTargetCurrencyFromDeviceLocale("en-US"), "USD");
assert.equal(resolveTargetCurrencyFromDeviceLocale("ru-RU"), "RUB");
assert.equal(resolveTargetCurrencyFromDeviceLocale("hi-IN"), "INR");
assert.equal(resolveTargetCurrencyFromDeviceLocale("ar-EG"), "EGP");
assert.equal(resolveTargetCurrencyFromDeviceLocale("en-GB"), "GBP");
assert.equal(resolveTargetCurrencyFromDeviceLocale("en"), undefined);

assert.equal(inferCurrencyFromPriceRaw("12,50 €"), "EUR");
assert.equal(inferCurrencyFromPriceRaw("CHF 24"), "CHF");
assert.equal(inferCurrencyFromPriceRaw("$18"), "USD");
assert.equal(inferCurrencyFromPriceRaw("890 ₽"), "RUB");
assert.equal(inferCurrencyFromPriceRaw("₹450"), "INR");
assert.equal(inferCurrencyFromPriceRaw("EGP 320"), "EGP");
assert.equal(inferCurrencyFromPriceRaw("market price"), undefined);

assert.equal(inferSourceCurrencyFromContext("https://hacha.ru/theater"), "RUB");
assert.equal(inferSourceCurrencyFromContext("https://example.ch/menu"), "CHF");
assert.equal(inferSourceCurrencyFromContext("https://example.test/menu"), undefined);

assert.deepEqual(parsePriceParts("890–1190 ₽")?.amounts, [890, 1190]);
assert.equal(parsePriceParts("market price")?.currency, "UNKNOWN");
assert.equal(parsePriceParts(undefined), null);

const baseData = (price) => ({
  dishes: [{
    id: "dish_1",
    nameOriginal: "Dish",
    price,
    sourceLine: "Dish"
  }],
  recommendations: [{
    dishId: "dish_1",
    reason: "Reason",
    translatedName: "Gericht"
  }]
});

async function enrich(priceRaw, options = {}) {
  return enrichPriceCompatibility({
    acceptedRecommendations: [{
      confidence: "high",
      nameOriginal: "Dish",
      priceRaw,
      profileSafety: {
        hasKnownConflict: false,
        uncertainForAllergy: false
      },
      rank: 1,
      reason: "Reason",
      sourceEvidence: "Dish",
      translatedName: "Gericht"
    }],
    data: baseData(12),
    deviceLocale: options.deviceLocale ?? "de-DE",
    sourceContext: options.sourceContext,
    targetLocale: "de-DE"
  });
}

const sameEur = await enrich("12,50 €");
assert.equal(sameEur.dishes[0].price, 12);
assert.equal(sameEur.dishes[0].priceDisplay, undefined);

const chf = await enrich("CHF 24");
assert.equal(chf.dishes[0].priceCurrency, "CHF");
assert.equal(chf.dishes[0].priceDisplay, "CHF 24");
assert.match(chf.dishes[0].priceApproxDisplay, /^ca\. /);
assert.equal(chf.dishes[0].priceExchangeRateDate, "2026-07-14");

const usdSame = await enrich("$18", { deviceLocale: "en-US" });
assert.equal(usdSame.dishes[0].priceDisplay, undefined);

const rub = await enrich("890 ₽");
assert.equal(rub.dishes[0].priceCurrency, "RUB");
assert.equal(rub.dishes[0].priceDisplay, "890 ₽");
assert.match(rub.dishes[0].priceApproxDisplay, /^ca\. /);

const inr = await enrich("₹450");
assert.equal(inr.dishes[0].priceCurrency, "INR");
assert.equal(inr.dishes[0].priceDisplay, "₹450");
assert.match(inr.dishes[0].priceApproxDisplay, /^ca\. /);

const egp = await enrich("EGP 320");
assert.equal(egp.dishes[0].priceCurrency, "EGP");
assert.equal(egp.dishes[0].priceDisplay, "EGP 320");
assert.match(egp.dishes[0].priceApproxDisplay, /^ca\. /);

const range = await enrich("890–1190 ₽");
assert.equal(range.dishes[0].priceDisplay, "890–1190 ₽");
assert.match(range.dishes[0].priceApproxDisplay, /–/);

const fallbackRub = await enrich("890", { sourceContext: "https://hacha.ru/theater" });
assert.equal(fallbackRub.dishes[0].priceCurrency, "RUB");
assert.equal(fallbackRub.dishes[0].priceDisplay, "890 ₽");

const unknown = await enrich("market price");
assert.equal(unknown.dishes[0].priceCurrency, "UNKNOWN");
assert.equal(unknown.dishes[0].priceDisplay, "market price");
assert.equal(unknown.dishes[0].priceApproxDisplay, undefined);

const missing = await enrich(undefined);
assert.equal(missing.dishes[0].priceDisplay, undefined);
assert.equal(missing.dishes[0].price, 12);

globalThis.fetch = async () => {
  throw new Error("network down");
};

const outage = await enrich("$30");
assert.equal(outage.dishes[0].priceDisplay, "$30");
assert.equal(outage.dishes[0].priceApproxDisplay, undefined);

globalThis.fetch = originalFetch;

console.log("price-compatibility regression passed");
