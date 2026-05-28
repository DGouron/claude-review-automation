---
title: "SPEC-189: Ask Ember about your reviews (read-only chat)"
status: drafted
milestone: Ember Assistant
depends_on:
  - "188-setup-wizard-wireframe-avatar"
related:
  - "169-migrate-claude-invocation-to-bg-mode"
  - "172-claude-agents-supervisor-lifecycle"
  - "125-developer-team-insights"
  - "126-token-usage-summary-dashboard"
  - "176-job-history-persistence"
  - "173-dashboard-worktree-panel"
  - "185-setup-wizard-mcp-agent-fallback"
---

# SPEC-189: Ask Ember about your reviews (read-only chat)

## Context

The dashboard already holds rich review data — scores, job history, developer/team insights, worktree state — but answering a question like "which project regressed this week?" or "why was MR-42 blocked?" means hunting across panels. This spec adds **Ember**, an always-available chat where the operator asks in natural language and gets an answer grounded in that existing data. Phase A is strictly read-only: Ember explains and surfaces, it never changes anything.

## Rules

- Ember answers only from the project's own review data (review scores, job history, developer and team insights, worktree state); when asked anything outside that data, it says it does not know rather than inventing an answer
- Ember reads the review data live at the moment of the question, so an answer reflects the current state
- Ember never modifies, creates, or deletes anything — Phase A is strictly read-only
- Ember requires no API key; it relies on the operator's existing Claude login
- there is a single shared Ember per machine, holding one ongoing conversation thread
- within a session, follow-up questions keep their context: a later question may refer to an earlier answer without repeating the subject
- Ember serves consecutive questions without restarting for every message — no per-message cold start
- after a period of inactivity Ember releases its resources; the next question transparently brings it back, accepting a short delay on that first question
- while Ember prepares an answer the avatar shows its working state and the input stays usable; answers may stream in progressively
- when Ember cannot be reached, the chat shows a clear French message with a retry control and never hangs silently
- the chat reuses the existing visual identity: dark warm background, amber and green accents, monospace, `// EMBER` label, the reactor-core avatar states, no emoji
- every answer and every status change is announced to screen-reader users

## Scenarios

### Ask and get a grounded answer

- ask about scores: {question: "Quel projet a le pire score moyen cette semaine ?"} → answer grounded in current review scores + avatar working then idle
- ask about a blocked review: {question: "Pourquoi la review de MR-42 a-t-elle été bloquée ?"} → answer drawn from job history and insights
- follow-up keeps context: {previous answer about: "projet X", question: "Et le mois dernier ?"} → answer about projet X for the previous month, subject not repeated
- streamed answer: {long question} → partial answer text appears progressively while the avatar stays in working state

### Boundaries of a read-only assistant

- out-of-data question: {question: "Quelle est la météo demain ?"} → Ember répond qu'il ne sait répondre qu'à propos des reviews, aucune invention
- write attempt: {question: "Crée un quality gate à 80 pour le projet X"} → Ember explique que créer ou modifier arrivera en Phase B et n'effectue aucune écriture
- empty input: {question: ""} → rien n'est envoyé, le champ reste focalisé

### Availability and failure

- first question after idle release: {state: "idle, resources released", question: "..."} → Ember se réactive de façon transparente puis répond (délai accepté sur ce premier message)
- assistant unreachable: {assistant: "unavailable"} → affiche "// EMBER INDISPONIBLE — réessayer" + bouton retry, aucun blocage silencieux

### Accessibility and identity

- screen reader: {NVDA active, answer arrives} → la live region annonce le changement de statut puis le texte de la réponse
- visual identity: {} → fond sombre chaud + accents amber/green + monospace + `// EMBER` + états de l'avatar, sans emoji

## Out of Scope

- any write or mutation: quality gate creation, rule or pattern suggestions that change configuration (Phase B)
- worktree-based acting: Phase A reads existing data and uses no git checkout
- voice, speech-to-text, text-to-speech, audio feedback
- durable cross-session memory or learning about the operator; Phase A context lasts only within the live session
- reseeding the assistant from a saved transcript when its context fills — rely on the built-in context handling; revisit only if observed to be insufficient
- the setup wizard flow itself (SPEC-184 / SPEC-188 reused only for the avatar visuals)
- per-project separate conversations — there is one shared Ember
- multi-user or remote access — local dashboard, single operator

## Glossary

| Term | Definition |
|------|------------|
| Ember | The dashboard's conversational assistant (formerly "Jarvis"), shown as the reactor-core avatar |
| Review data | The project's existing review scores, job history, developer/team insights, and worktree state |
| Session | One live, reused Ember instance serving consecutive questions until it goes idle |
| Idle release | Freeing Ember's resources after inactivity; the next question transparently revives it |
| Grounded answer | An answer derived only from the project's review data, never invented |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Review data sources (SPEC-125/126/176/173) and the avatar (SPEC-188) are on master; the background-session mechanism (SPEC-169) and supervisor (SPEC-172) are implemented. This adds a chat surface + a session-backed read path. |
| Negotiable | OK | The spec fixes the WHAT (grounded read-only Q&A, availability, identity, failure handling); the HOW — session mechanism, idle policy, tool wiring — is left open for the plan. |
| Valuable | OK | Turns scattered dashboard panels into a "just ask" surface and is the first conversational step of the product's signature assistant. |
| Estimable | WARN | The conversational, session-backed read path is new; bounded by reusing existing data + avatar, but message streaming and session reuse carry some unknowns. |
| Small | WARN | Borderline: chat panel + session-backed answer path + grounding over four data sources + states/fallback. Kept under ~15 files by deferring respawn-from-transcript and durable memory (out of scope). |
| Testable | OK | Grounding (answers from data only), the read-only guarantee, idle-revive, the unreachable fallback, and identity each have a scenario. Answer generation itself is humble glue — acceptance asserts grounding + status sequence, not exact wording. |

Verdict: **READY (pending user validation)** — no KO; two WARN tracked by the explicit scope cut.

## Notes for implementation (non-normative)

Direction agreed with the user, left free per Negotiable — recorded so the planner does not relitigate it:

- Ember runs as a long-lived background session (SPEC-169) hosted by the existing `claude agents` supervisor (SPEC-172, one per machine). NOT one invocation per message. No API key (operator's Claude login).
- No worktree in Phase A.
- The four data sources are exposed to the session as read-only tools.
- Idle release uses a simple inactivity timeout; the respawn-from-transcript and durable-memory refinements are explicitly deferred (see Out of Scope).

## Definition of Done

Standard checklist from `.claude/skills/product-manager/rules/dod.md` applies. Specific to this spec:

- [ ] On the dashboard, an always-visible Ember chat panel accepts a free-text question and returns a natural-language answer
- [ ] Answers are grounded in the existing review data; an out-of-data question is declined rather than answered with invention — verified by test
- [ ] No write path exists: a write request is declined with the Phase-B message and nothing is mutated — verified by test
- [ ] Consecutive questions reuse one session (no per-message cold start); after an inactivity timeout the next question transparently revives Ember — verified by test
- [ ] When the assistant is unreachable, the chat shows the French unavailable message + retry and never hangs — verified by test
- [ ] The avatar reflects idle/working states during a question/answer cycle, reusing the SPEC-188 visuals
- [ ] Status changes and answers are announced to screen-reader users
- [ ] Acceptance test: a scripted question over fixed review data asserts a grounded answer + the idle→working→idle status sequence
