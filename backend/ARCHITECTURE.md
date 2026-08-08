# Backend Architecture — AI Interview Agent

Scope: `backend/` only. No frontend. No DB infra beyond what's listed below.
Goal: implement `POST /api/interview` per `technical-spec.md`, in a way that's
buildable in a 48h hackathon and hard to break during a live demo.

---

## 1. Stack Choice

| Concern | Choice | Why |
|---|---|---|
| Language/runtime | Node.js + Express (or Fastify) | Fast to scaffold, single `npm install`, easy JSON handling, team likely knows JS. (Swap for Python/FastAPI if the team prefers — architecture below is framework-agnostic.) |
| LLM access | Any provider via env vars (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`) | Spec explicitly requires env-var-based LLM config, not a hardcoded SDK. |
| State storage | **In-memory Map**, keyed by `sessionId` | Spec says avoid unnecessary DBs/infra. A hackathon demo runs one process; a Map is enough. No Redis, no Postgres. |
| Persistence | None (process memory only) | If the process restarts mid-interview, the session is lost — acceptable tradeoff for a 48h hackathon per "avoid overengineering." |
| Data sources | `candidates.json`, `curriculum.json` loaded once at startup into memory | Both are static, small, read-only reference data — no need to query them repeatedly from disk or a DB. |

No auth, no queue, no websockets, no vector DB. The interview is a plain
request/response HTTP loop; nothing here requires infrastructure beyond
"one Node process holding a Map in RAM."

---

## 2. High-Level Flow

```
                 ┌───────────────────────────┐
POST /api/interview │      Express App          │
   (sessionId, ...)  │                            │
        ─────────────▶  1. Route handler          │
                     │  2. SessionStore.get/create│
                     │  3. InterviewEngine.step()  │
                     │       - build prompt        │
                     │       - call LLM (env-based)│
                     │       - parse structured    │
                     │         reply               │
                     │       - update session state│
                     │  4. respond {reply, done,   │
                     │     feedback?}              │
                     └───────────────────────────┘
```

Every request is stateless at the HTTP layer — all continuity comes from
looking up `sessionId` in the in-memory store, mutating that session's
state, and writing it back before responding.

---

## 3. Module Breakdown (`backend/src/`)

```
backend/
  ARCHITECTURE.md        <- this file
  src/
    server.js             # Express app bootstrap, single route mount
    routes/
      interview.js         # POST /api/interview controller (thin)
    core/
      sessionStore.js       # in-memory Map<sessionId, SessionState>
      interviewEngine.js     # orchestrates one turn: start | turn | end
      questionPlanner.js      # picks curriculum days / topics to cover, adaptive follow-ups
      feedbackGenerator.js    # builds final structured feedback via LLM
    llm/
      llmClient.js           # provider-agnostic wrapper, reads env vars
      prompts.js              # prompt templates (system + turn + feedback)
    data/
      loadData.js             # loads candidates.json + curriculum.json once
    utils/
      validators.js           # request shape checks (sessionId, message, candidate)
  .env.example
  package.json
```

Nothing here is a microservice — it's one process, cleanly separated by
responsibility so any team member can work on `questionPlanner.js` or
`feedbackGenerator.js` without touching the HTTP layer.

---

## 4. Session State Shape (in-memory)

```js
{
  sessionId: "abc-123",
  candidate: { ...candidate.json subset },      // stored at start
  phase: "intro" | "questioning" | "wrapup" | "done",
  plannedTopics: [                                // computed once at start
    { day: 12, title: "Prompt Engineering Fundamentals", asked: false },
    { day: 22, title: "Multi-Agent Orchestration", asked: false },
    ...
  ],
  history: [                                       // full transcript, for LLM context + feedback
    { role: "assistant", content: "..." },
    { role: "user", content: "..." }
  ],
  questionsAsked: 0,
  minQuestions: 8,
  daysCovered: Set([7, 8, 12, 22]),                // must reach >= 4 distinct days
  createdAt, updatedAt
}
```

This is the entire "database." It lives in `sessionStore.js` as a
`Map`, garbage-collected naturally when the process restarts.

---

## 5. Personalization & Grounding Logic

- **Personalization (`candidates.json`)**: at session start, pull the
  candidate's `jobRole`, `yearsExperience`, `missions` (passed/skipped/attempts),
  and `signals` to seed tone/difficulty and to decide *which* curriculum days
  are most interesting to probe (e.g. skipped days → probe for gaps; low
  first-try / high-attempt days → probe for depth; strong days → ask them to
  go deeper or teach-back).
- **Grounding (`curriculum.json`)**: `questionPlanner.js` cross-references
  the candidate's mission list against `curriculum.json.days` to pull the
  real `title`/`tools`/`objectives` for each day, so questions reference
  actual course content instead of being generic.
- **Coverage guarantee**: planner pre-selects ≥4 distinct days spanning
  different modules (e.g. one from Embeddings/Vector Search, one from
  Agentic AI/MCP, one from Deployment, one weak/skipped area) before the
  interview starts, then adapts within that plan based on answers.
- **Adaptive follow-ups**: each LLM turn receives the running transcript +
  current topic + candidate signal for that topic, and is instructed to
  either (a) ask a natural follow-up on the same day if the answer was
  shallow, or (b) advance to the next planned day if the answer was solid —
  keeping total turns ≥ 8 and days covered ≥ 4.

---

## 6. `POST /api/interview` Contract (unchanged from spec)

- **Start**: `{ sessionId, candidate }` → engine creates session, plans
  topics, returns opening `reply`.
- **Turn**: `{ sessionId, message }` → engine appends to history, asks LLM
  for next question/follow-up, returns `{ reply, done: false }`.
- **End**: once `questionsAsked >= 8` and `daysCovered.size >= 4` and the
  plan is exhausted, engine triggers `feedbackGenerator.js`, returns
  `{ reply, done: true, feedback: { summary, strengths, gaps, next } }`.

`interviewEngine.js` is the only place that decides "are we done yet" —
keeps that logic in one spot instead of scattered across routes.

---

## 7. LLM Access (env-var driven)

```
LLM_PROVIDER=openai        # or anthropic, groq, etc.
LLM_API_KEY=...
LLM_MODEL=gpt-4o-mini       # or claude-*, llama-*, etc.
LLM_BASE_URL=               # optional, for OpenAI-compatible local/hosted endpoints
```

`llmClient.js` exposes one function, `complete(messages, options)`, and
internally branches on `LLM_PROVIDER`. This means swapping providers during
the hackathon (e.g. local Ollama → hosted API) is a `.env` change, not a
code change — matches the spec's "use an LLM through environment
variables" requirement directly.

---

## 8. Why This Is Not Overengineered

- No database: candidate/curriculum data is static JSON loaded once;
  session data is transient and fine in RAM for a demo-length interview.
- No auth layer: spec says none required.
- No message queue / websockets: the spec's flow is plain synchronous
  request/response, so plain HTTP is sufficient — no need for streaming
  infra even though `curriculum.json` mentions streaming as a *course*
  topic (that's unrelated to this hackathon's own backend).
- No ORM, no migrations: two JSON files, read with `fs.readFileSync` at
  boot.
- Single deployable process: one `npm start`, one port, one route.

---

## 9. Build Order (next steps, not implemented yet)

1. `data/loadData.js` + `utils/validators.js`
2. `core/sessionStore.js`
3. `llm/llmClient.js` + `llm/prompts.js`
4. `core/questionPlanner.js`
5. `core/interviewEngine.js` (start/turn branches only)
6. `routes/interview.js` + `server.js` — wire up start/turn, manual test
7. `core/feedbackGenerator.js` + end-of-interview branch in the engine
8. End-to-end test via curl/Postman against `technical-spec.md` examples
