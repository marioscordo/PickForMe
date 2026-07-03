# GustaroAI Restaurant Discovery Regression Cases

## UI

- Der Button "Speisekarte finden" erscheint unter "Einfügen" und "QR-Code".
- "Einfügen" bleibt standardmässig aktiv.
- Das Eingabefeld "Link oder Speisekartentext einfügen..." bleibt vorhanden.
- Das Eingabefeld ist im Discovery-Layout auf 68 px reduziert.
- Der Dialog "Speisekarte finden" öffnet sich erst über den Button "Speisekarte finden".
- Der Button "Zeigen" startet erst nach Restaurantname und Stadt die Suche.
- Die Trefferliste dient nur der Quellenauswahl.
- Double-Tap auf einen Treffer übernimmt ihn in das Feld "Restaurant".
- "Speisekarte" ist erst nach gewähltem Restaurant nutzbar.
- Fehlende `menuUrl` zeigt exakt: "Kein auswertbarer Speisekartenlink gefunden".
- "Übernehmen" ist erst mit gefülltem Feld "Link" nutzbar.
- "Übernehmen" schreibt den Link in das ursprüngliche Eingabefeld.
- "zurück" schliesst den Dialog und kehrt zu "Was passt heute" zurück.

## Routine

- `generateRestaurantCandidates` gibt ohne Restaurantname oder Stadt keine Treffer zurück.
- Kandidaten werden dedupliziert.
- Blockierte Plattformhosts werden nicht als Website übernommen.
- `resolveSelectedRestaurantSource` gibt ohne Website `{ websiteUrl: "" }` zurück.
- `resolveSelectedRestaurantSource` akzeptiert nur strukturierte `kind: "menu"` Links.
- Eine `menuUrl` auf fremder registrierbarer Domain wird verworfen.
- Eine nicht erreichbare `menuUrl` wird verworfen.
- Wenn keine belastbare `menuUrl` gefunden wird, bleibt `menuUrl` leer.