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
- Fehlende `menuUrl` zeigt exakt: "Kein auswertbarer Speisekartenlink gefunden. Bitte Link, Text oder Foto manuell einfügen".
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

## Gefunden heisst analysierbar

Status: lokal gepatcht und mit 10er-Test nachgeprueft; vor Deploy/Build zu committen.

Befund:

- In Build 1.0.5 koennen ueber "Speisekarte finden" bereitgestellte Links in der anschliessenden Analyse scheitern.
- Konkreter Fehlerpfad: PDF-Links oder Seiten mit verlinktem PDF werden im Analyse-Endpoint vor der gemeinsamen URL-Laderoutine als PDF-Sonderfall abgefangen und koennen mit `PDF_AI_DISABLED` abbrechen.
- Das widerspricht der Produktregel, dass selbst gefundene Speisekartenlinks anschliessend analysierbar sein muessen.

Akzeptanz:

- Gefundener Link -> Analyse startet erfolgreich, oder der Link wird nicht angeboten.
- Il Pozzetto, Rom ist Pflichtfall: der gefundene `menuUrl` muss direkt von `analyze-menu` verarbeitet werden.
- HTML, PDF und Text laufen ueber denselben serverseitigen Quellenvertrag; KI-PDF ist hoechstens Fallback.
- Die Regression muss den Uebergang von `restaurant-discovery` zu `analyze-menu` pruefen, nicht nur die Erreichbarkeit der URL.

## Lokaler 10er-Test vom 2026-07-04

Testpfad:

- Lokaler Backend-Code mit `apps/api/.env.local`.
- `discoverRestaurantSources` mit OpenAI-Websuche.
- Gefundene `menuUrl` wird anschliessend mit `loadMenuTextFromUrl` und Analysierbarkeitsprobe geprueft.
- Kein Link wird als PASS gewertet, wenn keine `menuUrl` vorhanden ist.

Ergebnis vor Recovery-Verbesserung:

| Fall | Ergebnis | Befund |
| --- | --- | --- |
| Il Pozzetto, Rom | PASS | Offizielle Website gefunden, Speisekartenquelle analysierbar. |
| Antonella, Forchheim | fachlich analysierbar, Discovery falsch | OpenAI waehlt `trattoriadaantonella.de`; korrekter Link `restaurant-antonella.com` ist analysierbar. |
| Le Calife, Paris | PASS | Offizielle PDF-Speisekarte analysierbar. |
| Eight Am, San Francisco | PASS | Offizielle Menueseite analysierbar. |
| Kyatcha, Rotterdam | PASS | Offizielle PDF-Speisekarte analysierbar. |
| The Blackfriar, London | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |
| La Taberna De Penalver Cava Baja, Madrid | PASS | Offizielle Menueseite analysierbar. |
| A Casa do Porco, Sao Paulo | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |
| Adobe Cocina Regional, Salta | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |
| Pils Kafejnica, Tukums | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |

Produktbewertung:

- 6 Kandidaten sind mit konkreter Quelle analysierbar.
- 4 Kandidaten haben im Testkontext keine eigene offizielle Website; dort ist die Nutzer-Meldung der korrekte Produktpfad.
- Antonella ist der konkrete Discovery-Verbesserungsfall: bei namensnahen Treffern ohne analysierbare Speisekarte muss eine menu-fokussierte zweite Suche nach alternativen offiziellen Quellen erfolgen.

Ergebnis nach Recovery-Verbesserung:

| Fall | Ergebnis | Befund |
| --- | --- | --- |
| Il Pozzetto, Rom | PASS | Offizielle Website und analysierbare Speisekartenquelle gefunden. |
| Antonella, Forchheim | PASS | `restaurant-antonella.com` wird vor dem namensnahen falschen Treffer einsortiert; `speisekarte/` ist analysierbar. |
| Le Calife, Paris | PASS | Offizielle PDF-Speisekarte analysierbar. |
| Eight Am, San Francisco | PASS | Offizielle Menueseite analysierbar. |
| Kyatcha, Rotterdam | PASS | Offizielle PDF-Speisekarte analysierbar. |
| The Blackfriar, London | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |
| La Taberna De Peñalver Cava Baja, Madrid | PASS | Offizielle Menueseite analysierbar. |
| A Casa do Porco, Sao Paulo | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |
| Adobe Cocina Regional, Salta | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |
| Pils Kafejnīca, Tukums | erwartete Meldung | Keine eigene offizielle Restaurant-Website im Testkontext. |

Finale lokale Bewertung:

- 6/10 PASS mit konkretem analysierbarem Link.
- 4/10 erwartete Meldung, weil im Testkontext keine eigene offizielle Website vorhanden ist.
- Kein nicht analysierbarer Link wird an die App durchgereicht.
