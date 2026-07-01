# PICKFORME - PRODUKTENTWICKLUNG V2
## Verbindliche Produkt-Charta

Diese Produkt-Charta ist verbindlich. Jede technische Änderung an PickForMe muss mit dieser Charta vereinbar sein.

## 1. Vision

PickForMe ist kein Speisekarten-Parser.

PickForMe ist ein persönlicher Restaurant-Concierge.

Ziel ist nicht, Speisekarten zu erklären, sondern Menschen in unbekannten Restaurants sicher, schnell und mit Freude zur richtigen Entscheidung zu führen.

Der Nutzer soll nach wenigen Sekunden denken:

"Genau das hätte ich auch genommen."

## 2. Rollenmodell

Das Restaurant erzählt seine Geschichte.

Die Speisekarte liefert ausschließlich Fakten.

PickForMe trifft die Empfehlung.

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

PickForMe darf:

- übersetzen
- strukturieren
- kürzen

PickForMe darf niemals:

- Gerichte erfinden
- Zutaten ergänzen
- Preise verändern
- Verfügbarkeit behaupten

## 6. Empfehlungen

PickForMe empfiehlt.

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

Die wichtigste Aufgabe ist, PickForMe zum besten persönlichen Restaurant-Concierge zu entwickeln.

Wenn eine technische Lösung die Produktvision verschlechtert, hat immer die Produktvision Vorrang.

## 12. Das PickForMe-Prinzip

Das Restaurant erzählt seine Geschichte.

Die Speisekarte liefert die Fakten.

PickForMe trifft die Entscheidung.

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
- Empfehlungen stammen ausschließlich von PickForMe.
- Die Empfehlungskarten enthalten keine KI-Begründungen mehr.
- Der Concierge spricht nur noch einmal.
- Harter Grundsatz:
  Das Restaurant erzählt seine Geschichte.
  PickForMe erzählt seine Empfehlung.

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
