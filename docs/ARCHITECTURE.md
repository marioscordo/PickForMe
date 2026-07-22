# GustaroAI Architecture

Status: Orientierung fuer Codex und Entwickler
Ergaenzt: `AGENTS.md` und `docs/PROJECT_KNOWLEDGE.md`

## 1. Architekturprinzip

GustaroAI trennt Quelle, Analyse, Safety, Empfehlung und Darstellung. Jede Komponente soll eine klare Verantwortung haben und keine Produktrolle einer anderen Komponente uebernehmen.

## 2. Bekannte Hauptbereiche

Das Projekt enthaelt mindestens:

- `src/`: bestehende Produkt- und Routine-Implementierungen im aktuellen Projektstand
- `docs/`: Projektdokumentation, Routinen und Regression-Cases
- `.agents/`: vorhandene Agenten-Konfiguration, sofern gepflegt

Aus vorhandenen Projektunterlagen sind ausserdem folgende Zielbereiche bekannt:

- Mobile App
- API/Backend
- OpenAI-Integration
- Supabase/Auth
- EAS/TestFlight-Releasepfad

Codex muss vor konkreten Codeaenderungen die tatsaechliche aktuelle Ordnerstruktur pruefen, da diese Dokumentation keine Live-Dateiliste ersetzt.

## 3. Analyze-Menu Pipeline

Produktiver Hauptpfad:

`/api/analyze-menu` -> `recommendMainDishesAI()`

Konzeptueller Ablauf:

1. Mobile App sammelt Speisekarte, Rollenraum, Nutzerprofil, Locale und Kontext.
2. API baut den Analyseauftrag.
3. Main AI erzeugt strukturierte Kandidaten und Empfehlungen.
4. Response wird geparst und gegen Schema validiert.
5. Safety-Verifier prueft harte Einschraenkungen.
6. Unsichere oder konfliktbehaftete Kandidaten werden entfernt.
7. Empfehlungen werden aus sicheren Kandidaten neu aufgebaut.
8. Gatekeeper filtert akzeptierte Empfehlungen.
9. Mapper erzeugt API-Response fuer Mobile.
10. Mobile stellt finale Empfehlungen dar.

## 4. Mobile Payload

Bekannter REST-Body:

```ts
{
  sourceKind: "text",
  menuText,
  menuUrls?,
  requestedDishRoles,
  preferredDishRole?,
  diagnosticRunId?,
  profile: {
    displayName,
    outputLocale,
    primaryLikes,
    customExclusions,
    allergens
  },
  userLocale,
  deviceLocale?
}
```

Hidden Preferences und Hidden Exclusions werden nicht an die AI gesendet.

## 5. OpenAI-Hauptaufruf

Der produktive Hauptaufruf nutzt den gewaehlten Two-Step-Source-Content und einen User-Prompt. Es gibt keinen separaten System-Prompt fuer diesen Pfad, sofern die Implementierung nicht spaeter bewusst geaendert wurde.

Modellwahl laut bestehender Dokumentation:

- image: `OPENAI_IMAGE_MODEL || OPENAI_PDF_MODEL || OPENAI_MODEL || "gpt-4o-mini"`
- pdf: `OPENAI_PDF_MODEL || OPENAI_MODEL || "gpt-4o-mini"`
- html/text: `OPENAI_MODEL || "gpt-4o-mini"`

Codex muss vor Prompt- oder Modell-Aenderungen die aktuelle Implementierung lesen.

## 6. Main-AI Response Contract

Bekannte Felder:

```ts
{
  allDishes,
  removedDishes,
  safeCandidates,
  recommendations
}
```

Nach Safety:

- entfernte Kandidaten werden in `removedDishes` aufgenommen
- `safeCandidates` wird gefiltert
- `recommendations` werden nur aus sicheren Kandidaten aufgebaut
- falls nichts Sicheres bleibt, darf keine unsichere Empfehlung erzwungen werden

## 7. Safety-Verifier

Der Safety-Verifier nutzt einen separaten OpenAI-Call und prueft aktive Allergene, Ausschluesse und Unvertraeglichkeiten gegen Kandidaten.

Regel:

- `conflict` entfernen
- `uncertain` entfernen
- fail-closed statt riskanter Empfehlung

Safety-Aenderungen sind mindestens HIGH-Risk.

## 8. Mapper und API Response

Bekannte Zielstruktur:

```ts
dishes: [
  {
    id,
    name,
    nameOriginal,
    translatedName,
    description,
    descriptionOriginal,
    price,
    dishRole,
    dishRoles,
    primaryRole
  }
],
recommendations: [
  {
    dishId,
    rank,
    reason,
    translatedDescription,
    descriptionOriginal
  }
]
```

Der Mapper darf keine neuen Fakten erfinden. Enrichment darf nur vorhandene und belastbare Informationen strukturieren.

## 9. Dish Roles

Bekannte Rollenraeume:

- `main`
- `starter`
- `salad`

Hauptspeisenmodus, direkter Vorspeisen-/Salatmodus und Embedded-Modus verwenden denselben Hauptaufruf mit unterschiedlichen Rollenparametern.

## 10. Restaurant Discovery Architecture

Restaurant Discovery ist provider-neutral. Die Entscheidungsroutine soll strukturierte Signale verwenden, nicht sprachspezifische Wortlisten.

Provider-Schnittstelle laut vorhandener Routine:

```ts
type DiscoveryProvider = {
  searchRestaurant(input: DiscoveryInput): Promise<SearchResult[]>;
  fetchResource(url: string): Promise<FetchedResource>;
  discoverLinkedResources(url: string): Promise<LinkedResource[]>;
};
```

Downstream-Vertrag:

```ts
{
  websiteUrl: string;
  menuUrl?: string;
}
```

Wenn `menuUrl` fehlt, muss die Weiterverarbeitung eine manuelle URL-Abfrage anbieten oder ohne Speisekarte abbrechen. Sie darf keine Speisekarte raten.

## 11. Sprache und Lokalisierung

Architekturregel:

- GUI-Sprache wird aus dem Geraet abgeleitet.
- KI-Ausgabesprache wird aus dem Profil abgeleitet.
- Region ist nur Kontext.

Code darf diese Verantwortlichkeiten nicht vermischen.

## 12. Build- und Release-Architektur

Store-relevante iOS-Versionen laufen ueber EAS Production Build und TestFlight.

Bekannte Production-Ziele:

- Bundle Identifier: `com.marioscordo.gustaroai`
- App Store Connect App ID: `6787099278`
- Production API und Supabase Runtime Values muessen aus der EAS Production Environment kommen

Release-Aenderungen sind mindestens HIGH-Risk, Submit und Store-Schritte CRITICAL.

## 13. Architektur-Aenderungsregel

Vor jeder Architektur-Aenderung muss Codex beantworten:

- Welche Komponente ist verantwortlich?
- Welcher Datenfluss aendert sich?
- Welche bestehenden Vertraege aendern sich?
- Welche Regressionen sind moeglich?
- Welche Tests belegen das neue Verhalten?
- Warum ist die Aenderung produktfachlich notwendig?