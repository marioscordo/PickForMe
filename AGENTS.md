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
