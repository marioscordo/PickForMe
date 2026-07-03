# GUSTAROAI - PRODUKTENTWICKLUNG V2
## Verbindliche Produkt-Charta

Diese Produkt-Charta ist verbindlich. Jede technische Änderung an GustaroAI muss mit dieser Charta vereinbar sein.

## 1. Vision

GustaroAI ist kein Speisekarten-Parser.

GustaroAI ist ein persönlicher Restaurant-Concierge.

Ziel ist nicht, Speisekarten zu erklären, sondern Menschen in unbekannten Restaurants sicher, schnell und mit Freude zur richtigen Entscheidung zu führen.

Der Nutzer soll nach wenigen Sekunden denken:

"Genau das hätte ich auch genommen."

## 2. Rollenmodell

Das Restaurant erzählt seine Geschichte.

Die Speisekarte liefert ausschließlich Fakten.

GustaroAI trifft die Empfehlung.

Diese drei Rollen dürfen niemals vermischt werden.

## 3. Informationsquellen

Reihenfolge der Vertrauenswürdigkeit:

1. Offizielle Restaurant-Website
2. Originale Speisekarte
3. Nutzerprofil
4. Situationskontext
5. Belastbares öffentliches Restaurantwissen

Keine andere Quelle hat Vorrang.

## 4. Restaurantbox

Titel:

"Über das Restaurant"

Quellen:

1. Offizielle Restaurant-Website
2. Belastbares öffentliches Restaurantwissen
3. Wenn beides fehlt: keine Restaurantbox

Restaurantbox niemals aus:

- Adresse
- Kontakt
- Impressum
- Öffnungszeiten
- Menütext
- Footer

Die Restaurantbox stellt ausschließlich das Restaurant vor.

Sie ist keine Empfehlung.

## 5. Speisekarte

Die Speisekarte gehört ausschließlich dem Restaurant.

GustaroAI darf:

- übersetzen
- strukturieren
- kürzen

GustaroAI darf niemals:

- Gerichte erfinden
- Zutaten ergänzen
- Preise verändern
- Verfügbarkeit behaupten

## 6. Empfehlungen

GustaroAI empfiehlt.

Die Empfehlung basiert ausschließlich auf:

- Nutzerprofil
- Speisekarte
- Situationskontext

Nicht auf Marketing.
Nicht auf Halluzinationen.

## 7. KI-Regeln

KI darf:

- übersetzen
- zusammenfassen
- strukturieren
- priorisieren
- formulieren

KI darf niemals:

- Fakten verändern
- Speisekarten interpretieren
- Gerichte erfinden
- Restauranttexte umdichten

## 8. UX-Regeln

- Wenig Text.
- Hohe Aussagekraft.
- Vertrauen vor Vollständigkeit.
- Lieber keine Information als eine falsche.
- Keine Marketingfloskeln.
- Keine ChatGPT-Sprache.
- Keine Wiederholungen.

## 9. Entwicklungsregeln

Vor jeder Änderung gilt:

1. Hypothese
2. Änderung
3. Test
4. Entscheidung

Keine Blind-Patches.

Keine parallelen Baustellen.

## 10. Qualitätsregeln

Jede Änderung wird bewertet nach:

1. Produktqualität
2. Nutzervertrauen
3. Stabilität
4. Wartbarkeit

Technische Eleganz ist niemals wichtiger als Nutzervertrauen.

## 11. Zusammenarbeit

Der Produktmodus ist CPO-getrieben.

Die wichtigste Aufgabe ist nicht, möglichst schnell Code zu erzeugen.

Die wichtigste Aufgabe ist, GustaroAI zum besten persönlichen Restaurant-Concierge zu entwickeln.

Wenn eine technische Lösung die Produktvision verschlechtert, hat immer die Produktvision Vorrang.

## 12. Das GustaroAI-Prinzip

Das Restaurant erzählt seine Geschichte.

Die Speisekarte liefert die Fakten.

GustaroAI trifft die Entscheidung.

## 13. Verbindliche Arbeitsregel

Jede Änderung muss eine klare Produktbegründung haben.

Jede Änderung muss gegen Regressionen geprüft werden.

Reine technische Änderungen ohne Produktnutzen sind nicht zulässig.

## 14. Aktueller Produktstand

Folgende Produktentscheidungen sind verbindlich:

- Restaurantvorstellung und Empfehlungen sind strikt getrennt.
- Die Restaurantbox basiert bevorzugt auf der offiziellen Restaurant-Website.
- Fehlt dort eine Beschreibung, darf belastbares öffentliches Restaurantwissen verwendet werden.
- Fehlen beide Quellen, wird keine Restaurantbox angezeigt.
- Speisekarteninformationen stammen ausschließlich aus der Speisekarte.
- Hero-/Restauranttexte dürfen niemals Gerichte, Preise oder Zutaten ergänzen.
- Empfehlungen stammen ausschließlich von GustaroAI.
- Die Empfehlungskarten enthalten keine KI-Begründungen mehr.
- Der Concierge spricht nur noch einmal.
- Harter Grundsatz:
  Das Restaurant erzählt seine Geschichte.
  GustaroAI erzählt seine Empfehlung.

## 15. Verbindliche Content-Guidelines

### Guideline 1 - Content Separation

Statische Texte dürfen nicht im Code hinterlegt werden.

Alle Texte müssen aus einer zentralen, dynamischen Content-Quelle stammen, zum Beispiel CMS, JSON, Datenbank oder KI-generiert.

Der Code enthält ausschließlich Struktur, Logik und Datenmodelle.

### Guideline 2 - Rule Independence

Regeln dürfen nicht auf Textinhalten basieren.

Jede Regel muss auf klar definierten, strukturierten Datenfeldern operieren, zum Beispiel Kategorien, Tags, Attribute oder numerische Werte.

### Guideline 3 - Language Independence

Die App muss vollständig sprachunabhängig sein.

Texte werden dynamisch generiert oder aus einer Übersetzungsquelle bezogen.

Der Code enthält keine sprachspezifischen Strings.

### Guideline 4 - Dynamic Personalization

Personalisierte Texte, zum Beispiel Hero-Texte, werden dynamisch erzeugt, basierend auf strukturierten Restaurantdaten und Nutzerprofilen.

Sie werden niemals als statische Vorlagen im Code hinterlegt.

## 16. Verbindliches TestFlight-Procedere

TestFlight ist der verbindliche Pruefweg fuer Store-relevante iOS-Versionen.

Kein TestFlight-Build darf ohne Preflight-Check erstellt oder eingereicht werden.

Vor jedem Production-Build muss geprueft werden:

1. Git-Arbeitsbaum ist bekannt und es gibt keine unbeabsichtigten Aenderungen.
2. Typecheck ist erfolgreich.
3. Production-API ist erreichbar.
4. EAS Production Environment enthaelt alle benoetigten Public Runtime Values:
   - `EXPO_PUBLIC_PICKFORME_API_URL`
   - `EXPO_PUBLIC_PICKFORME_DEV_MODE=false`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
5. `APP_VARIANT=production` ist fuer Build und Submit eindeutig gesetzt.
6. Das iOS Bundle Identifier Ziel ist `com.marioscordo.gustaroai`.
7. Die App Store Connect Ziel-App ist GustaroAI mit ASC App ID `6787099278`.
8. Die Buildnummer ist eindeutig hoeher als beim zuletzt eingereichten Build.
   - Die iOS-Buildnummer in `apps/mobile/app.config.js` ist fortlaufend und darf nie wiederverwendet werden.
   - `apps/mobile/app.config.js` ist die verbindliche Source of Truth fuer EAS-Builds; `apps/mobile/app.json` darf nicht abweichen.
   - Production-Builds duerfen nicht automatisch inkrementieren; `apps/mobile/eas.json` muss fuer `production.autoIncrement` auf `false` stehen.
   - Vor jedem neuen Production-Build wird die zuletzt bei EAS/App Store Connect eingereichte Buildnummer geprueft.
   - Der naechste Production-Build nach dem bereits realisierten Build `1.0.2` muss `1.0.3` verwenden.
   - Eine Buildnummer wird erst erhoeht, wenn tatsaechlich ein neuer Production-Build erstellt werden soll.
9. Login-relevante Voraussetzungen sind geprueft:
   - Supabase Auth User existiert.
   - User ist bestaetigt.
   - Passwort ist bekannt oder neu gesetzt.
   - Email/Password Auth ist aktiv.

Build-Regel:

- Production-Builds werden nur mit dem Production-Profil erstellt.
- Der Build-Log muss zeigen, dass Supabase URL und Supabase Anon Key aus der EAS Production Environment geladen wurden.
- Wenn dieser Nachweis fehlt, wird der Build nicht fuer TestFlight verwendet.

Submit-Regel:

- Einreichungen erfolgen bevorzugt mit konkreter Build-ID.
- `--latest` wird fuer Store- oder TestFlight-Submits nicht verwendet, wenn mehrere Builds oder Varianten existieren.
- Vor dem Submit muss `APP_VARIANT=production` gesetzt sein.
- Nach dem Submit wird die lokale Environment-Variable wieder entfernt.

Verbindlicher Submit-Ablauf:

```powershell
cd D:\Mario\PickForMe\pickforme-product-v1\apps\mobile
$env:APP_VARIANT="production"
npx eas-cli submit --platform ios --id <BUILD_ID>
Remove-Item Env:\APP_VARIANT
```

TestFlight-Abnahme:

- Getestet wird die App GustaroAI aus TestFlight, nicht die Dev-App.
- Die Dev-App darf fuer schnelle Entwicklungspruefungen genutzt werden, ist aber keine Store-Abnahme.
- Stopper werden lokal korrigiert, danach wird ein neuer Production-Build erstellt und erneut ueber TestFlight geprueft.
- Kein Store-Release erfolgt ohne erfolgreich installierten und getesteten TestFlight-Build.

Fehlerregel:

Wenn ein Store- oder TestFlight-relevanter Fehler auftritt, wird nicht improvisiert.

Es gilt:

1. Fehler reproduzieren.
2. Ursache im Code, Backend, Environment oder App Store Connect eindeutig zuordnen.
3. Patch lokal umsetzen.
4. Typecheck ausfuehren.
5. Neuen Production-Build erstellen.
6. Konkrete Build-ID einreichen.
7. In TestFlight erneut testen.

Ein Fehler im Build-, Submit- oder Environment-Prozess darf sich nicht wiederholen.

## 17. Verbindliche Sprachregel

GustaroAI unterscheidet strikt zwischen GUI-Sprache und KI-Ausgabesprache.

Die GUI-Sprache ist die Bedienoberflaeche der App.

Die KI-Ausgabesprache ist die Sprache fuer Empfehlungen, Gerichtserklaerungen, Uebersetzungen und KI-generierte Begruendungen.

Die KI-Ausgabesprache bleibt im Profil waelbar.

Die GUI-Sprache wird aus den Geraeteeinstellungen des Nutzers abgeleitet.

Auf iOS ist die verbindliche Quelle:

```text
Einstellungen -> Allgemein -> Sprache & Region -> Bevorzugte Sprachen -> erste Sprache
```

Die Region ist nur Kontext und darf weder GUI-Sprache noch KI-Ausgabesprache ueberschreiben.

GUI-Regel:

```text
preferredDeviceLanguage = firstPreferredDeviceLanguage
if preferredDeviceLanguage starts with "de": guiLanguage = German
else if preferredDeviceLanguage starts with "en": guiLanguage = English
else guiLanguage = English
```

KI-Ausgaberegel:

```text
aiOutputLanguage = user profile setting
fallback = guiLanguage
region = context only
```

Beispiele:

- Bevorzugte Sprache `Deutsch`: GUI auf Deutsch.
- Bevorzugte Sprache `English`: GUI auf Englisch.
- Bevorzugte Sprache `Italiano`: GUI auf Englisch.
- KI-Ausgabesprache `Franzoesisch`: Empfehlungen und Erklaerungen auf Franzoesisch, unabhaengig von der GUI-Sprache.

Eine manuelle Ausgabesprachen-Auswahl ist eine dauerhafte Personalisierungsfunktion fuer KI-Inhalte.

Sie darf nicht zur Steuerung der GUI-Sprache verwendet werden.

Alle KI-Aufrufe, Uebersetzungen, Empfehlungen, Gerichtsnamen, Begruendungen und KI-generierten Sicherheitshinweise muessen die KI-Ausgabesprache beachten.

Alle festen App-Texte, Navigation, Buttons, Labels, Fehlermeldungen, Hinweise und Popups muessen die GUI-Sprache beachten.

## 18. Verbindliche Legal- und Support-Regel

Alle sichtbaren Legal-, Datenschutz-, Support-, Profil- und Nutzerkommunikationstexte muessen den aktuellen Produktnamen GustaroAI verwenden.

PickForMe ist nur historischer Arbeitsname und darf in der App, in Legal-Screens, Supportseiten, Profilbereichen oder Nutzerkommunikation nicht sichtbar sein.

Datenschutz- und Supportseiten muessen vor jedem Store-Release geprueft werden.

Verantwortlicher, Kontaktadresse, Loeschhinweise und sicherheitsrelevante Hinweise muessen sachlich, aktuell und produktkonform sein.

Legal- und Supporttexte muessen korrekte UTF-8-Umlaute verwenden.

Rechtliche, organisatorische oder sicherheitsbezogene Aussagen duerfen nur enthalten sein, wenn sie dem tatsaechlichen Produktstand, der tatsaechlichen Unternehmenssituation und der tatsaechlichen technischen Verarbeitung entsprechen.

Aenderungen an Legal- und Supporttexten sind Copy-/Compliance-Aenderungen.

Sie duerfen keine App-Funktion, Datenverarbeitung, Sicherheitslogik oder Architektur veraendern.

Vor einem Release muss geprueft werden:

1. Kein sichtbarer PickForMe-Bezug.
2. Produktname ueberall sichtbar GustaroAI.
3. Kontaktadresse aktuell.
4. Verantwortlicher aktuell.
5. Account-Loeschhinweise aktuell.
6. Datenschutzseite erreichbar.
7. Supportseite erreichbar.
8. Typecheck oder Build fuer die betroffenen Seiten erfolgreich.

## 19. Business-Validierung

Business-Validierungen dokumentieren reale Praxiserfahrungen mit GustaroAI.

Sie dienen nicht als Einzelfall-Beweis, sondern als Produktsignal fuer Positionierung, Nutzenversprechen und Priorisierung.

### Praxisfall 001 - Zollhaus Forchheim

Restaurant:

Zollhaus Forchheim

Quelle:

Gourmetkarte Juni 2026

Empfehlung:

Zollhaus "Zwiebelrost 2.0"

Dazu als Vorspeise:

Gegrillte Jakobsmuschel & Garnele

Ergebnis:

Nutzer hat Empfehlung bestellt.

Bewertung:

Sehr gut.

Restaurantfeedback:

Bedienung positiv interessiert.

Chefin hoeflich interessiert, sieht fuer ihr Restaurant aber begrenzten Bedarf wegen:

- staendig wechselnder Kueche
- Mund-zu-Mund-Propaganda
- ueberschaubarer Karte
- Gaeste lesen Karte vorher

Produkt-Erkenntnis:

GustaroAI ist zuerst ein Gaesteprodukt, kein Restaurantprodukt.
