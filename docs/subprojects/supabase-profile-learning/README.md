# Unterprojekt: Supabase Profile Learning

## Ziel

PickForMe soll Nutzerprofil, Bewertungsfeedback und daraus abgeleitete Statistiken dauerhaft speichern.

Das Ziel ist eine bessere zukuenftige Empfehlung, ohne harte Ausschluesse, Allergien oder Unvertraeglichkeiten jemals zu ueberstimmen.

## Produktbegruendung

PickForMe ist ein persoenlicher Restaurant-Concierge. Dafuer muss die App lernen koennen:

- welche Gerichte der Nutzer wirklich nimmt
- welche Gerichte der Nutzer hoch oder niedrig bewertet
- welche Vorlieben in der Praxis bestaetigt werden
- welche Ausschluesse und Unvertraeglichkeiten verbindlich bleiben

## Charta-Grenzen

Dieses Unterprojekt folgt verbindlich `PRODUCT_CHARTA.md`.

Nicht erlaubt:

- Feedback als harte Regel interpretieren
- Allergien oder Unvertraeglichkeiten durch Sternebewertung abschwaechen
- Freitext als Regelgrundlage verwenden
- Empfehlungen aus Bewertungsdaten erfinden
- Speisekartenfakten aus Feedback ableiten
- statische UI-Texte im Code hinterlegen

Erlaubt:

- strukturierte Nutzerregeln speichern
- Bewertungsereignisse speichern
- weiche Ranking-Signale aus Feedback ableiten
- Nutzerstatistiken aus gespeicherten Ereignissen berechnen

## Fuehrendes System

Empfohlenes dauerhaftes System:

- Supabase Postgres als zentrale Wahrheit
- Supabase Auth fuer stabile `user_id`
- Row Level Security fuer Nutzertrennung
- Mobile State und AsyncStorage nur als Cache, nicht als fuehrende Wahrheit

## Datenklassen

### Harte Regeln

Harte Regeln duerfen Empfehlungen ausschliessen.

Beispiele:

- `NO_LAMB`
- `NO_PORK`
- `NO_BEEF`
- `NO_SEAFOOD`
- `NUT_SENSITIVE`
- `GLUTEN_SENSITIVE`

Harte Regeln werden vor jeder Empfehlung angewendet und nach der KI-Ausgabe erneut geprueft.

### Weiche Vorlieben

Weiche Vorlieben beeinflussen nur die Reihenfolge sicherer Gerichte.

Beispiele:

- `LIKES_PASTA`
- `LIKES_SPICY`
- `LIKES_FISH`
- `LIKES_LARGE_PORTIONS`

### Feedback

Ein Feedback-Ereignis beschreibt eine konkrete Nutzerreaktion.

Beispiele:

- Gericht wurde genommen
- Sternebewertung
- Situation
- Restaurant
- erkannte strukturierte Gerichtseigenschaften

Feedback ist immer ein weiches Signal.

## Datenmodell V1 - Entwurf

### `user_profiles`

Zweck:
Basisprofil pro Nutzer.

Felder:

- `user_id`
- `display_name`
- `output_locale`
- `diet_style`
- `created_at`
- `updated_at`

### `user_profile_rules`

Zweck:
Strukturierte Profilregeln.

Felder:

- `id`
- `user_id`
- `rule_type`: `like`, `dislike`, `intolerance`, `exception`
- `rule_id`
- `label`
- `active`
- `source`: `default`, `user`, `system`
- `created_at`
- `updated_at`

### `recommendation_feedback`

Zweck:
Bewertung konkreter Empfehlungen.

Felder:

- `id`
- `user_id`
- `restaurant_name`
- `restaurant_url`
- `dish_name_original`
- `translated_name`
- `output_locale`
- `rating`
- `accepted`
- `situation`
- `dish_role`
- `meal_type`
- `substance_level`
- `source_format`
- `created_at`

### `user_preference_statistics`

Zweck:
Statistik fuer den Nutzer.

V1-Empfehlung:
Als View oder API-berechnete Aggregation starten, nicht als manuell gepflegte Tabelle.

Beispiele:

- Durchschnittsbewertung je Vorliebe
- Anzahl Bewertungen je Vorliebe
- haeufig gewaehlt nach `meal_type`
- haeufig hoch bewertet nach `dish_role`

## API-Grenzen

Vorgeschlagene spaetere Endpunkte:

- `GET /api/profile`
- `PUT /api/profile`
- `PUT /api/profile/rules`
- `POST /api/recommendation-feedback`
- `GET /api/profile/statistics`

Die Mobile-App soll Service-Role-Zugriffe niemals direkt ausfuehren.

## Empfehlungsregeln

Auswertungsreihenfolge:

1. Speisekarte extrahieren
2. harte Profilregeln anwenden
3. KI-Empfehlung oder lokale Empfehlung erzeugen
4. Ergebnis erneut gegen harte Profilregeln pruefen
5. weiche Vorlieben anwenden
6. Feedbacksignale als weiche Ranking-Signale beruecksichtigen
7. Ergebnis anzeigen

Feedback darf nur Schritt 6 beeinflussen.

## Supabase-Voraussetzungen

Notwendig:

- Supabase Auth aktiv
- stabile Nutzeridentitaet ueber `auth.users.id`
- Datenbanktabellen mit `user_id`
- Row Level Security fuer alle Nutzerdaten
- API-seitige Validierung aller Schreibvorgaenge
- SQL-Migrationen im Repo
- keine Secrets in Mobile
- keine `.env`-Dateien in Dokumentation oder Commits

## Datenschutz und Store-Tauglichkeit

Notwendig fuer Store-Reife:

- Nutzer kann gespeicherte Bewertungen sehen
- Nutzer kann Feedbackverlauf loeschen
- Nutzer kann Profilregeln loeschen
- Nutzer kann Account loeschen
- klare Datenschutzerklaerung
- Allergien und Unvertraeglichkeiten bevorzugt als strukturierte Regel-IDs speichern

## Umsetzungsplan

### Phase 1 - Design

- Datenmodell finalisieren
- Regelkatalog definieren
- RLS-Policies entwerfen
- API-Vertraege definieren

### Phase 2 - Supabase Schema

- Migrationen fuer Tabellen anlegen
- RLS aktivieren
- Policies testen
- keine App-Funktionalitaet veraendern

### Phase 3 - API Persistence

- Profil laden und speichern
- Feedback speichern
- Feedbacksignale fuer Analyse laden
- harte Regeln weiterhin serverseitig validieren

### Phase 4 - Mobile Integration

- Profil aus API laden
- lokale Cache-Strategie einfuehren
- Bewertungsfeedback an API senden
- Offline-/Fehlerzustand app-tauglich behandeln

### Phase 5 - Statistik

- Nutzerstatistik berechnen
- Statistik im Profil anzeigen
- keine Statistik als harte Regel verwenden

## Pflichttests

- Nutzer A sieht niemals Daten von Nutzer B
- 4-Sterne-Feedback verbessert nur weiche Gewichtung
- 1-Stern-Feedback erzeugt keinen harten Ausschluss
- `NO_LAMB` blockiert Lamm trotz 5-Sterne-Feedback
- Allergie blockiert Gericht trotz starker Vorliebe
- App-Neustart erhaelt Profil und Feedback
- Account-Loeschung entfernt Nutzerdaten

## Nicht Teil dieses Unterprojekts

- Restaurantbox
- Speisekarten-Extraktion
- Hauptgericht-Auswahl
- Vorspeisen-Auswahl
- Weinempfehlung
- UI-Redesign

Diese Bereiche duerfen nur ueber klar freigegebene Folgeauftraege geaendert werden.
