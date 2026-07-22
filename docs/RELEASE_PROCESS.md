# GustaroAI Release Process

Status: verbindlich fuer Build, TestFlight und Store-relevante iOS-Versionen
Ergaenzt: `AGENTS.md` und `docs/DEVELOPMENT_WORKFLOW.md`

## 1. Grundsatz

Kein Build, kein Submit und keine Buildnummer-Aenderung ohne ausdrueckliche Freigabe von Mario.

TestFlight ist der verbindliche Pruefweg fuer Store-relevante iOS-Versionen. Die Dev-App ist fuer schnelle Entwicklungspruefungen erlaubt, ersetzt aber keine Store-Abnahme.

## 2. Freigabestufen

0. Analyse: Build- und Releasezustand nur lesen.
1. Planung: Build-/Submit-Plan erstellen.
2. Preflight: lokale Voraussetzungen pruefen.
3. Build: Production-Build erstellen.
4. Submit: konkrete Build-ID einreichen.
5. TestFlight-Abnahme: installierte App pruefen.
6. Store-Entscheidung: erst nach erfolgreicher Abnahme.

Keine Stufe wird automatisch uebersprungen.

## 3. Preflight vor Production-Build

Vor jedem Production-Build pruefen:

1. Git-Arbeitsbaum ist bekannt.
2. Es gibt keine unbeabsichtigten Aenderungen.
3. Branch und HEAD sind dokumentiert.
4. Relevanter Typecheck ist erfolgreich.
5. Production API ist erreichbar.
6. EAS Production Environment enthaelt alle benoetigten Public Runtime Values:
   - `EXPO_PUBLIC_PICKFORME_API_URL`
   - `EXPO_PUBLIC_PICKFORME_DEV_MODE=false`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
7. `APP_VARIANT=production` ist fuer Build und Submit eindeutig gesetzt.
8. iOS Bundle Identifier ist `com.marioscordo.gustaroai`.
9. App Store Connect Ziel-App ist GustaroAI mit ASC App ID `6787099278`.
10. Buildnummer ist eindeutig hoeher als beim zuletzt eingereichten Build.
11. Login-relevante Voraussetzungen sind geprueft:
    - Supabase Auth User existiert.
    - User ist bestaetigt.
    - Passwort ist bekannt oder neu gesetzt.
    - Email/Password Auth ist aktiv.

## 4. Production-Build-Regeln

- Production-Builds werden nur mit dem Production-Profil erstellt.
- Der Build-Log muss zeigen, dass Supabase URL und Supabase Anon Key aus der EAS Production Environment geladen wurden.
- Wenn dieser Nachweis fehlt, wird der Build nicht fuer TestFlight verwendet.
- Buildnummern werden nicht nebenbei geaendert.
- Dev-, Preview- und Production-Varianten duerfen nicht vermischt werden.

## 5. Submit-Regeln

- Einreichungen erfolgen bevorzugt mit konkreter Build-ID.
- `--latest` wird fuer Store- oder TestFlight-Submits nicht verwendet, wenn mehrere Builds oder Varianten existieren.
- Vor dem Submit muss `APP_VARIANT=production` gesetzt sein.
- Nach dem Submit wird die lokale Environment-Variable wieder entfernt.

Bekannter Submit-Ablauf:

```powershell
cd D:\Mario\PickForMe\pickforme-product-v1\apps\mobile
$env:APP_VARIANT="production"
npx eas-cli submit --platform ios --id <BUILD_ID>
Remove-Item Env:\APP_VARIANT
```

Codex muss den aktuellen Projektpfad vor Nutzung pruefen. Der bekannte Pfad ist historisches Projektwissen, keine Garantie fuer den aktuellen Arbeitsordner.

## 6. TestFlight-Abnahme

Getestet wird die App GustaroAI aus TestFlight, nicht die Dev-App.

Zu pruefen:

- Installation der korrekten Buildnummer
- Start ohne Environment-Fehler
- Login/Logout
- Profil und KI-Ausgabesprache
- Restaurant- oder Menu-Quelle
- Speisekartenanalyse
- Safety bei Allergenen und Ausschluessen
- finale Empfehlungen
- App-Wechsel und Wiederaufnahme bei laufender Analyse
- relevante Bugfixes des Builds

Stopper werden lokal korrigiert. Danach wird ein neuer Production-Build erstellt und erneut ueber TestFlight geprueft.

## 7. Fehlerregel

Wenn ein Store- oder TestFlight-relevanter Fehler auftritt:

1. Fehler reproduzieren.
2. Ursache eindeutig zuordnen: Code, Backend, Environment, EAS oder App Store Connect.
3. Patch lokal umsetzen.
4. Relevante Tests ausfuehren.
5. Typecheck ausfuehren, sofern verfuegbar.
6. Neuen Production-Build erstellen.
7. Konkrete Build-ID einreichen.
8. In TestFlight erneut testen.

Ein Fehler im Build-, Submit- oder Environment-Prozess darf sich nicht wiederholen.

## 8. Release-Bericht

Jeder Release-Schritt braucht einen Bericht mit:

- Branch
- HEAD
- Git-Status
- Buildnummer
- Build-ID
- Profil/Variant
- Ziel-App
- relevante Environment-Nachweise
- Tests und Ergebnis
- bekannte Risiken
- Freigabestatus

## 9. Nicht erlaubt ohne Freigabe

- `eas build`
- `eas submit`
- `npx eas-cli submit`
- Buildnummer-Aenderung
- Bundle-Identifier-Aenderung
- App-Variant-Aenderung
- Secrets oder EAS Environment veraendern
- App Store Connect Ziel-App wechseln
- `--latest` fuer unklare Submit-Situationen

## 10. Abschlussregel

Ein Release ist erst dann abgeschlossen, wenn die konkrete TestFlight-Version installiert, geprueft und von Mario freigegeben wurde.