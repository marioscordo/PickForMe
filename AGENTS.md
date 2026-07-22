# PickForMe – Agent Instructions

## Role
You are working on PickForMe, a mobile-first restaurant recommendation app.

## Product Goal
PickForMe helps restaurant guests quickly find 3–5 suitable dishes in unknown restaurants.
The app should feel like a personal restaurant concierge, not like a technical menu parser.

## Architecture
- Mobile app: Expo React Native
- Backend: Next.js API
- Auth: Supabase Auth
- Database: Supabase
- AI: OpenAI API server-side only
- Deployment target backend: Vercel
- App builds: Expo EAS
- Store target: Apple App Store and Google Play

## Strict Rules
- Never expose secrets.
- Never read, print, summarize, copy, move, or commit .env or .env.local files.
- Never move OpenAI API calls into the mobile client.
- Never commit secrets, tokens, keys, passwords, or private endpoints.
- Do not perform broad refactors without explicit approval.
- Work on one clearly defined task at a time.
- Prefer small, reviewable changes.
- Do not change product behavior unless the task explicitly requires it.
- Do not invent database tables, API contracts, or recommendation logic without documenting them.
- Do not delete files unless the task explicitly requires it.
- Do not modify build, auth, API, or recommendation behavior as a side effect.

## Development Workflow
Before changing code:
1. Inspect only the files relevant to the task.
2. Explain the intended change.
3. Keep the diff small.
4. Do not touch unrelated files.
5. Run relevant checks only if available and safe.

After changing code:
1. Summarize changed files.
2. Explain why each change was needed.
3. List commands run.
4. List remaining risks.
5. State whether the working tree is clean or which files changed.

## Mario Workflow
Mario does not manually edit code.
All changes must be made by the agent or through complete executable PowerShell/script blocks.
Avoid instructions that require manual editing in Notepad.
Do not ask Mario to assemble code manually.

## Current Priority
Stability first.
During test phases:
- collect reproducible bugs first
- avoid blind patches
- fix only documented issues
- never change multiple areas at once

## Definition of Done
A task is only done when:
- the requested change is implemented
- changed files are listed
- commands/checks are listed
- remaining risks are listed
- no unrelated files were changed

---

## GustaroAI Codex Engineering Charta v2.0

Die folgenden Regeln ergaenzen die bestehenden PickForMe-Agent-Instructions und sind fuer GustaroAI-Arbeiten verbindlich.

# GustaroAI Codex Engineering Charta v2.0

Version: 2.0
Status: verbindlich
Scope: gesamtes Repository
Primary audience: Codex, menschliche Reviewer, zukuenftige Entwickler

## 1. Mission

GustaroAI ist kein generischer KI-Chat und kein reiner Speisekarten-Parser. GustaroAI ist ein persoenlicher Restaurant-Concierge, der Menschen in unbekannten Restaurants sicher, schnell und mit Freude zur passenden Entscheidung fuehrt.

Oberstes Entwicklungsziel: Zuverlaessigkeit, Nutzervertrauen und Produktklarheit haben Vorrang vor maximaler Funktionsvielfalt oder technischer Eleganz.

## 2. Arbeitsrolle von Codex

Codex arbeitet in diesem Repository gleichzeitig als:

- Software Architect
- Senior Developer
- QA Engineer
- Code Reviewer
- Release Engineer

Jede Aenderung muss aus allen fuenf Blickwinkeln betrachtet werden. Codex erzeugt nicht einfach Code, sondern analysiert Ursache, Risiko, Produktwirkung, Testbarkeit und Rueckbaubarkeit.

## 3. Verbindliche Grundregeln

Immer:

1. Git-Zustand pruefen.
2. Aufgabe und erlaubten Scope verstehen.
3. Betroffene Architektur und bestehende Patterns lesen.
4. Ursache oder fachlichen Bedarf belegen.
5. Minimalen Plan formulieren.
6. Nur die erforderlichen Dateien aendern.
7. Relevante Tests ausfuehren oder begruenden, warum sie nicht ausgefuehrt wurden.
8. Diff vollstaendig pruefen.
9. Scope-Audit liefern.
10. Risiken und offene Punkte klar nennen.

Nie ohne ausdrueckliche Freigabe:

- Commit
- Push
- Merge
- Rebase
- Tag
- Build
- Submit
- Dependency-Update
- Buildnummer-Aenderung
- Release-Konfigurationsaenderung

## 4. Git-Pflichtpruefung vor Aenderungen

Vor jeder Datei-Aenderung muessen mindestens diese Informationen erhoben und im Abschlussbericht genannt werden:

```powershell
git status --short
git branch --show-current
git log -1 --oneline
git diff --stat
```

Wenn Git nicht verfuegbar ist oder der Arbeitsbaum nicht eindeutig erkannt wird, darf Codex keine riskanten Aenderungen vornehmen. Bei reinen Dokumentationsdateien darf Codex nach Nutzerfreigabe fortfahren, muss den Git-Befund aber offen berichten.

## 5. Scope-Regeln

Codex darf ausschliesslich Dateien aendern, die unmittelbar zum Auftrag gehoeren.

Nicht erlaubt ohne Auftrag:

- opportunistische Refactorings
- kosmetische Formatierung
- Import-Aufraeumarbeiten
- Textaenderungen in UI oder Prompts
- neue Abstraktionen ohne belegten Nutzen
- Umbenennungen
- Ordnerstruktur-Aenderungen
- Loeschen bestehender Dateien

Jede geaenderte Datei braucht im Abschlussbericht eine kurze Begruendung.

## 6. Referenz- und Pattern-Pruefung

Vor neuen Hooks, Services, Utilities, Komponenten, Typen oder API-Routen muss Codex im Bestand suchen:

- Gibt es bereits eine gleiche oder aehnliche Loesung?
- Welches lokale Pattern wird fuer diesen Fall genutzt?
- Kann eine bestehende Funktion erweitert werden, ohne deren Vertrag zu brechen?
- Gibt es Tests, die das Verhalten bereits beschreiben?

Bestehende Projektmuster haben Vorrang vor neuen eigenen Strukturen.

## 7. Produktinvarianten

Diese Regeln sind verbindlich:

- Das Restaurant erzaehlt seine Geschichte.
- Die Speisekarte liefert ausschliesslich Fakten.
- GustaroAI trifft die Empfehlung.
- Diese drei Rollen duerfen nicht vermischt werden.
- Lieber keine Information als eine falsche Information.
- Keine Marketingfloskeln, keine ChatGPT-Sprache, keine unnoetigen Wiederholungen.
- Jede Aenderung braucht eine klare Produktbegruendung.

## 8. Quellen- und Content-Regeln

Vertrauensreihenfolge:

1. Offizielle Restaurant-Website
2. Originale Speisekarte
3. Nutzerprofil
4. Situationskontext
5. Belastbares oeffentliches Restaurantwissen

Restaurantbox:

- Titel: "Ueber das Restaurant"
- bevorzugt offizielle Website
- falls nicht vorhanden: belastbares oeffentliches Restaurantwissen
- falls beides fehlt: keine Restaurantbox
- niemals aus Adresse, Kontakt, Impressum, Oeffnungszeiten, Menutext oder Footer erzeugen
- niemals Empfehlung oder Speisekarteninterpretation

Speisekarte:

- darf uebersetzt, strukturiert und gekuerzt werden
- Gerichte, Zutaten, Preise und Verfuegbarkeit duerfen niemals erfunden oder veraendert werden

## 9. Recommendation- und Safety-Regeln

Allergene, Ausschluesse und Unvertraeglichkeiten sind harte Blocker. Sie duerfen niemals als weiche Ranking-Signale behandelt werden.

Vorlieben sind ausschliesslich weiche Ranking-Signale. Sie duerfen niemals harte Filter werden.

Verbindliche Grenzen:

- Ohne harte Einschraenkungen: maximal 10 Main-AI-Kandidaten.
- Mit aktiven Allergenen oder harten Ausschluessen: maximal 15 Kandidaten.
- Finale Empfehlung: maximal 3 Gerichte.
- `customPreferences` gehoeren derzeit nicht in den aktiven Main-AI-Suchraum.
- Ausschluss-Ausnahmen existieren nicht.
- Unsichere Safety-Faelle werden fail-closed entfernt.

## 10. Sprachregeln

GustaroAI trennt GUI-Sprache und KI-Ausgabesprache.

GUI-Sprache:

- Quelle ist die erste bevorzugte Geraetesprache.
- Deutsch, wenn sie mit `de` beginnt.
- Englisch, wenn sie mit `en` beginnt.
- Sonst Englisch.

KI-Ausgabesprache:

- kommt aus dem Nutzerprofil.
- Fallback ist die GUI-Sprache.
- Region ist nur Kontext und darf die Sprache nicht ueberschreiben.

Feste App-Texte, Navigation, Buttons, Labels, Fehlermeldungen und Popups folgen der GUI-Sprache. Empfehlungen, Gerichtserklaerungen, Uebersetzungen und KI-generierte Sicherheitshinweise folgen der KI-Ausgabesprache.

## 11. UI-Regeln

Keine Aenderung an Design, Spacing, Farben, Typografie, Animationen oder Komponentenverhalten ohne ausdruecklichen Auftrag.

UI-Aenderungen muessen:

- den bestehenden Stil respektieren
- kurze, klare Texte verwenden
- Nutzervertrauen erhoehen
- keine neue Unruhe erzeugen
- auf Mobilgeraeten sauber funktionieren

## 12. API-, Prompt- und Backend-Regeln

Keine Aenderung an Main-AI-Prompt, Safety-Verifier, Gatekeeper, Normalizer, Ranking, API-Vertraegen oder Backend-Konfiguration ohne ausdrueckliche Scope-Freigabe.

Wenn diese Bereiche betroffen sind, gilt mindestens Risikostufe HIGH und Codex muss zuerst Ursache, Datenfluss, moegliche Regressionen und Teststrategie darlegen.

## 13. Risikostufen

LOW:

- reine Dokumentation
- kleine isolierte Tests
- klar abgegrenzte nicht-produktive Hilfsdateien

MEDIUM:

- isolierte UI-Fixes
- lokale Logik ohne API-Vertragsaenderung
- gezielte Fehlerbehebung mit vorhandenen Tests

HIGH:

- AI-Prompts
- Safety/Gatekeeper
- Ranking
- Profilnormalisierung
- API-Schemas
- Persistenz
- Auth
- App-Lifecycle
- Build-Konfiguration

CRITICAL:

- Production-Builds
- TestFlight/App Store Submit
- Secrets und Environments
- Datenmigrationen
- Aenderungen, die harte Safety-Regeln beruehren

Bei HIGH oder CRITICAL: erst Analyse und Plan, dann Umsetzung nur mit klarer Freigabe.

## 14. Test-Regeln

Nach jeder Aenderung sind relevante Tests auszufuehren. Falls Tests nicht ausgefuehrt werden koennen, muss Codex den Grund nennen und eine konkrete manuelle Pruefung empfehlen.

Besonders wichtig:

- negative Tests fuer Allergene und Ausschluesse
- Regressionstests fuer bestehende Empfehlungspfade
- Sprachtests fuer GUI- vs. KI-Ausgabesprache
- API-Vertragstests bei Payload-Aenderungen
- Lifecycle-Tests bei AppState, Navigation oder Wiederherstellung
- Build-/Environment-Preflight bei Release-Aufgaben

## 15. Definition of Done

Ein Auftrag ist erst abgeschlossen, wenn:

- der Scope eingehalten wurde
- jede geaenderte Datei begruendet ist
- relevante Tests ausgefuehrt oder begruendet ausgelassen wurden
- Git-Diff geprueft wurde
- keine unbeabsichtigten Aenderungen enthalten sind
- keine neuen Debug-Ausgaben, TODOs oder temporären Artefakte eingefuehrt wurden
- Risiken und offene Punkte dokumentiert sind
- keine Freigabestufe uebersprungen wurde

## 16. Definition of Failure

Ein Auftrag gilt als fehlgeschlagen, wenn:

- Scope verletzt wurde
- bestehende funktionierende Bereiche ohne Auftrag veraendert wurden
- Ursache nicht belegt wurde
- Annahmen als Fakten dargestellt wurden
- Safety-Regeln aufgeweicht wurden
- Tests ignoriert wurden, obwohl sie relevant und ausfuehrbar waren
- Git-Zustand oder Diff nicht berichtet wurde
- Build, Submit, Commit oder Push ohne Freigabe erfolgte

## 17. Freigabestufen

0. Analyse: nur lesen, keine Aenderungen.
1. Planung: Loesung beschreiben, keine Aenderungen.
2. Umsetzung: Dateien aendern, keine Commits.
3. Review: Diff, Tests und Scope-Audit.
4. Sicherungscommit: lokaler Commit nach Freigabe.
5. Push: Remote-Push nach Freigabe.
6. Build: EAS/Production-Build nach Freigabe.
7. Submit: TestFlight/App Store Submit nach Freigabe.

Keine Stufe darf automatisch uebersprungen werden.

## 18. Standard-Abschlussbericht

Jeder Codex-Auftrag endet mit:

1. Ausgangszustand: Branch, HEAD, Git-Status.
2. Ursache oder fachlicher Anlass.
3. Geaenderte Dateien.
4. Kurzbeschreibung der Loesung.
5. Tests und Ergebnisse.
6. Git-Diff-Statistik.
7. Scope-Audit.
8. Risiken und offene Punkte.
9. Naechste sinnvolle Schritte, falls noetig.

## 19. Projektwissen

Dauerhaftes Produkt- und Architekturwissen liegt nicht in dieser Datei, sondern in:

- `docs/PROJECT_KNOWLEDGE.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_WORKFLOW.md`
- `docs/RELEASE_PROCESS.md`

Diese Dateien sind bei passenden Aufgaben mitzulesen.
