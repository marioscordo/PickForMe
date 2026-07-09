type RestaurantDiscoveryCountryConfig = {
  code: string;
  names: string[];
  nominatimCountryCode: string;
  preferredTlds: string[];
};

const RESTAURANT_DISCOVERY_COUNTRIES: Record<string, RestaurantDiscoveryCountryConfig> = {
  AL: { code: "AL", names: ["Albania", "Albanien"], nominatimCountryCode: "al", preferredTlds: ["al"] },
  AD: { code: "AD", names: ["Andorra"], nominatimCountryCode: "ad", preferredTlds: ["ad"] },
  AM: { code: "AM", names: ["Armenia", "Armenien"], nominatimCountryCode: "am", preferredTlds: ["am"] },
  AT: { code: "AT", names: ["Austria", "Oesterreich", "Österreich"], nominatimCountryCode: "at", preferredTlds: ["at"] },
  AZ: { code: "AZ", names: ["Azerbaijan", "Aserbaidschan"], nominatimCountryCode: "az", preferredTlds: ["az"] },
  BY: { code: "BY", names: ["Belarus", "Weissrussland", "Weißrussland"], nominatimCountryCode: "by", preferredTlds: ["by"] },
  BE: { code: "BE", names: ["Belgium", "Belgien"], nominatimCountryCode: "be", preferredTlds: ["be"] },
  BA: { code: "BA", names: ["Bosnia and Herzegovina", "Bosnien und Herzegowina"], nominatimCountryCode: "ba", preferredTlds: ["ba"] },
  BG: { code: "BG", names: ["Bulgaria", "Bulgarien"], nominatimCountryCode: "bg", preferredTlds: ["bg"] },
  HR: { code: "HR", names: ["Croatia", "Kroatien"], nominatimCountryCode: "hr", preferredTlds: ["hr"] },
  CY: { code: "CY", names: ["Cyprus", "Zypern"], nominatimCountryCode: "cy", preferredTlds: ["cy"] },
  CZ: { code: "CZ", names: ["Czechia", "Czech Republic", "Tschechien"], nominatimCountryCode: "cz", preferredTlds: ["cz"] },
  DK: { code: "DK", names: ["Denmark", "Daenemark", "Dänemark"], nominatimCountryCode: "dk", preferredTlds: ["dk"] },
  DE: { code: "DE", names: ["Germany", "Deutschland"], nominatimCountryCode: "de", preferredTlds: ["de"] },
  EE: { code: "EE", names: ["Estonia", "Estland"], nominatimCountryCode: "ee", preferredTlds: ["ee"] },
  FI: { code: "FI", names: ["Finland", "Finnland"], nominatimCountryCode: "fi", preferredTlds: ["fi"] },
  FR: { code: "FR", names: ["France", "Frankreich"], nominatimCountryCode: "fr", preferredTlds: ["fr"] },
  GE: { code: "GE", names: ["Georgia", "Georgien"], nominatimCountryCode: "ge", preferredTlds: ["ge"] },
  GR: { code: "GR", names: ["Greece", "Griechenland"], nominatimCountryCode: "gr", preferredTlds: ["gr"] },
  HU: { code: "HU", names: ["Hungary", "Ungarn"], nominatimCountryCode: "hu", preferredTlds: ["hu"] },
  IS: { code: "IS", names: ["Iceland", "Island"], nominatimCountryCode: "is", preferredTlds: ["is"] },
  IE: { code: "IE", names: ["Ireland", "Irland"], nominatimCountryCode: "ie", preferredTlds: ["ie"] },
  IT: { code: "IT", names: ["Italy", "Italia", "Italien"], nominatimCountryCode: "it", preferredTlds: ["it"] },
  XK: { code: "XK", names: ["Kosovo"], nominatimCountryCode: "xk", preferredTlds: ["xk"] },
  LV: { code: "LV", names: ["Latvia", "Lettland"], nominatimCountryCode: "lv", preferredTlds: ["lv"] },
  LI: { code: "LI", names: ["Liechtenstein"], nominatimCountryCode: "li", preferredTlds: ["li"] },
  LT: { code: "LT", names: ["Lithuania", "Litauen"], nominatimCountryCode: "lt", preferredTlds: ["lt"] },
  LU: { code: "LU", names: ["Luxembourg", "Luxemburg"], nominatimCountryCode: "lu", preferredTlds: ["lu"] },
  MT: { code: "MT", names: ["Malta"], nominatimCountryCode: "mt", preferredTlds: ["mt"] },
  MD: { code: "MD", names: ["Moldova", "Moldau"], nominatimCountryCode: "md", preferredTlds: ["md"] },
  MC: { code: "MC", names: ["Monaco"], nominatimCountryCode: "mc", preferredTlds: ["mc"] },
  ME: { code: "ME", names: ["Montenegro"], nominatimCountryCode: "me", preferredTlds: ["me"] },
  NL: { code: "NL", names: ["Netherlands", "Niederlande"], nominatimCountryCode: "nl", preferredTlds: ["nl"] },
  MK: { code: "MK", names: ["North Macedonia", "Nordmazedonien"], nominatimCountryCode: "mk", preferredTlds: ["mk"] },
  NO: { code: "NO", names: ["Norway", "Norwegen"], nominatimCountryCode: "no", preferredTlds: ["no"] },
  PL: { code: "PL", names: ["Poland", "Polen"], nominatimCountryCode: "pl", preferredTlds: ["pl"] },
  PT: { code: "PT", names: ["Portugal"], nominatimCountryCode: "pt", preferredTlds: ["pt"] },
  RO: { code: "RO", names: ["Romania", "Rumaenien", "Rumänien"], nominatimCountryCode: "ro", preferredTlds: ["ro"] },
  RU: { code: "RU", names: ["Russia", "Russland"], nominatimCountryCode: "ru", preferredTlds: ["ru"] },
  SM: { code: "SM", names: ["San Marino"], nominatimCountryCode: "sm", preferredTlds: ["sm"] },
  RS: { code: "RS", names: ["Serbia", "Serbien"], nominatimCountryCode: "rs", preferredTlds: ["rs"] },
  SK: { code: "SK", names: ["Slovakia", "Slowakei"], nominatimCountryCode: "sk", preferredTlds: ["sk"] },
  SI: { code: "SI", names: ["Slovenia", "Slowenien"], nominatimCountryCode: "si", preferredTlds: ["si"] },
  ES: { code: "ES", names: ["Spain", "Spanien"], nominatimCountryCode: "es", preferredTlds: ["es"] },
  SE: { code: "SE", names: ["Sweden", "Schweden"], nominatimCountryCode: "se", preferredTlds: ["se"] },
  CH: { code: "CH", names: ["Switzerland", "Schweiz"], nominatimCountryCode: "ch", preferredTlds: ["ch"] },
  TR: { code: "TR", names: ["Turkey", "Tuerkei", "Türkei"], nominatimCountryCode: "tr", preferredTlds: ["tr"] },
  UA: { code: "UA", names: ["Ukraine"], nominatimCountryCode: "ua", preferredTlds: ["ua"] },
  GB: { code: "GB", names: ["United Kingdom", "Great Britain", "Grossbritannien", "Großbritannien"], nominatimCountryCode: "gb", preferredTlds: ["co.uk", "uk"] },
  VA: { code: "VA", names: ["Vatican City", "Vatikanstadt"], nominatimCountryCode: "va", preferredTlds: ["va"] },
  US: { code: "US", names: ["United States", "USA", "United States of America", "Vereinigte Staaten"], nominatimCountryCode: "us", preferredTlds: ["com", "us"] },
  CA: { code: "CA", names: ["Canada", "Kanada"], nominatimCountryCode: "ca", preferredTlds: ["ca", "com"] },
  CN: { code: "CN", names: ["China"], nominatimCountryCode: "cn", preferredTlds: ["cn", "com.cn"] },
  JP: { code: "JP", names: ["Japan"], nominatimCountryCode: "jp", preferredTlds: ["jp", "co.jp"] },
  AU: { code: "AU", names: ["Australia", "Australien"], nominatimCountryCode: "au", preferredTlds: ["com.au", "au"] },
  BR: { code: "BR", names: ["Brazil", "Brasil", "Brasilien"], nominatimCountryCode: "br", preferredTlds: ["com.br", "br"] },
  MX: { code: "MX", names: ["Mexico", "Mexiko"], nominatimCountryCode: "mx", preferredTlds: ["mx", "com.mx"] },
  AR: { code: "AR", names: ["Argentina", "Argentinien"], nominatimCountryCode: "ar", preferredTlds: ["com.ar", "ar"] },
  CL: { code: "CL", names: ["Chile"], nominatimCountryCode: "cl", preferredTlds: ["cl"] },
  IN: { code: "IN", names: ["India", "Indien"], nominatimCountryCode: "in", preferredTlds: ["in", "co.in"] },
  TH: { code: "TH", names: ["Thailand"], nominatimCountryCode: "th", preferredTlds: ["co.th", "th"] },
  VN: { code: "VN", names: ["Vietnam"], nominatimCountryCode: "vn", preferredTlds: ["vn", "com.vn"] },
  KR: { code: "KR", names: ["South Korea", "Korea", "Suedkorea", "Südkorea"], nominatimCountryCode: "kr", preferredTlds: ["kr", "co.kr"] },
  SG: { code: "SG", names: ["Singapore", "Singapur"], nominatimCountryCode: "sg", preferredTlds: ["sg", "com.sg"] },
  AE: { code: "AE", names: ["United Arab Emirates", "UAE", "Vereinigte Arabische Emirate"], nominatimCountryCode: "ae", preferredTlds: ["ae"] },
  ZA: { code: "ZA", names: ["South Africa", "Suedafrika", "Südafrika"], nominatimCountryCode: "za", preferredTlds: ["co.za", "za"] }
};

export function resolveRestaurantDiscoveryCountry(value: string | undefined) {
  const normalized = normalizeCountryValue(value);
  if (!normalized) return null;

  const byCode = RESTAURANT_DISCOVERY_COUNTRIES[normalized.toUpperCase()];
  if (byCode) return byCode;

  return Object.values(RESTAURANT_DISCOVERY_COUNTRIES).find((country) => (
    country.names.some((name) => normalizeCountryValue(name) === normalized)
  )) ?? null;
}

export function getRestaurantDiscoveryCountryCode(value: string | undefined) {
  return resolveRestaurantDiscoveryCountry(value)?.code ?? "";
}

export function getRestaurantDiscoveryCountryNames(value: string | undefined) {
  return resolveRestaurantDiscoveryCountry(value)?.names ?? [];
}

export function getRestaurantDiscoveryCountryTlds(value: string | undefined) {
  return resolveRestaurantDiscoveryCountry(value)?.preferredTlds ?? [];
}

export function getRestaurantDiscoveryNominatimCountryCode(value: string | undefined) {
  return resolveRestaurantDiscoveryCountry(value)?.nominatimCountryCode ?? "";
}

function normalizeCountryValue(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
