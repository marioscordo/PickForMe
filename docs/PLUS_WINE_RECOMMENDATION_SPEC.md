# Gustaro Plus Wine Recommendation Spec

Status: Planungsdokument
Gilt fuer: Gustaro Plus, Weinprofil, Weinempfehlung nach Essensempfehlung
Ergaenzt: `AGENTS.md`, `docs/PROJECT_KNOWLEDGE.md`, `docs/ARCHITECTURE.md`

## 1. Ziel

Gustaro Plus soll als Premium-Schicht fuer optionale Concierge-Funktionen eingefuehrt werden.

Erstes geplantes Plus-Feature:

- Weinempfehlung nach einer Essensempfehlung

Der Nutzer soll nach Auswahl oder Anzeige einer passenden Hauptspeise optional eine dazu passende Weinempfehlung erhalten. Die Funktion soll sich wie ein Restaurant-Concierge anfuehlen, nicht wie ein technischer Zusatzparser.

## 2. Nicht-Ziele

Dieses Dokument beschreibt noch keine Implementierung.

Nicht Teil dieses Planungsumfangs:

- keine Aenderung an Build `1.0.22`
- keine Store-Konfiguration
- keine In-App-Purchase-Implementierung
- keine Aenderung am bestehenden Main-AI-Ranking
- keine Aenderung am Safety-Verifier
- keine Aenderung am bestehenden Essensprofil
- keine neue Datenbanktabelle ohne spaetere Spezifikation
- keine Wein-Erfindung aus unvollstaendigen Quellen

## 3. Produktprinzip

Die bestehende Rollenlogik bleibt verbindlich:

- Restaurant: erzaehlt seine Geschichte.
- Speisekarte und Weinkarte: liefern Fakten.
- GustaroAI: trifft die Empfehlung.

Die Weinempfehlung darf das Hauptgericht interpretieren und daraus ein Pairing ableiten. Sie darf aber keine konkreten Restaurantweine behaupten, wenn keine belastbare Weinkarte vorhanden ist.

## 4. Nutzerflow

Geplanter Flow:

1. GustaroAI liefert wie bisher eine Essensempfehlung.
2. Nach einer empfohlenen Hauptspeise erscheint optional ein Einstieg fuer `Weinempfehlung`.
3. Wenn Gustaro Plus aktiv ist, kann der Nutzer die Weinempfehlung direkt starten.
4. Wenn Gustaro Plus nicht aktiv ist, fuehrt der Einstieg zu einem Plus-Hinweis oder Kauf-Flow.
5. Die Weinempfehlung wird in einem separaten serverseitigen AI-Call erzeugt.
6. Das Ergebnis erscheint nachgelagert zur Essensempfehlung und veraendert diese nicht.

## 5. Gustaro-Plus-Gating

Gustaro Plus ist ein Entitlement, nicht nur ein UI-Schalter.

MVP-Regel:

- Weinempfehlung ist ein Gustaro-Plus-Feature.
- Der Button darf in der UI sichtbar sein, wenn das Feature beworben oder genutzt werden soll.
- Der serverseitige Weinempfehlungs-Endpunkt muss Plus ebenfalls pruefen.
- Ohne aktives Plus darf kein kostenpflichtiger Wine-AI-Call ausgefuehrt werden.

Offen:

- ob Plus als Abo, Lifetime-Kauf oder spaeteres kombiniertes Premium-Paket umgesetzt wird
- wie Store-Receipt-Validierung und Backend-Entitlement technisch abgebildet werden
- ob ein Teaser ohne Plus eine einfache, nicht konkrete Wein-Stil-Empfehlung anzeigen darf

## 6. Weinprofil

Das Weinprofil ist ein eigener Profilunterpunkt und bleibt unabhaengig vom bestehenden Essensprofil.

Moegliche Felder fuer den MVP:

- bevorzugte Weinart: rot, weiss, rose, schaumwein, egal
- Geschmack: trocken, halbtrocken, fruchtig, kraeftig, leicht
- Koerper: leicht, mittel, voll
- Saeure-Toleranz: niedrig, mittel, hoch
- Tannin-Toleranz: niedrig, mittel, hoch
- bevorzugte Rebsorten: optionale Liste
- ausgeschlossene Weinarten oder Rebsorten: optionale Liste
- Preisrahmen: optional
- alkoholfrei oder alkoholarm: optional

Produktregel:

- Weinvorlieben sind weiche Ranking-Signale.
- Klare Ausschluesse wie `kein Alkohol`, `kein Rotwein` oder ausgeschlossene Rebsorten sind harte Grenzen fuer die Weinempfehlung.

## 7. Verhalten mit Weinkarte

Wenn eine belastbare Weinkarte vorhanden ist:

- Die Empfehlung soll konkrete Weine aus der Weinkarte verwenden.
- Name, Jahrgang, Preis, Herkunft und Rebsorte duerfen nur aus der Weinkarte uebernommen werden.
- Wenn mehrere passende Weine vorhanden sind, soll GustaroAI eine beste Empfehlung und maximal eine Alternative nennen.
- Wenn kein sicher passender Wein vorhanden ist, soll GustaroAI das klar sagen und keine konkrete Empfehlung erzwingen.

Verbindliche Grenze:

- Keine konkreten Weine, Jahrgaenge, Preise oder Verfuegbarkeit erfinden.

## 7a. Konkrete Weinauswahl aus vorhandener Speisekartenquelle

Analyse-Stand nach dem ersten Wine-AI-Prototyp:

- Der bestehende Speisekartenparser erkennt Getraenke und Weine grundsaetzlich als `drink`.
- Fuer Hauptspeisenempfehlungen werden `drink`-Eintraege bewusst aus dem normalen Gerichtsergebnis entfernt.
- Die mobile Ergebnisansicht hat den urspruenglichen Speisekarteninput weiterhin verfuegbar:
  - manueller Text: haeufig kompletter Speisekartentext
  - Link oder QR-Code: haeufig nur die URL
  - Foto: kein Text, aber Bildquelle
- Konkrete Weine duerfen deshalb nicht aus `result.dishes` erwartet werden.

Produktentscheidung:

- Der Button bleibt einheitlich `Weinempfehlung`.
- GustaroAI versucht zuerst, aus der vorhandenen Speisekartenquelle konkrete Weine zu erkennen.
- Wenn keine sichere Weinauswahl moeglich ist, faellt GustaroAI auf die bestehende Weinstil-Empfehlung zurueck.
- Der Nutzer muss dafuer im MVP keinen zweiten Flow starten.

Quellen-Prioritaet fuer konkrete Weinauswahl:

1. Explizite Weinkarte, falls spaeter separat bereitgestellt.
2. Vorhandener Speisekartentext, wenn darin Wein-/Getraenkesektionen enthalten sind.
3. Vorhandene URL oder PDF-Quelle, wenn serverseitig erneut auswertbar.
4. Fotoquelle nur spaeter, da Bildauswertung teurer, langsamer und fehleranfaelliger ist.

Server-Verhalten:

1. Der Wein-Endpunkt erhaelt weiterhin das gewaehlte Hauptgericht und das Weinprofil.
2. Zusaetzlich darf er eine Menuequelle erhalten:
   - `menuText`
   - `menuUrls`
   - optional spaeter `wineMenuText`
   - optional spaeter `wineMenuImageSource`
3. Der Server extrahiert daraus zuerst nur Wein-/Getraenkekandidaten.
4. Der AI-Call darf konkrete Weine nur aus diesen Kandidaten auswaehlen.
5. Wenn keine belastbaren Kandidaten vorhanden sind, wird keine konkrete Weinkarte behauptet.

MVP-Heuristik fuer Wein-Kandidaten:

- Kandidat muss aus sichtbarem Quellentext stammen.
- Kandidat muss wie ein Wein oder Schaumwein wirken, nicht nur wie eine Getraenkekategorie.
- Kandidat darf optionale Felder haben:
  - Name
  - Rebsorte
  - Herkunft/Region
  - Jahrgang
  - Preis
  - Glas/Flasche
  - Originalzeile als Beleg
- Ohne Originalbeleg darf kein konkreter Wein empfohlen werden.

Empfohlener API-Output fuer die naechste Ausbaustufe:

```ts
{
  recommendationType: "concrete_wine" | "wine_style" | "none";
  title: string;
  wineStyle?: string;
  primaryWine?: {
    nameOriginal: string;
    displayName: string;
    grapeOrStyle?: string;
    region?: string;
    vintage?: string;
    priceRaw?: string;
    servingUnit?: "glass" | "bottle" | "unknown";
    sourceEvidence: string;
  };
  reason: string;
  alternativeWine?: {
    nameOriginal: string;
    displayName: string;
    sourceEvidence: string;
    reason: string;
  };
  fallbackReason?: string;
  confidence: "high" | "medium" | "low";
}
```

UI-Regel:

- Bei `concrete_wine`: konkrete Weinbox mit Name, Preis falls vorhanden, Beleg und kurzer Begruendung.
- Bei `wine_style`: bestehende Weinstilbox.
- Bei `none`: kurze, ehrliche Meldung, dass keine sichere Weinempfehlung moeglich ist.

Offene technische Entscheidung:

- Ob Wein-Kandidaten zuerst deterministisch aus Text geparst werden oder ob ein kleiner separater AI-Extraktionsschritt genutzt wird.
- Empfehlung fuer MVP: deterministische Vorfilterung plus AI-Auswahl, damit konkrete Weine immer auf sichtbarem Quellentext beruhen.

## 8. Verhalten ohne Weinkarte

Wenn keine belastbare Weinkarte vorhanden ist:

- GustaroAI darf nur einen passenden Weinstil empfehlen.
- Beispiele: trockener Riesling, mineralischer Gruener Veltliner, leichter Pinot Noir, kraeftiger Chianti.
- Die Ausgabe muss klar machen, dass es sich nicht um einen konkreten Wein des Restaurants handelt.

Diese Variante kann spaeter als Plus-Teaser oder Basisfunktion diskutiert werden. Sie ist nicht automatisch Teil des MVP.

## 9. Server-seitiger AI-Call

Die Weinempfehlung soll ueber einen separaten serverseitigen AI-Call laufen.

Konzeptueller Input:

```ts
{
  selectedDish: {
    id?: string;
    name: string;
    translatedName?: string;
    description?: string;
    ingredients?: string[];
    dishRole?: string;
    price?: string;
  };
  wineProfile?: {
    preferredTypes?: string[];
    taste?: string[];
    body?: string;
    acidityTolerance?: string;
    tanninTolerance?: string;
    preferredGrapes?: string[];
    excludedTypesOrGrapes?: string[];
    priceRange?: string;
    alcoholPreference?: string;
  };
  wineMenuText?: string;
  outputLocale: string;
  userLocale?: string;
}
```

Konzeptueller Output:

```ts
{
  recommendationType: "concrete_wine" | "wine_style" | "none";
  primaryRecommendation?: {
    nameOrStyle: string;
    reason: string;
    source: "wine_menu" | "general_pairing";
  };
  alternative?: {
    nameOrStyle: string;
    reason: string;
    source: "wine_menu" | "general_pairing";
  };
  limitations?: string[];
}
```

Diese Typen sind Planungsbeispiele und noch kein API-Vertrag.

## 10. Safety- und Content-Regeln

Verbindlich:

- Kein Wein empfehlen, wenn ein klarer harter Ausschluss verletzt wird.
- `kein Alkohol` blockiert alkoholische Weinempfehlungen.
- Unsichere Ausschlussfaelle werden fail-closed behandelt.
- Keine gesundheitlichen Versprechen.
- Keine Behauptung, ein Wein sei im Restaurant verfuegbar, wenn die Weinkarte dies nicht belegt.
- Keine Aenderung an bestehenden Essensempfehlungen durch das Weinfeature.

## 11. MVP-Scope

Empfohlener MVP:

- separater Profilbereich `Wein Praeferenz`
- Feature-Gate fuer Gustaro Plus
- Button nach Hauptspeisenempfehlung
- separater Backend-Endpunkt fuer Weinempfehlung
- serverseitiger AI-Call
- Antwort mit einer Empfehlung und optional einer Alternative
- Verhalten ohne Weinkarte als Stil-Empfehlung nur nach bewusster Produktentscheidung

Nicht im MVP:

- vollstaendiger Weinkartenparser
- Sommelier-Chat
- Food-Pairing fuer alle Gangs
- automatische Restaurant-Weinsuche im Web
- komplexe Keller-, Jahrgangs- oder Terroirlogik
- Creditsystem

## 12. Risiko-Einstufung

Gesamtfeature: HIGH

Gruende:

- neues Premium-/Entitlement-Verhalten
- moegliche In-App-Purchase-Integration
- neuer serverseitiger AI-Call
- neue Profilfelder oder Persistenz
- neuer API-Vertrag
- Safety-Regeln fuer Alkohol und Ausschluesse

Diese Spec-Datei selbst ist LOW, da sie nur Planung dokumentiert und keine Produktlogik aendert.

## 13. Integration in GustaroAI Build 1.0.22

Build `1.0.22` ist die stabile Referenz und darf durch die Plus-/Weinfeature-Arbeit nicht nebenbei veraendert werden.

Verbindliche Integrationsregeln:

- Die Entwicklung erfolgt zuerst isoliert im Worktree `pickforme-product-v1-gustaro-plus`.
- Der gueltige Build-Stand `1.0.22` bleibt bis zur ausdruecklichen Integrationsfreigabe unveraendert.
- Eine spaetere Uebernahme in GustaroAI erfolgt nur ueber einen separaten Integrationsplan.
- Vor Integration muessen Branch, HEAD, Diff, betroffene Dateien, API-Vertraege, Profilfelder und Tests dokumentiert werden.
- Die Integration darf nicht als pauschaler Merge erfolgen, wenn dadurch unklare oder unfertige Featureteile in den stabilen Build gelangen.
- Plus-/IAP-, Entitlement-, Profil-, API- und AI-Aenderungen muessen einzeln pruefbar bleiben.
- Ohne erfolgreiches Scope-Audit darf keine Store-, Build- oder Submit-Freigabe vorbereitet werden.

Integrationsziel:

- GustaroAI Build `1.0.22` soll nur die bewusst freigegebenen, getesteten und rueckbaubaren Teile des Plus-/Weinfeatures erhalten.
- Bestehende Essensempfehlungen, Safety-Regeln, Sprache, Auth und Release-Konfiguration duerfen sich nicht als Nebeneffekt veraendern.

## 14. Offene Entscheidungen

- Soll Gustaro Plus als Abo oder Einmalkauf starten?
- Wo wird das Plus-Entitlement serverseitig gespeichert und validiert?
- Wird das Weinprofil lokal, in Supabase oder hybrid gespeichert?
- Soll eine einfache Wein-Stil-Empfehlung ohne Weinkarte auch fuer Nicht-Plus-Nutzer als Teaser sichtbar sein?
- Wie wird eine Weinkarte im UI bereitgestellt oder erkannt?
- Welche genaue Variable repraesentiert die gewaehlte Hauptspeise im aktuellen Frontend/API-Flow?
- Welche Tests decken Plus-Gating, Weinprofil und Wine-AI-Response ab?

## 15. Naechster sinnvoller Schritt

Vor Implementierung:

1. Bestehenden Recommendation-Flow lesen.
2. Bestehende Profilstruktur lesen.
3. Bestehende API-Routen und AI-Call-Patterns lesen.
4. Entscheidung zu Plus-Kaufmodell und Entitlement-Datenfluss treffen.
5. Danach eine kleine Implementierungsplanung mit Dateiliste und Teststrategie erstellen.
