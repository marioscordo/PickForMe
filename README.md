# GustaroAI V1

Mobile-first App für Restaurantgäste.

Leitsatz:

> Das Restaurant kenne ich nicht. GustaroAI kennt mich.

## Architektur

- Mobile: Expo React Native
- API: Next.js Route Handlers
- Auth: Dev-Modus lokal, später Supabase Auth
- KI: ausschließlich serverseitig
- V1-Safety: Empfehlungen dürfen nur validierte dishIds verwenden

## Entwicklung

```powershell
npm install
npm --workspace apps/mobile run typecheck
npm --workspace apps/api run typecheck
npm run dev:api
npm run dev:mobile
```
