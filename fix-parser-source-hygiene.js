const fs = require("fs");

const path = "apps/api/src/menu/parseMenu.ts";
let s = fs.readFileSync(path, "utf8");

const cleanFunction = `function isAcceptablePriceTail(tail: string) {
  if (!tail) {
    return true;
  }

  const normalized = tail.trim().toLowerCase();

  return normalized === "\\u20ac" || normalized === "eur" || normalized === "euro";
}
`;

s = s.replace(
  /function isAcceptablePriceTail\(tail: string\) \{[\s\S]*?\n\}\n\nfunction shouldSkipLine/,
  cleanFunction + "\nfunction shouldSkipLine"
);

fs.writeFileSync(path, s, "utf8");
console.log("parseMenu.ts source hygiene fixed.");
