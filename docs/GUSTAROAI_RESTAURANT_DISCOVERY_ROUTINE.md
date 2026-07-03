# GustaroAI Restaurant Discovery Routine

## Zweck

Die Routine beschafft Quellen fuer die Seite "Was passt heute". Sie erzeugt keine Empfehlung, liest keine Speisekarte inhaltlich aus und erfindet keine URL.

## Downstream-Vertrag

Die weiterverarbeitende GustaroAI-Routine bekommt ausschliesslich:

```ts
{
  websiteUrl: string;
  menuUrl?: string;
}
```

Wenn `menuUrl` fehlt, darf keine Speisekarte geraten werden.

## Provider

Der aktuelle Default-Provider ist `openstreetmap-nominatim`.

Er liefert Restaurantkandidaten aus OpenStreetMap/Nominatim. Offizielle Websites werden nur aus strukturierten OSM-Feldern uebernommen. Social-, Bewertungs-, Marketplace- und Lieferdienst-Hosts werden verworfen.

## Menu-URL-Regeln

`resolveSelectedRestaurantSource` akzeptiert eine `menuUrl` nur, wenn alle Bedingungen erfuellt sind:

- Der gewaehlte Treffer hat eine belastbare `websiteUrl`.
- Der Provider liefert strukturierte Links mit `kind: "menu"`.
- Die Menu-URL ist erreichbar.
- Die Menu-URL liegt auf derselben registrierbaren Domain wie die Website.
- Blockierte Plattformhosts werden nicht akzeptiert.

Die GustaroAI-Entscheidungsroutine klassifiziert keine Linktexte wie "Speisekarte", "menu" oder "carta". Der Default-Provider markiert nur direkte PDF-Ziele als strukturierte Menu-Kandidaten.

## Bewusst leere menuUrl

`menuUrl` bleibt leer, wenn:

- keine offizielle Website am Treffer vorhanden ist,
- nur Plattform- oder Social-Links vorhanden sind,
- kein strukturierter Menu-Link gefunden wird,
- die Menu-URL nicht erreichbar ist,
- die Menu-URL auf eine andere registrierbare Domain zeigt.