const MARKER_TOKEN_PATTERN = /^(?:[A-Z]{1,2}|\d{1,3}|\*)$/u;
const MARKER_LINE_PATTERN = /^[A-Z0-9\s,|/*]+$/u;
const PRICE_LIKE_PATTERN = /\d{1,3}[.,]\d{2}/;

export function normalizeMenuMarkerLine(value: string | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMenuMarkerLine(value: string | undefined): boolean {
  const normalized = normalizeMenuMarkerLine(value);

  if (!normalized || normalized.length > 24) {
    return false;
  }

  if (PRICE_LIKE_PATTERN.test(normalized) || normalized.includes("\u20ac")) {
    return false;
  }

  if (!MARKER_LINE_PATTERN.test(normalized)) {
    return false;
  }

  const tokens = normalized.split(/[\s,|/]+/).filter(Boolean);

  return tokens.length > 0 &&
    tokens.length <= 12 &&
    tokens.every((token) => MARKER_TOKEN_PATTERN.test(token));
}

export function isLikelyMenuMarkerLine(value: string | undefined): boolean {
  return isMenuMarkerLine(value);
}
