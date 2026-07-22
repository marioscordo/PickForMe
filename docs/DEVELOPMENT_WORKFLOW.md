# GustaroAI Development Workflow

Status: verbindlicher Arbeitsprozess
Ergaenzt: `AGENTS.md`

## 1. Ziel

Dieser Workflow stellt sicher, dass Aenderungen an GustaroAI nachvollziehbar, klein, testbar und produktkonform bleiben.

## 2. Standardablauf

1. Auftrag verstehen.
2. Git-Zustand pruefen.
3. Relevante Dokumentation lesen.
4. Betroffene Dateien und Patterns analysieren.
5. Ursache oder Produktbedarf belegen.
6. Risiko einstufen.
7. Plan formulieren.
8. Umsetzung nur im erlaubten Scope.
9. Tests ausfuehren.
10. Diff pruefen.
11. Scope-Audit liefern.
12. Keine Freigabestufe ueberspringen.

## 3. Vor jeder Aenderung

Pflicht:

```powershell
git status --short
git branch --show-current
git log -1 --oneline
git diff --stat
```

Zusaetzlich pruefen:

- Gibt es uncommittete fremde Aenderungen?
- Ist der Branch passend?
- Sind AGENTS.md und relevante docs gelesen?
- Gibt es bestehende Tests oder Regression-Cases?
- Gibt es ein lokales Pattern fuer die Loesung?

## 4. Analysephase

Codex muss zuerst verstehen:

- Ist-Verhalten
- Soll-Verhalten
- betroffene Nutzerwege
- betroffene Datenfluesse
- betroffene Komponenten
- moegliche Regressionen
- harte Produktregeln

Bei Bugs gilt: nicht raten. Logs, Call-Graph, State-Flow, Lifecycle, Navigation und Renderpfade pruefen.

## 5. Risikoeinstufung

LOW:

- Dokumentation
- isolierte Tests
- nicht-produktive Hilfsdateien

MEDIUM:

- kleine UI- oder Logikfixes
- klar begrenzte Feature-Ergaenzungen

HIGH:

- Prompt
- Safety
- Gatekeeper
- Ranking
- API-Schema
- Auth
- Persistenz
- Lifecycle
- Build-Konfiguration

CRITICAL:

- Production Build
- TestFlight/App Store Submit
- Secrets
- Datenmigrationen
- Safety-Invarianten

Bei HIGH und CRITICAL: erst Architektur- und Testplan, dann Umsetzung nach Freigabe.

## 6. Implementierungsregeln

- Kleine Diffs bevorzugen.
- Bestehende Patterns nutzen.
- Keine neuen Abhaengigkeiten ohne Freigabe.
- Keine Datei nur aus Stilgruenden formatieren.
- Keine fremden uncommitteten Aenderungen zuruecksetzen.
- Keine Debug-Ausgaben hinterlassen.
- Keine TODOs als Ersatz fuer fertige Loesung einfuehren.

## 7. Teststrategie

Tests richten sich nach Risiko:

- Dokumentation: Rechtschreibung, Konsistenz, Links, Scope.
- UI: relevante Screens, Sprache, leere und lange Inhalte.
- API: Request/Response-Vertrag, Schema, Fehlerfaelle.
- AI/Safety: harte Blocker, Unsicherheit, entfernte Kandidaten, leere Ergebnisse.
- Lifecycle: App-Wechsel, Wiederaufnahme, doppelte Requests, verlorener Zustand.
- Release: Typecheck, Environment, Bundle Identifier, Buildnummer, Ziel-App.

Wenn Tests nicht ausgefuehrt werden, muss Codex den Grund berichten.

## 8. Reviewphase

Vor Abschluss pruefen:

- Welche Dateien sind geaendert?
- Warum genau diese Dateien?
- Entspricht jede Aenderung dem Auftrag?
- Wurden bestehende funktionierende Bereiche beruehrt?
- Gibt es unbeabsichtigte Formatierung?
- Sind Produktinvarianten erhalten?
- Sind Tests passend?
- Gibt es neue Risiken?

## 9. Scope-Audit

Der Abschlussbericht enthaelt:

- erlaubter Scope
- tatsaechlich geaenderte Dateien
- Begruendung pro Datei
- Bestaetigung, dass keine bestehenden Dateien veraendert wurden, falls der Auftrag nur neue Dateien erlaubte
- Bestaetigung, dass kein Commit, Push, Build oder Submit erfolgte

## 10. Standard-Abschlussbericht

Format:

```text
Ausgangszustand
- Branch:
- HEAD:
- Git-Status:

Ursache / Anlass
- ...

Geaenderte Dateien
- Pfad: Zweck

Tests
- Ausgefuehrt:
- Ergebnis:
- Nicht ausgefuehrt:

Git-Diff
- Statistik:

Scope-Audit
- ...

Risiken / Offene Punkte
- ...
```

## 11. Zusammenarbeit mit Mario

Mario trifft Produkt- und Freigabeentscheidungen. Codex setzt nur den freigegebenen Umfang um und berichtet transparent.

Bei Unklarheit gilt:

- keine riskante Annahme treffen
- kurz Rueckfrage stellen
- oder konservativ nur Analyse liefern

## 12. Keine automatischen Folgeaktionen

Aus einer erfolgreichen Umsetzung folgt nicht automatisch:

- Commit
- Push
- Build
- Submit
- Release Notes
- Dependency-Update
- weiterer Refactor

Jede Folgeaktion braucht separate Freigabe.