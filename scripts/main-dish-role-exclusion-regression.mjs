import fs from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const mainAi = fs.readFileSync("apps/api/src/ai/recommendMainDishesAI.ts", "utf8").replace(/\r\n/g, "\n");

// Fallanalyse "sonnenalm.de" (Juli 2026): eine Bild-Speisekarte ohne
// strukturierten Kategorietext lieferte "Kartoffelsuppe" und "Germknoedel"
// als Hauptspeisen-Empfehlungen zurueck - beide stehen zwar wirklich auf der
// Karte (keine Halluzination), sind aber keine Hauptspeisen. Ursache: die
// Ausschlussliste fuer den "main"-Rollenraum nannte "Vorspeisen, Salate als
// reine Vorspeisen, Desserts, Getraenke und Beilagen", aber keine Suppen -
// anders als der "starter"/"salad"-Rollenraum, der Suppen bereits bewusst
// vorsichtig behandelt.
assert(
  mainAi.includes("Vorspeisen, Salate als reine Vorspeisen, Desserts, Getraenke und Beilagen duerfen nicht als Ersatz empfohlen werden."),
  "the original main-role exclusion line must still be present"
);
assert(
  mainAi.includes("Suppen sind in der Regel keine Hauptspeisen und duerfen nicht als Ersatz empfohlen werden"),
  "the main dish role must explicitly exclude soups as a substitute, mirroring how the starter/salad role already treats soups carefully"
);
assert(
  mainAi.includes("Suesse Mehlspeisen (z. B. Germknoedel, Kaiserschmarrn als Suessspeise) gelten als Dessert, nicht als Hauptspeise"),
  "the main dish role must explicitly classify sweet Mehlspeisen as dessert, since image sources have no structured category text for the AI to lean on"
);

// Diese Regeln muessen im "main"-Zweig von buildRequestedDishRoleAssignment
// stehen, nicht im "starter"/"salad"-Zweig - sonst wirken sie nicht fuer den
// tatsaechlich betroffenen Rollenraum.
const mainRoleBranch = mainAi.slice(mainAi.indexOf('roles: ["main"]'));
assert(
  mainRoleBranch.indexOf("Suppen sind in der Regel keine Hauptspeisen") > 0 &&
    mainRoleBranch.indexOf("Suppen sind in der Regel keine Hauptspeisen") < mainRoleBranch.indexOf("function buildPreferredDishRoleAssignment"),
  "the soup-exclusion rule must live inside the main-role rule list"
);

console.log("main dish role exclusion regression passed");
