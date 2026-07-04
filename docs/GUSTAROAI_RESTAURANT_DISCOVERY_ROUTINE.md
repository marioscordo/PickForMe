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

Der aktuelle App-Default-Provider ist `gustaroai-api`.

Die App fragt den GustaroAI-Backend-Endpunkt `/api/restaurant-discovery`. Das Backend nutzt Websuche zur Quellenbeschaffung, uebernimmt aber nur verifizierte offizielle Websites und same-domain Speisekartenlinks. Social-, Bewertungs-, Marketplace- und Lieferdienst-Hosts werden verworfen.

`openstreetmap-nominatim` bleibt als technische lokale Quelle fuer strukturierte OSM-Treffer und Same-Domain-PDF-Crawling vorhanden, ist aber nicht mehr der App-Default.

## Menu-URL-Regeln

`resolveSelectedRestaurantSource` akzeptiert eine `menuUrl` nur, wenn alle Bedingungen erfuellt sind:

- Der gewaehlte Treffer hat eine belastbare `websiteUrl`; Backend-Erreichbarkeit wird geprueft, OSM-strukturierte offizielle Websites duerfen bei Bot-Schutz trotzdem als Website-Quelle bleiben.
- Der Provider liefert strukturierte Links mit `kind: "menu"`; AI-Ergebnisse werden vor Uebergabe serverseitig validiert.
- Die Menu-URL ist erreichbar.
- Die Menu-URL liegt auf derselben registrierbaren Domain wie die Website.
- Blockierte Plattformhosts werden nicht akzeptiert.

Die GustaroAI-Entscheidungsroutine klassifiziert keine Linktexte wie "Speisekarte", "menu" oder "carta". Backend-Ergebnisse werden serverseitig normalisiert, auf Plattformhosts geprueft, same-domain validiert und gegen offensichtlich falsche Aktionsseiten wie Reservierung oder Kontakt gefiltert. Der lokale Nominatim-Crawler markiert nur direkte PDF-Ziele als strukturierte Menu-Kandidaten.

## Bewusst leere menuUrl

`menuUrl` bleibt leer, wenn:

- keine offizielle Website am Treffer vorhanden ist,
- nur Plattform- oder Social-Links vorhanden sind,
- kein strukturierter Menu-Link gefunden wird,
- die Menu-URL nicht erreichbar ist,
- die Menu-URL auf eine andere registrierbare Domain zeigt.