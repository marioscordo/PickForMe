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
    IDR_EUR: 0.000055,
    INR_EUR: 0.011,
    MXN_EUR: 0.05,
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
assert.equal(inferCurrencyFromPriceRaw("USD 100"), "USD");
assert.equal(inferCurrencyFromPriceRaw("100 USD"), "USD");
assert.equal(inferCurrencyFromPriceRaw("US$100"), "USD");
assert.equal(inferCurrencyFromPriceRaw("US $100"), "USD");
assert.equal(inferCurrencyFromPriceRaw("MXN 100"), "MXN");
assert.equal(inferCurrencyFromPriceRaw("100 MXN"), "MXN");
assert.equal(inferCurrencyFromPriceRaw("MX$100"), "MXN");
assert.equal(inferCurrencyFromPriceRaw("MX $100"), "MXN");
assert.equal(inferCurrencyFromPriceRaw("$18"), undefined);
assert.equal(inferCurrencyFromPriceRaw("890 ₽"), "RUB");
assert.equal(inferCurrencyFromPriceRaw("₹450"), "INR");
assert.equal(inferCurrencyFromPriceRaw("IDR 39K"), "IDR");
assert.equal(inferCurrencyFromPriceRaw("Rp 39K"), "IDR");
assert.equal(inferCurrencyFromPriceRaw("EGP 320"), "EGP");
assert.equal(inferCurrencyFromPriceRaw("market price"), undefined);

assert.equal(inferSourceCurrencyFromContext("https://hacha.ru/theater"), "RUB");
assert.equal(inferSourceCurrencyFromContext("https://example.ch/menu"), "CHF");
assert.equal(inferSourceCurrencyFromContext("Holiday Inn New Delhi menu"), "INR");
assert.equal(inferSourceCurrencyFromContext("Hotelkarte Neu Delhi"), "INR");
assert.equal(inferSourceCurrencyFromContext("https://example.id/menu"), "IDR");
assert.equal(inferSourceCurrencyFromContext("Bali menu prices in IDR"), "IDR");
assert.equal(inferSourceCurrencyFromContext("Bali restaurant menu"), undefined);
assert.equal(inferSourceCurrencyFromContext("Carta Mexico precios en pesos mexicanos"), "MXN");
assert.equal(inferSourceCurrencyFromContext("https://example.mx/carta"), "MXN");
assert.equal(inferSourceCurrencyFromContext("Santo Habanero"), undefined);
assert.equal(inferSourceCurrencyFromContext("Entradas, sopas, ensaladas y tacos"), undefined);
assert.equal(inferSourceCurrencyFromContext("https://assets.zyrosite.com/menu.pdf"), undefined);
assert.equal(inferSourceCurrencyFromContext("https://example.test/menu"), undefined);

assert.deepEqual(parsePriceParts("890–1190 ₽")?.amounts, [890, 1190]);
assert.equal(parsePriceParts("$1300", undefined, "Carta Mexico precios en pesos mexicanos")?.currency, "MXN");
assert.equal(parsePriceParts("$340", undefined, "https://santohabanero.example.mx/carta")?.currency, "MXN");
assert.equal(parsePriceParts("1245", undefined, "Holiday Inn New Delhi menu")?.currency, "INR");
assert.equal(parsePriceParts("IDR 39K")?.currency, "IDR");
assert.deepEqual(parsePriceParts("IDR 39K")?.amounts, [39000]);
assert.deepEqual(parsePriceParts("Rp 25K")?.amounts, [25000]);
assert.deepEqual(parsePriceParts("39K", "IDR")?.amounts, [39000]);
assert.equal(parsePriceParts("$100", undefined, "https://example.us/menu")?.currency, "USD");
assert.equal(parsePriceParts("$100", undefined, "https://example.test/menu")?.currency, "UNKNOWN");
assert.equal(parsePriceParts("$100", undefined, "Entradas, sopas, ensaladas y tacos")?.currency, "UNKNOWN");
assert.equal(parsePriceParts("$100", undefined, "Santo Habanero")?.currency, "UNKNOWN");
assert.equal(parsePriceParts("US$100", undefined, "Carta Mexico precios en pesos mexicanos")?.currency, "USD");
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
  const dataPrice = Object.hasOwn(options, "dataPrice") ? options.dataPrice : 12;

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
    data: baseData(dataPrice),
    deviceLocale: options.deviceLocale ?? "de-DE",
    menuLanguage: options.menuLanguage,
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

const usdSame = await enrich("US$18", { deviceLocale: "en-US" });
assert.equal(usdSame.dishes[0].priceDisplay, undefined);

const rub = await enrich("890 ₽");
assert.equal(rub.dishes[0].priceCurrency, "RUB");
assert.equal(rub.dishes[0].priceDisplay, "890 ₽");
assert.match(rub.dishes[0].priceApproxDisplay, /^ca\. /);

const inr = await enrich("₹450");
assert.equal(inr.dishes[0].priceCurrency, "INR");
assert.equal(inr.dishes[0].priceDisplay, "₹450");
assert.match(inr.dishes[0].priceApproxDisplay, /^ca\. /);

const inferredInr = await enrich("1245", { sourceContext: "Holiday Inn New Delhi menu" });
assert.equal(inferredInr.dishes[0].priceCurrency, "INR");
assert.equal(inferredInr.dishes[0].priceDisplay, "vermutlich INR 1245");
assert.match(inferredInr.dishes[0].priceApproxDisplay, /^ca\. /);

const idr = await enrich("IDR 39K");
assert.equal(idr.dishes[0].priceCurrency, "IDR");
assert.equal(idr.dishes[0].priceDisplay, "IDR 39K");
assert.match(idr.dishes[0].priceApproxDisplay, /^ca\. /);
assert.match(idr.dishes[0].priceApproxDisplay, /^ca\. 2,15\s€$/);

const menuLanguageIdr = await enrich("39K", { menuLanguage: "id", sourceContext: "Fotografierte Speisekarte" });
assert.equal(menuLanguageIdr.dishes[0].priceCurrency, "IDR");
assert.equal(menuLanguageIdr.dishes[0].priceDisplay, "39K IDR");
assert.match(menuLanguageIdr.dishes[0].priceApproxDisplay, /^ca\. 2,15\s€$/);

const unknownK = await enrich("39K", { dataPrice: undefined, sourceContext: "https://example.test/menu" });
assert.equal(unknownK.dishes[0].priceCurrency, "UNKNOWN");
assert.equal(unknownK.dishes[0].priceDisplay, "39K");
assert.equal(unknownK.dishes[0].priceApproxDisplay, undefined);

const inferredEur = await enrich("15,00", { dataPrice: undefined, sourceContext: "https://example.it/menu" });
assert.equal(inferredEur.dishes[0].price, 15);
assert.equal(inferredEur.dishes[0].priceCurrency, "EUR");
assert.equal(inferredEur.dishes[0].priceDisplay, undefined);

const unknownNumeric = await enrich("15,00", { dataPrice: undefined, sourceContext: "https://example.test/menu" });
assert.equal(unknownNumeric.dishes[0].price, undefined);
assert.equal(unknownNumeric.dishes[0].priceCurrency, undefined);
assert.equal(unknownNumeric.dishes[0].priceDisplay, undefined);

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

const menuLanguageRub = await enrich("8.50", { menuLanguage: "ru", sourceContext: "Fotografierte Speisekarte" });
assert.equal(menuLanguageRub.dishes[0].priceCurrency, "RUB");
assert.equal(menuLanguageRub.dishes[0].priceDisplay, "8.50 ₽");
assert.match(menuLanguageRub.dishes[0].priceApproxDisplay, /^ca\. /);

const santoHabaneroContext = [
  "Santo Habanero",
  "Mexico",
  "precios en pesos mexicanos",
  "https://www.santohabanero.example.mx/carta"
].join("\n");
const santoHabaneroExpensive = await enrich("$1300", { sourceContext: santoHabaneroContext });
assert.equal(santoHabaneroExpensive.dishes[0].priceCurrency, "MXN");
assert.equal(santoHabaneroExpensive.dishes[0].priceDisplay, "MX$1300");
assert.match(santoHabaneroExpensive.dishes[0].priceApproxDisplay, /^ca\. /);
assert.equal(santoHabaneroExpensive.dishes[0].priceExchangeRateDate, "2026-07-14");

const santoHabaneroSmall = await enrich("$340", { sourceContext: santoHabaneroContext });
assert.equal(santoHabaneroSmall.dishes[0].priceCurrency, "MXN");
assert.equal(santoHabaneroSmall.dishes[0].priceDisplay, "MX$340");
assert.match(santoHabaneroSmall.dishes[0].priceApproxDisplay, /^ca\. /);

const unknownDollar = await enrich("$100", { sourceContext: "https://assets.zyrosite.com/menu.pdf" });
assert.equal(unknownDollar.dishes[0].priceCurrency, "UNKNOWN");
assert.equal(unknownDollar.dishes[0].priceDisplay, "$100");
assert.equal(unknownDollar.dishes[0].priceApproxDisplay, undefined);

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

// Regression fuer den 2026-07-27 Bug: MX$1300 wurde angezeigt, "ca. X €"
// fehlte ohne jeden Fehler. Ursache war ein einzelner fehlgeschlagener
// Kursabruf ohne Retry. Diese beiden Faelle nutzen USD statt MXN, weil MXN_EUR
// oben im selben Testlauf bereits erfolgreich gecacht wurde (EXCHANGE_RATE_CACHE
// ist modul-global) - mit einer bereits gecachten Paarung wuerde gar kein
// fetch mehr ausgeloest und der Retry-Pfad nie erreicht.
let transientAttemptCount = 0;
globalThis.fetch = async () => {
  transientAttemptCount++;

  if (transientAttemptCount === 1) {
    throw new Error("transient network blip");
  }

  return {
    ok: true,
    status: 200,
    json: async () => ({ date: "2026-07-27", rate: 0.92 })
  };
};

const transientFailureThenSuccess = await enrich("USD 50", { sourceContext: "https://example.us/menu" });
assert.equal(transientFailureThenSuccess.dishes[0].priceDisplay, "USD 50");
assert.match(transientFailureThenSuccess.dishes[0].priceApproxDisplay, /^ca\. /);
assert.equal(transientAttemptCount, 2, "must retry exactly once after a transient failure");

// Wenn auch der zweite Versuch scheitert, weiterhin sauber ohne
// priceApproxDisplay degradieren statt haengen zu bleiben oder zu werfen.
let persistentAttemptCount = 0;
globalThis.fetch = async () => {
  persistentAttemptCount++;
  throw new Error("still down");
};

const persistentFailure = await enrich("GBP 40");
assert.equal(persistentFailure.dishes[0].priceDisplay, "GBP 40");
assert.equal(persistentFailure.dishes[0].priceApproxDisplay, undefined);
assert.equal(persistentAttemptCount, 2, "must give up after exactly two attempts, not retry indefinitely");

globalThis.fetch = originalFetch;

console.log("price-compatibility regression passed");
