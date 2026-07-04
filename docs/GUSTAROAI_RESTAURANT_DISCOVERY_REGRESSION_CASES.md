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

## Offener Stopper: Gefunden heisst analysierbar

Status: offen, vor einem neuen Store-/TestFlight-Build zu loesen.

Befund:

- In Build 1.0.5 koennen ueber "Speisekarte finden" bereitgestellte Links in der anschliessenden Analyse scheitern.
- Konkreter Fehlerpfad: PDF-Links oder Seiten mit verlinktem PDF werden im Analyse-Endpoint vor der gemeinsamen URL-Laderoutine als PDF-Sonderfall abgefangen und koennen mit `PDF_AI_DISABLED` abbrechen.
- Das widerspricht der Produktregel, dass selbst gefundene Speisekartenlinks anschliessend analysierbar sein muessen.

Akzeptanz:

- Gefundener Link -> Analyse startet erfolgreich, oder der Link wird nicht angeboten.
- Il Pozzetto, Rom ist Pflichtfall: der gefundene `menuUrl` muss direkt von `analyze-menu` verarbeitet werden.
- HTML, PDF und Text laufen ueber denselben serverseitigen Quellenvertrag; KI-PDF ist hoechstens Fallback.
- Die Regression muss den Uebergang von `restaurant-discovery` zu `analyze-menu` pruefen, nicht nur die Erreichbarkeit der URL.
