# GustaroAI Configuration Audit

## Zweck

Diese Datei dokumentiert das Ergebnis des ersten gezielten Konfigurations-Audits fÃ¼r GustaroAI. Sie verÃ¤ndert keine Produktlogik, keine Build-Konfiguration und keine App-FunktionalitÃ¤t.

## Ergebnis des Audits

Im Projekt existieren mehrere Konfigurationsquellen, die teilweise dieselben Aspekte der mobilen Expo-App unterschiedlich definieren.

Betroffene Bereiche:

- `apps/mobile/app.config.js`
- `apps/mobile/app.json`
- `apps/mobile/eas.json`
- Workspace- und Package-Skripte
- TypeScript-Konfiguration

Die wichtigste Inkonsistenz liegt zwischen `apps/mobile/app.config.js` und `apps/mobile/app.json`.

## FÃ¼hrende Expo-Konfiguration

`apps/mobile/app.config.js` sollte vermutlich die fÃ¼hrende Expo-Konfiguration sein.

GrÃ¼nde:

- Die Datei unterstÃ¼tzt dynamische Variantenlogik.
- Sie passt zur EAS-Steuerung Ã¼ber `APP_VARIANT`.
- Sie kann unterschiedliche Werte fÃ¼r Entwicklung und Produktion ableiten.
- Sie ist flexibler als eine statische `app.json`.

## WidersprÃ¼che zwischen app.config.js und app.json

Die beiden Dateien definieren dieselbe App teilweise unterschiedlich.

Bekannte Abweichungen:

- App-Name
- URL-Scheme
- UI-Style
- iOS Bundle Identifier
- iPad-Support
- Android Package Name
- EAS Project ID

Das ist riskant, weil unklar wird, welche Datei im konkreten Build-Kontext maÃŸgeblich ist.

## Risiko in eas.json

`apps/mobile/eas.json` enthÃ¤lt eine feste lokale LAN-Adresse:

- `http://192.168.178.158:3000`

Das ist fÃ¼r lokale Entwicklung praktisch, aber fÃ¼r reproduzierbare Builds riskant.

Risiken:

- Builds funktionieren nur in einem bestimmten lokalen Netzwerk.
- Andere GerÃ¤te oder Build-Umgebungen kÃ¶nnen die API nicht erreichen.
- Cloud-/CI-Builds wÃ¤ren damit nicht zuverlÃ¤ssig reproduzierbar.

## SpÃ¤ter sinnvolle Ã„nderungen

Sinnvolle spÃ¤tere Mini-Tasks:

1. `app.config.js` als fÃ¼hrende Expo-Konfiguration bestÃ¤tigen.
2. `app.json` neutralisieren, angleichen oder kontrolliert entfernen.
3. Lokale API-Adressen in `eas.json` klarer kapseln.
4. Root-Skripte fÃ¼r Smoke- und Speed-Checks ergÃ¤nzen.
5. TypeScript-Konfiguration zwischen API und Mobile konsistenter machen.

## Ã„nderungen, die nicht automatisch gemacht werden sollen

Nicht automatisch durchfÃ¼hren:

- `app.json` blind lÃ¶schen.
- Bundle IDs oder Android Package Names ohne Entscheidung Ã¤ndern.
- OpenAI-Aufrufe in die Mobile-App verschieben.
- Supabase-Schema, Auth-Flows oder API-VertrÃ¤ge nebenbei Ã¤ndern.
- Expo-Konfiguration, EAS, TypeScript und npm-Skripte gleichzeitig umbauen.
- `.env` oder `.env.local` lesen, kopieren, dokumentieren oder committen.

## Konkreter nÃ¤chster Mini-Task

NÃ¤chster sinnvoller Mini-Task:

`apps/mobile/app.config.js` und `apps/mobile/app.json` gezielt vergleichen und eine minimale Ã„nderung vorbereiten, die `app.config.js` als fÃ¼hrende Quelle bestÃ¤tigt, ohne Produktverhalten zu Ã¤ndern.

Dieser Task darf maximal 1â€“2 Dateien betreffen.
