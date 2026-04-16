# Thread Intent Separation

## Problem Statement

The web app is deriving product intent in multiple places. `store.ts` computes sidebar summary state directly from raw thread data, while `ChatView.tsx` separately derives pending approvals, pending user input, latest proposed plans, work log entries, and other turn-level meaning from the same thread state. This makes UI code an accidental storage layer for product intent and increases the chance that sidebar and active-thread surfaces drift apart.

## Solution

Introduce a small pure derivation module for thread intent. Keep it fact-level, not UI-level: derive stable thread meaning from thread state once, then let specific surfaces project that meaning into sidebar rows, timeline rows, labels, and prompts. Start with the sidebar summary seam, then expand the module to active-thread projections.

## Commits

1. Add a new thread-intent test file with one focused behavior: a thread with user messages, pending approval activity, pending user input activity, and an unimplemented proposed plan produces the expected sidebar intent fields.
2. Add a pure `threadIntent.ts` module that owns sidebar-focused intent derivation only, keeping the implementation small and behavior-preserving.
3. Move `latestUserMessageAt` scanning into the new module.
4. Move sidebar booleans for pending approvals, pending user input, and actionable proposed plans into the new module.
5. Update `store.ts` to build sidebar summaries through the new thread-intent module instead of open-coded derivation.
6. Keep the public `SidebarThreadSummary` shape unchanged so callers do not need to move yet.
7. Run focused tests and refactor for naming clarity and import hygiene.
8. Add a second test for source-plan behavior if the sidebar path later needs cross-thread proposed-plan fallback.
9. Expand `threadIntent.ts` with an active-thread derivation surface for latest-turn settlement, work log entries, and proposed-plan resolution once the sidebar slice is stable.
10. Update `ChatView.tsx` to consume the active-thread intent projection instead of recomputing intent ad hoc.
11. Keep timeline row derivation and status-pill labeling outside the intent module so presentation logic remains separate.
12. Add selector-level tests or component-adjacent tests proving sidebar and active-thread surfaces agree on shared facts after the migration.

## Decision Document

- The new boundary should be a pure derivation module, not a stateful service.
- The module should expose semantic facts, not UI labels, classes, or prebuilt rows.
- `session-logic.ts` remains the lower-level toolbox for activity and plan derivation during the transition.
- The first vertical slice is the sidebar summary because it is small, already duplicated conceptually, and has limited blast radius.
- The intent module should accept thread-shaped data, not the entire app state, so it stays easy to test and reuse.
- Cross-thread proposed-plan fallback is part of thread intent, but it can follow the initial sidebar slice if not required immediately by the migrated caller.

## Testing Decisions

- Good tests assert external behavior from a thread-shaped input and ignore implementation details like helper boundaries or internal memoization.
- The first tests should target the new intent module directly because it is the new public derivation boundary.
- Store-level behavior should continue to be covered by existing integration-style store tests, with additional assertions only where the new boundary changes the observable sidebar summary.
- Prior art lives in `apps/web/src/session-logic.test.ts` for derivation behavior and `apps/web/src/store.test.ts` for store-integrated behavior.

## Out of Scope

- Reworking timeline-row presentation logic.
- Changing the `SidebarThreadSummary` contract for callers.
- Moving local send/disptach UI state into the intent module.
- Large selector architecture changes across the entire web store.
- Any server-side orchestration changes.

## Further Notes

- This refactor is explicitly guided by the “UI intent separation” principle: product meaning should survive UI reshaping.
- GitHub issue creation is blocked in the current environment, so the plan is stored locally instead.
