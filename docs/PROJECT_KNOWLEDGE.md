# GustaroAI Project Knowledge

Status: verbindliches Projektwissen
Gilt fuer: Produktlogik, AI-Verhalten, Quellenregeln, UX-Grundsaetze
Ergaenzt: `AGENTS.md`

## 1. Produktidentitaet

GustaroAI ist ein persoenlicher Restaurant-Concierge. Die App soll nicht moeglichst viel Speisekartenwissen anzeigen, sondern moeglichst schnell eine vertrauenswuerdige, persoenlich passende Entscheidung ermoeglichen.

Der Zielmoment lautet: Der Nutzer soll nach kurzer Zeit denken: "Genau das haette ich auch genommen."

## 2. Rollenmodell

GustaroAI trennt drei Rollen strikt:

- Restaurant: erzaehlt seine Geschichte.
- Speisekarte: liefert Fakten.
- GustaroAI: trifft die Empfehlung.

Diese Rollen duerfen weder im Prompt noch im UI noch in Backend-Enrichment vermischt werden.

## 3. Vertrauenswuerdige Quellen

Reihenfolge:

1. Offizielle Restaurant-Website
2. Originale Speisekarte
3. Nutzerprofil
4. Situationskontext
5. Belastbares oeffentliches Restaurantwissen

Eine Quelle mit niedrigerem Vertrauen darf eine hoehere Quelle nicht ueberschreiben.

## 4. Restaurantbox

Die Restaurantbox stellt das Restaurant vor. Sie ist keine Empfehlung und keine Speisekartenanalyse.

Erlaubte Quellen:

- offizielle Restaurant-Website
- belastbares oeffentliches Restaurantwissen, wenn keine offizielle Beschreibung existiert

Nicht erlaubte Quellen:

- Adresse
- Kontakt
- Impressum
- Oeffnungszeiten
- Menutext
- Footer
- Marketing- oder Plattformtexte ohne belastbaren Ursprung

Wenn keine belastbare Quelle vorhanden ist, wird keine Restaurantbox angezeigt.

## 5. Speisekartenvertrag

Die Speisekarte gehoert dem Restaurant.

GustaroAI darf:

- uebersetzen
- strukturieren
- kuerzen
- Rollen wie Hauptgericht, Vorspeise oder Salat aus vorhandenen Informationen ableiten, wenn belastbar

GustaroAI darf niemals:

- Gerichte erfinden
- Zutaten ergaenzen
- Preise veraendern
- Verfuegbarkeit behaupten
- Restauranttexte in Speisekartenfakten umwandeln

## 6. Empfehlungssystem

Empfehlungen basieren auf:

- Nutzerprofil
- Speisekarte
- Situationskontext

Sie basieren nicht auf Marketing, Halluzinationen oder ungeprueften externen Plattformen.

Die finale Ausgabe soll maximal drei Gerichte enthalten.

## 7. Safety und harte Blocker

Allergene, Ausschluesse und Unvertraeglichkeiten sind harte Blocker.

Regeln:

- Niemals empfehlen, wenn ein harter Blocker sicher oder wahrscheinlich verletzt wird.
- Unsicherheit wird fail-closed behandelt.
- Konflikte werden entfernt, nicht relativiert.
- Es gibt keine Ausschluss-Ausnahmen.

## 8. Vorlieben

Vorlieben sind weiche Ranking-Signale. Sie duerfen Empfehlungen beeinflussen, aber keine sicheren Gerichte allein ausschliessen.

`customPreferences` sind derzeit nicht Teil des aktiven Main-AI-Suchraums.

## 9. Main-AI und Safety-AI

Alle Auswahlpfade nutzen denselben produktiven Hauptaufruf:

`/api/analyze-menu` -> `recommendMainDishesAI()`

Bekannte Pfade:

- Hauptspeisen: `requestedDishRoles = ["main"]`
- Direkter Modus Vorspeisen und Salate: `requestedDishRoles = ["starter", "salad"]`
- Embedded unter Hauptspeisenkarte: gleicher Main-AI-Aufruf mit `requestedDishRoles = ["starter", "salad"]` und `preferredDishRole = "starter"`

Der Embedded-Aufruf ist kein echtes Pairing zu genau einer Hauptspeise, solange keine Hauptspeisen-ID oder Kandidatendaten an OpenAI uebergeben werden.

## 10. Kandidaten- und Empfehlungsgrenzen

- Ohne harte Einschraenkungen: maximal 10 Main-AI-Kandidaten.
- Mit aktiven Allergenen oder harten Ausschluessen: maximal 15 Kandidaten.
- Finale Empfehlung: maximal 3 Gerichte.

Der Safety-Verifier prueft Kandidaten nach dem Hauptaufruf. `conflict` und `uncertain` werden entfernt.

## 11. Sprachmodell

GUI-Sprache und KI-Ausgabesprache sind getrennt.

GUI-Sprache:

- aus erster bevorzugter Geraetesprache
- Deutsch fuer `de*`
- Englisch fuer `en*`
- sonst Englisch

KI-Ausgabesprache:

- Nutzerprofil
- Fallback GUI-Sprache
- Region nur als Kontext

Diese Trennung gilt fuer alle UI-Texte, KI-Antworten, Gerichtsnamen, Beschreibungen, Safety-Hinweise und Uebersetzungen.

## 12. Content-Guidelines

Statische Texte gehoeren nicht in verstreute Codepfade. Code enthaelt Struktur, Logik und Datenmodelle. Texte sollen aus zentralen Content-Quellen, Lokalisierung, Datenbank, CMS oder kontrollierter KI-Generierung stammen.

Regeln duerfen nicht auf frei formulierten Texten basieren. Sie muessen auf strukturierten Feldern wie Kategorien, Tags, Rollen, Attributen oder numerischen Werten operieren.

## 13. Restaurant Discovery

Restaurant Discovery dient nur der Quellenbeschaffung. Sie trifft keine Essensentscheidung, erzeugt keine Restaurantbox und interpretiert keine Speisekarte.

Input:

- Restaurantname
- Stadt
- optional Land und Locale

Output:

- Trefferliste offizieller oder offiziell wirkender Quellen
- nach Nutzerwahl: `websiteUrl`
- optional: `menuUrl`, nur wenn belastbar ermittelt

Plattform-, Social-, Bewertungs- und Lieferdienst-Hosts duerfen nicht als offizielle Restaurant-Website ausgegeben werden.

Eine Menu-URL wird nur akzeptiert, wenn sie erreichbar ist, als Menu-Ressource klassifiziert wurde und zur gleichen registrierbaren Domain gehoert oder anderweitig belastbar offiziell ist.

## 14. TestFlight-Produktstand

TestFlight ist der verbindliche Pruefweg fuer Store-relevante iOS-Versionen. Die Dev-App darf fuer schnelle Entwicklungspruefungen genutzt werden, ersetzt aber keine Store-Abnahme.

Keine App-Store- oder TestFlight-relevante Entscheidung darf auf einem unklaren Build, falscher Variante oder unbewiesener Environment-Konfiguration beruhen.

## 15. Produktqualitaet

Jede Aenderung wird bewertet nach:

1. Produktqualitaet
2. Nutzervertrauen
3. Stabilitaet
4. Wartbarkeit

Technische Eleganz ist niemals wichtiger als Nutzervertrauen.