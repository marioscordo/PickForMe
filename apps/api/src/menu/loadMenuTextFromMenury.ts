type MenuryVariant = {
  price?: number | string | null;
  variant_description?: string | null;
};

type MenuryMenuItem = {
  type?: number | string | null;
  active?: boolean | number | null;
  menu_item_title?: string | null;
  menu_item_title_foreign?: string | null;
  menu_item_description?: string | null;
  variants?: MenuryVariant[] | null;
};

type MenuryApiResponse = {
  state?: string;
  data?: {
    restaurant?: {
      name?: string | null;
      address_town?: string | null;
    };
    menu_items?: MenuryMenuItem[];
  };
};

export function looksLikeMenuryUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "menury.com" || host.endsWith(".menury.com");
  } catch {
    return false;
  }
}

export async function loadMenuTextFromMenury(value: string): Promise<string> {
  const url = new URL(value);
  const token = await resolveMenuryToken(url);

  if (!token) {
    throw new Error("MENURY_TOKEN_NOT_FOUND");
  }

  const apiUrl = `${url.origin}/api/restaurant/${token}`;
  const response = await fetchWithTimeout(apiUrl, 10000);

  if (!response.ok) {
    throw new Error(`MENURY_API_FAILED_${response.status}`);
  }

  const json = (await response.json()) as MenuryApiResponse;
  const items = json.data?.menu_items ?? [];

  if (items.length === 0) {
    throw new Error("MENURY_NO_MENU_ITEMS");
  }

  const lines: string[] = ["MENURY-Speisekarte", ""];

  for (const item of items) {
    if (item.active === false || item.active === 0) continue;
    if (String(item.type ?? "") === "4") continue;

    const title = cleanText(item.menu_item_title ?? "");
    const foreignTitle = cleanText(item.menu_item_title_foreign ?? "");
    const description = cleanText(item.menu_item_description ?? "");
    const price = formatVariants(item.variants ?? []);

    if (!title) continue;

    lines.push(title);
    if (foreignTitle && foreignTitle !== title) lines.push(foreignTitle);
    if (description) lines.push(description);
    if (price) lines.push(price);
    lines.push("");
  }

  const menuText = lines.join("\n").trim();

  if (menuText.length < 100) {
    throw new Error("MENURY_MENU_TEXT_TOO_SHORT");
  }

  return menuText.slice(0, 35000);
}

async function resolveMenuryToken(url: URL): Promise<string | null> {
  const directMatch = url.pathname.match(/^\/r\/([^/?#]+)/i);

  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const response = await fetchWithTimeout(url.toString(), 10000);

  if (!response.ok) {
    throw new Error(`MENURY_PAGE_FAILED_${response.status}`);
  }

  const html = await response.text();

  const patterns = [
    /menury\.com\/r\/([^"'<>\s]+)/i,
    /restauranttoken=["']([^"']+)["']/i,
    /restauranttoken:\s*["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].replace(/\/$/, "");
  }

  return null;
}

function formatVariants(variants: MenuryVariant[]): string {
  const prices = variants
    .map((variant) => {
      const price = formatPrice(variant.price);
      const label = cleanText(variant.variant_description ?? "");

      if (!price) return "";
      return label ? `${label}: ${price}` : price;
    })
    .filter(Boolean);

  if (prices.length === 0) return "";
  if (prices.length === 1) return `Preis: ${prices[0]}`;

  return `Preise: ${prices.join("; ")}`;
}

function formatPrice(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";

  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."));

  if (!Number.isFinite(numeric)) {
    return cleanText(String(value));
  }

  return `${numeric.toFixed(2).replace(".", ",")} €`;
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWithTimeout(value: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(value, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "application/json,text/plain,*/*"
      }
    });
  } finally {
    clearTimeout(timer);
  }
}
