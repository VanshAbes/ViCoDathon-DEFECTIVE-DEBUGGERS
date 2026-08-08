# NEXUS // INTERVIEW COMMAND — Frontend

React + Vite + TypeScript frontend for the AI Interview Agent. This package
owns everything under `frontend/` only — it does not touch `backend/`,
`curriculum.json`, `candidates.json`, or `technical-spec.md` at the repo root.
Copies of the two data files live under `src/data/` for local development.

## Stack

- **React 18 + TypeScript**, built with **Vite**
- **Tailwind CSS** with a fully custom token system (see `tailwind.config.ts`)
- **react-router-dom** for client-side routing
- No UI kit dependency — every primitive in `src/components/ui` is bespoke

## Getting started

```bash
cd frontend
npm install
npm run dev
```

> This sandbox has no network access, so `npm install` has not been run here.
> The scaffold is written to compile cleanly under the versions pinned in
> `package.json` — run the above locally to verify and start developing.

## Product identity

**NEXUS // INTERVIEW COMMAND** — a premium enterprise AI assessment command
center. Visual direction: obsidian/graphite surfaces, electric cyan as the
primary signal color, subtle violet as a secondary accent, a technical grid
backdrop, thin hairline borders, restrained glass panels, and command-center
status indicators (pulsing "LIVE" dots, mono telemetry readouts). Typography
pairs **Inter** (UI/display) with **IBM Plex Mono** (data, IDs, timestamps,
status labels) — see `tailwind.config.ts` and `src/styles/globals.css`.

The signature element is the **Mission Grid** (`src/components/candidates/MissionGrid.tsx`):
a day-by-day heatmap that joins `curriculum.json`'s 31-day structure with each
candidate's `missions[]` outcomes from `candidates.json`, rendered like a
console readout rather than a decorative chart. It appears on the dashboard
roster (compact), the interview console's candidate dossier, and the report
page (full size).

## Architecture

```
frontend/
├─ src/
│  ├─ types/            # Types mirroring the three source files exactly
│  │  ├─ candidate.ts    #   candidates.json shape
│  │  ├─ curriculum.ts   #   curriculum.json shape
│  │  └─ interview.ts    #   POST /api/interview wire contract (spec-only, no client)
│  │
│  ├─ data/
│  │  ├─ candidates.json         # copy of the provided source data
│  │  ├─ curriculum.json         # copy of the provided source data
│  │  └─ mockInterviewScript.ts  # local fixture conversation + feedback (UI dev only)
│  │
│  ├─ lib/
│  │  ├─ curriculum.ts  # curriculum/candidate join logic, readiness scoring
│  │  ├─ format.ts      # initials, percentages, timestamps, id generation
│  │  └─ cn.ts           # className combinator
│  │
│  ├─ hooks/
│  │  ├─ useCandidates.ts        # roster + per-candidate readiness scorecards
│  │  └─ useInterviewSession.ts  # mocked session state machine (see below)
│  │
│  ├─ components/
│  │  ├─ ui/            # Design system primitives (Button, Badge, Panel, ...)
│  │  ├─ layout/         # AppShell, Sidebar, Topbar
│  │  ├─ candidates/     # MissionGrid, SignalMeter, ReadinessBadge, roster row/filter
│  │  ├─ interview/      # Chat console pieces + CandidateDossier
│  │  └─ review/         # ScoreRing, FeedbackSummaryPanel, FeedbackColumns
│  │
│  ├─ pages/
│  │  ├─ DashboardPage.tsx    # "/"                — command center roster
│  │  ├─ InterviewsPage.tsx   # "/interviews"       — launch a session
│  │  ├─ ReportsPage.tsx      # "/reports"          — ranked report list
│  │  ├─ InterviewPage.tsx    # "/interview/:id"    — live interview console
│  │  ├─ ReviewPage.tsx       # "/review/:id"       — feedback report
│  │  └─ NotFoundPage.tsx
│  │
│  ├─ App.tsx            # router
│  └─ main.tsx            # entry point
│
├─ tailwind.config.ts     # full design token system
└─ index.html
```

## API integration status: **not implemented** (by design, this pass)

`technical-spec.md` defines a single endpoint:

```
POST /api/interview
  start: { sessionId, candidate }        -> { reply, done }
  turn:  { sessionId, message }          -> { reply, done, feedback? }
```

`src/types/interview.ts` mirrors this contract exactly. `useInterviewSession`
(`src/hooks/useInterviewSession.ts`) is a **local mock** that reproduces the
same request/response shape using a scripted fixture
(`src/data/mockInterviewScript.ts`), so the console is fully demoable today.
Every place a real network call belongs is marked `TODO(api)`. Wiring the
backend later should mean replacing the two `window.setTimeout` blocks with
`fetch` calls — no changes to components or types should be required.

## Design system notes

- Color, spacing, radius, shadow, and animation tokens are centralized in
  `tailwind.config.ts` — no hardcoded hex values in components.
- `Panel` / `panel` and `panel-raised` utility classes are the only glass
  surfaces in the system, kept deliberately restrained (subtle blur, hairline
  border, no heavy glow) per the "restrained glass panels" brief.
- Status/telemetry language (`StatusDot`, `StatusReadout`, `Badge`) is shared
  across the dashboard, interview console, and reports so the "command
  center" vocabulary stays consistent everywhere state is communicated.
- Accessibility floor: visible focus rings (`:focus-visible`), reduced-motion
  media query respected globally, all interactive elements are real
  `<button>`/`<a>` elements.

## Not yet built (next passes)

- Real API integration for `useInterviewSession`
- Auth / role gating for interviewer vs. candidate views (not specified in
  the provided spec — flagged for discussion)
- Persisting a completed session's real feedback through to `ReviewPage`
  (currently reads mock feedback keyed off job role, not the live session)
- Toast/error states for failed requests once real networking exists
