# ADR-0006 — LangGraph.js for AI orchestration

**Status:** Accepted

## Context

EngineeringOS runs a **fleet of specialized agents** and a Manager Copilot
([07 — AI Architecture](../07-ai-architecture.md)). These are not single prompt→response
calls: they are **stateful, multi-step** flows — retrieve context (RAG), call tools/agents,
branch on results, loop, and emit an insight **plus its evidence** for explainability
(`NFR-EXPLAIN`, [04 §7](../04-data-model.md)). Every run is audited in `agent_runs`
(inputs, model, tokens, cost, latency). We need durable, inspectable orchestration that
lives **in TypeScript** so it shares `@eos/*` types and runs inside the Nest `worker` — not
a separate Python service that fractures the stack and duplicates contracts.

## Decision

Use **LangGraph.js** to model agent workflows as explicit **state graphs** (nodes = steps,
edges = transitions, typed shared state). It runs in the `worker` behind the `Agent` port
so new agents register by capability ([03 §8](../03-system-architecture.md)). Model calls
go through our own **model router** (Claude/OpenAI/Gemini). Graph state and step outputs
feed `agent_runs` and recommendation `evidence`.

## Consequences

**Good**

- Explicit graph state gives durable, resumable, **inspectable** runs — directly serves `NFR-EXPLAIN`.
- Native TypeScript keeps agents in one language/repo, sharing types with FE/BE — no Python service.
- First-class support for cycles, branching, human-in-the-loop, and checkpointing.
- Node-level boundaries make it natural to log tokens/cost/evidence per step into `agent_runs`.

**Bad**

- LangGraph.js is younger and less battle-tested than the Python original; smaller ecosystem.
- Graph abstraction is overkill for trivial single-shot prompts (we bypass it for those).
- Adds a dependency whose API surface is still evolving; upgrades may need rework.

## Alternatives considered

- **Bespoke orchestrator** — full control, but we'd rebuild state, checkpointing, branching,
  and retries. Reinventing the framework for no differentiating value. Rejected.
- **LangChain agents (AgentExecutor)** — higher-level but opaque control flow; harder to make
  runs deterministic and auditable. LangGraph's explicit graph is a better fit for `NFR-EXPLAIN`.
- **Python (LangGraph/CrewAI/AutoGen) service** — richest ecosystem, but a second language and
  a separate deploy that duplicates our contracts and fights the single-VM setup. Rejected.
