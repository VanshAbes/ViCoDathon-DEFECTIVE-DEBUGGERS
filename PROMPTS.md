# ViCoDathon — Original Project Build Prompt Set

> **Purpose:** This document preserves the 20-prompt build sequence used to develop the ViCoDathon AI Interview Agent.
>
> **Important:** The exact verbatim text of the original chat prompts is not fully available in the current conversation context. Therefore, the prompts below are a **faithful reconstructed version** of the original build sequence and responsibilities, not a claim that every sentence is verbatim.

---

# PERSON 1 — BACKEND / AI INTERVIEW ENGINE

## Prompt 01 — Backend Architecture & Foundation

You are responsible for building the backend of the ViCoDathon AI Interview Agent.

Study the provided problem statement, curriculum JSON, candidate profiles, and technical specification carefully.

Build a clean, modular Node.js backend that can:
- load curriculum and candidate data,
- maintain interview sessions,
- generate adaptive interview questions,
- evaluate candidate answers,
- maintain interview context,
- produce structured final feedback,
- expose the HTTP API required by the technical specification.

Keep the architecture simple and hackathon-ready. Avoid unnecessary databases, authentication, Docker, microservices, or infrastructure unless the specification requires them.

Create clear separation between:
- data loading,
- models/types,
- candidate intelligence,
- curriculum intelligence,
- interview/session logic,
- question planning,
- answer evaluation,
- LLM integration,
- HTTP routes.

---

## Prompt 02 — Data Intelligence Layer

Implement the backend data layer around the supplied curriculum and candidate JSON files.

The system should reliably load and validate:
- the 31-day curriculum,
- modules,
- daily topics,
- objectives,
- tools,
- candidate profiles,
- completed missions,
- attempts,
- skipped topics,
- learning signals.

Create reusable helpers so the rest of the backend does not directly parse raw JSON everywhere.

The data layer must remain deterministic and must gracefully report malformed or missing data.

---

## Prompt 03 — Candidate Intelligence

Build the candidate intelligence layer.

Given a candidate profile, derive a useful interview profile containing:
- completed learning areas,
- attempted areas,
- skipped areas,
- weak/uncertain signals,
- strong signals,
- relevant curriculum days,
- tools/topics that can be tested.

The interview should be personalized to the candidate's actual learning journey rather than asking generic questions.

Keep this logic deterministic and explainable.

---

## Prompt 04 — Curriculum Intelligence

Build the curriculum intelligence layer.

The engine should understand relationships between:
- modules,
- days,
- topics,
- objectives,
- tools,
- candidate progress.

Provide utilities for finding suitable interview topics and ensuring that an interview can cover multiple curriculum days.

The engine must support the minimum challenge requirement:
- at least 8 questions,
- at least 4 different curriculum days.

Avoid selecting topics the candidate has not meaningfully encountered unless there is a deliberate reason to probe them.

---

## Prompt 05 — Interview Session Model & State

Implement the interview session model and in-memory session store.

A session must maintain enough state to support a genuine multi-turn interview:
- session ID,
- candidate,
- current phase,
- current question,
- question number,
- visited curriculum days,
- question history,
- answer history,
- evaluation history,
- competency signals,
- adaptive decisions,
- completion status,
- final feedback.

Use an in-memory Map for the hackathon.

The same session ID must preserve state across HTTP requests.

---

## Prompt 06 — Adaptive Question Planner

Build the adaptive question planner.

The planner should decide what the interviewer asks next based on:
- the candidate profile,
- curriculum coverage,
- the previous question,
- the candidate's answer,
- answer evaluation,
- competency signals,
- interview phase,
- question count.

Support different question decisions such as:
- baseline,
- probe,
- follow-up,
- clarification,
- deeper challenge,
- cross-topic transition,
- completion.

The interview must feel conversational rather than like a fixed questionnaire.

Strong answers should lead to deeper/harder questions.
Weak answers should trigger clarification or probing.
Repeated struggles should eventually cause a topic change.

---

## Prompt 07 — Answer Evaluator

Implement the answer evaluation engine.

Evaluate each candidate response against the actual question, relevant curriculum objectives, and candidate context.

Return a structured evaluation containing:
- score,
- strengths,
- gaps,
- evidence,
- competency updates,
- recommended next action.

Recommended actions should allow the planner to decide whether to:
- follow up,
- clarify,
- increase difficulty,
- change topic,
- complete.

Do not make scoring constant or superficial. The evaluator should distinguish weak, moderate, and strong responses.

---

## Prompt 08 — LLM Client & Resilience

Create the LLM abstraction layer.

Support environment-driven configuration such as:
- LLM_PROVIDER,
- LLM_API_KEY,
- LLM_MODEL,
- LLM_BASE_URL.

Keep the LLM provider replaceable.

The system must remain usable in a local/hackathon environment when an API key is unavailable. Deterministic fallbacks should exist wherever necessary so the interview does not simply crash.

Never hardcode API keys or secrets.

---

## Prompt 09 — Interview API & Backend Verification

Implement the HTTP API required by the technical specification.

Expose the required health endpoint and interview endpoint.

The interview endpoint must support:
- starting a session,
- submitting answers,
- maintaining session state,
- returning the next question,
- returning phase/question number,
- returning completion state,
- returning structured final feedback,
- returning useful HTTP errors.

Verify:
- valid start requests,
- valid turns,
- invalid session IDs,
- repeated answers,
- completion,
- minimum question count,
- multiple curriculum days,
- structured feedback.

Keep the backend simple and compatible with the frontend.

---

# PERSON 2 — FRONTEND

## Prompt 10 — React Frontend Foundation

Build the React/Vite frontend for the ViCoDathon AI Interview Agent.

Use the supplied technical/product requirements and create a premium enterprise AI interface.

The visual direction should feel like:
- AI command center,
- technical interview console,
- enterprise intelligence platform,
- dark futuristic engineering UI.

Use reusable components and a clean folder architecture.

Avoid unnecessary backend assumptions.

---

## Prompt 11 — Application Shell & Navigation

Create the main application shell.

Include:
- sidebar,
- top navigation,
- application branding,
- responsive content area,
- reusable panels,
- buttons,
- badges,
- status indicators,
- grid/technical background styling.

The product should feel like a polished enterprise tool rather than a generic dashboard.

Use the NEXUS / Interview Command Center visual identity where appropriate.

---

## Prompt 12 — Candidate Command Center

Build the candidate/dashboard experience.

Show candidate information and relevant interview-readiness signals.

Include:
- candidate cards/rows,
- readiness,
- experience,
- learning status,
- relevant metrics,
- candidate filtering/selection.

The interface should make it obvious which candidate is about to be interviewed and why.

---

## Prompt 13 — Live Interview Console

Build the main live interview screen.

It should contain:
- candidate dossier,
- interview status,
- conversation transcript,
- AI interviewer messages,
- candidate responses,
- answer composer,
- submit interaction,
- live progress,
- current interview phase.

The experience should feel like a real technical interview.

Do not make the interview feel like a static form or questionnaire.

---

## Prompt 14 — Curriculum Map

Create the curriculum visualization.

Represent the 31-day AI Cohort through:
- modules,
- days,
- topics,
- progress,
- active day,
- explored days,
- completed coverage.

Show which curriculum area is currently being assessed.

Use a compact technical/command-center style rather than a generic calendar.

---

## Prompt 15 — Competency & Live Signals

Build the live competency signal panel.

Show qualitative signals such as:
- Strong,
- Developing,
- Needs Probe,
- Unclear.

Display relevant topics/tools and the associated curriculum day.

The signals should update as the interview progresses.

Make it clear that these are qualitative interview signals rather than fake numerical scores.

---

## Prompt 16 — Interview Adaptation UX

Make the frontend clearly communicate that the interviewer is adapting.

The UI should support:
- changing phases,
- changing curriculum focus,
- follow-up questions,
- deeper questions,
- progress updates,
- active curriculum day,
- interview status.

The UI must consume actual backend state when available rather than inventing a separate interview flow.

---

## Prompt 17 — Review / Final Assessment

Build the final interview report page.

Display structured feedback including:
- overall summary,
- strengths,
- gaps,
- recommended next steps,
- assessment sections,
- competency information,
- interview journey,
- curriculum coverage,
- score/assessment visualization where appropriate.

The report should feel actionable and useful to a candidate after the interview.

---

# SHARED — BACKEND + FRONTEND INTEGRATION

## Prompt 18 — Full-Stack Integration

Connect the frontend interview experience to the backend API.

The frontend must:
- generate and preserve a session ID,
- send the candidate to the backend,
- start the interview through the real API,
- submit answers through the real API,
- render backend replies,
- consume question number and phase,
- handle completion,
- map backend feedback into the review page.

Do not leave the live interview powered by mock data.

Preserve mock functionality only as an optional fallback if it does not interfere with the real API path.

Configure the frontend API base URL for the backend's actual port.

---

## Prompt 19 — Full Audit, Debugging & Requirements Verification

Perform a complete read-only audit of the finished project.

Trace the entire flow:

candidate selection
→ frontend interview page
→ API request
→ backend route
→ session
→ candidate intelligence
→ curriculum intelligence
→ question planner
→ LLM/fallback
→ answer evaluator
→ adaptive decision
→ next question
→ completion
→ feedback
→ frontend review page.

Identify:
- integration mismatches,
- broken API contracts,
- mock-vs-real data issues,
- state-management problems,
- progress calculation issues,
- missing error handling,
- duplicate questions,
- failure cases,
- violations of the minimum challenge requirements.

Do not modify files until the audit is complete.

After identifying issues, provide:
1. exact root cause,
2. exact files involved,
3. minimal safe fix,
4. regression tests required.

Avoid unrelated refactoring.

---

## Prompt 20 — Final Hackathon Readiness & Verification

Perform the final production/hackathon-readiness review.

Verify that the system satisfies the challenge requirements:

- conversational technical interview,
- minimum 8 questions,
- at least 4 curriculum days,
- adaptive follow-up questions,
- context maintained across turns,
- structured final feedback,
- required HTTP endpoint,
- candidate-specific interview,
- curriculum-grounded questions,
- graceful behavior without an LLM key where supported,
- frontend/backend integration,
- clean startup instructions,
- no secrets committed,
- build succeeds,
- tests pass.

Run the relevant backend and frontend verification.

Do not introduce unnecessary architecture or dependencies.

Return a concise final status containing:
- what works,
- what was fixed,
- remaining risks,
- exact commands to run the project,
- exact commands to verify it before submission.

---

# PROJECT CONTEXT

## Challenge

The ViCoDathon project is an AI Interview Agent for a 31-day enterprise AI engineering cohort.

The cohort covers topics including:
- RAG,
- vector databases,
- prompt engineering,
- agentic AI,
- MCP,
- AI deployment,
- production AI systems.

The system conducts a personalized technical interview based on:
- curriculum,
- candidate progress,
- completed missions,
- attempts,
- skipped topics,
- learning signals.

## Minimum Requirements

The completed system must:
1. Conduct a conversational technical interview.
2. Ask at least 8 questions.
3. Cover at least 4 different curriculum days.
4. Generate follow-up questions based on previous responses.
5. Maintain conversation context.
6. Produce structured final feedback.
7. Expose the required HTTP endpoint.

## Intended Architecture

### Backend

- Node.js
- Plain HTTP server
- In-memory session store
- Candidate intelligence
- Curriculum intelligence
- Question planner
- Answer evaluator
- LLM abstraction
- HTTP routes

### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- Component-based architecture
- Dashboard/Command Center
- Live interview console
- Curriculum visualization
- Competency signals
- Final review/report

## Important Design Principle

The project should prioritize a **real adaptive interview experience** over unnecessary infrastructure.

The architecture should remain understandable, explainable, and hackathon-ready.
