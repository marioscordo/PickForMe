const fs = require("fs");

const payload = {
  sourceKind: "text",
  menuText:
    "Fr\u00e4nkische Klassiker\n" +
    "Sch\u00e4ufele mit Klo\u00df und Wirsing 18,90 \u20ac\n" +
    "Sauerbraten mit Blaukraut 19,50 \u20ac\n" +
    "Gro\u00dfer Salat mit H\u00e4hnchen 14,90 \u20ac\n" +
    "Tagliatelle mit Pilzen 16,50 \u20ac\n" +
    "Kalbsleber Berliner Art 17,90 \u20ac",
  situation: "regional",
  profile: {
    displayName: "Mario",
    primaryLikes: ["Fleisch", "Regional"],
    secondaryLikes: ["Pasta", "Salat"],
    dislikes: ["Innereien", "Gr\u00e4tenfisch"],
    intolerances: [],
    dietStyle: "normal"
  }
};

async function main() {
  const response = await fetch("http://localhost:3000/api/analyze-menu", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-pickforme-dev-email": "mario.scordo@t-online.de"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  console.log("HTTP", response.status, response.statusText);
  console.log(text);

  fs.writeFileSync("api-response.json", text, "utf8");

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
