# Ubiquitous Language

## Conversation execution

| Term                 | Definition                                                                 | Aliases to avoid               |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------ |
| **Environment**      | A connected runtime host that owns projects, threads, and transport state. | Workspace, instance            |
| **Project**          | A repository-backed working context inside an environment.                 | Repo, workspace                |
| **Thread**           | A persistent conversational workstream attached to one project.            | Chat, session                  |
| **Turn**             | One assistant execution cycle within a thread.                             | Run, request                   |
| **Session**          | The live provider runtime attached to a thread at a point in time.         | Thread, connection             |
| **Provider**         | The backing agent system that executes turns for a session.                | Model, runtime                 |
| **Interaction mode** | The approval and autonomy policy used when a provider executes work.       | Permission mode, approval mode |
| **Runtime mode**     | The environment access level granted to the provider runtime.              | Sandbox mode, access mode      |

## Thread state and intent

| Term                         | Definition                                                                    | Aliases to avoid               |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| **Message**                  | A user, assistant, or system utterance recorded in a thread.                  | Event, response                |
| **Activity**                 | A structured runtime event describing work performed during a thread or turn. | Log line, telemetry            |
| **Latest turn**              | The most recent known turn state for a thread.                                | Current turn, active run       |
| **Pending approval**         | A runtime request waiting for the user to approve an action.                  | Blocker, prompt                |
| **Pending user input**       | A runtime request waiting for explicit user information.                      | Approval, form                 |
| **Proposed plan**            | A generated plan artifact that may later be implemented by a thread.          | TODO list, proposal            |
| **Actionable proposed plan** | A proposed plan that exists and has not yet been implemented.                 | Draft plan, current plan       |
| **Source proposed plan**     | The plan a running turn is currently implementing.                            | Parent plan, selected plan     |
| **Sidebar summary**          | A condensed view of thread intent used for list and navigation surfaces.      | Thread preview, sidebar thread |
| **Timeline**                 | A presentation of messages and derived state for reading a thread.            | Transcript, history view       |
| **Work log**                 | A derived view of activities that explains what work happened during a turn.  | Activity feed, execution log   |

## Repository coordination

| Term                  | Definition                                                      | Aliases to avoid      |
| --------------------- | --------------------------------------------------------------- | --------------------- |
| **Branch**            | The repository branch associated with a thread's working state. | Version, lane         |
| **Worktree**          | The filesystem checkout used by a thread's repository work.     | Sandbox, workspace    |
| **Checkpoint**        | A named persisted repository state captured during execution.   | Snapshot, savepoint   |
| **Turn diff summary** | A per-turn summary of repository changes produced by execution. | Patch, commit summary |

## Relationships

- A **Project** belongs to exactly one **Environment**.
- A **Thread** belongs to exactly one **Project** and one **Environment**.
- A **Thread** may have zero or one live **Session** at a time.
- A **Session** executes zero or more **Turns** for its **Thread**.
- A **Turn** produces **Activities** and may produce **Messages**, **Checkpoints**, and a **Turn diff summary**.
- A **Thread** owns many **Messages**, **Activities**, and **Proposed plans**.
- A running **Turn** may reference one **Source proposed plan**.
- A **Sidebar summary** is derived from a **Thread**; it is not a separate domain object.
- A **Timeline** and **Work log** are presentation views derived from thread state and activity state.

## Example dialogue

> **Dev:** "If the **Thread** is open in the sidebar, should the **Sidebar summary** decide whether there is a pending approval?"
>
> **Domain expert:** "No. The **Sidebar summary** only reports thread intent. The actual **Pending approval** comes from **Activities** on the thread."
>
> **Dev:** "Then where does the current plan shown in the list come from?"
>
> **Domain expert:** "From the **Proposed plan** state, plus the **Latest turn** if that turn is implementing a **Source proposed plan**."
>
> **Dev:** "So the **Timeline** and sidebar can disagree visually, but they should both be derived from the same thread intent?"
>
> **Domain expert:** "Exactly. UI expression can differ, but the intent should be shared."

## Flagged ambiguities

- "session" and "thread" are easy to conflate. Use **Thread** for the durable conversation record and **Session** for the live provider runtime.
- "turn", "run", and "request" have all been used informally. Use **Turn** for the execution lifecycle and reserve "request" for transport- or UI-level phrasing.
- "plan" is overloaded between a generated artifact and UI affordances around that artifact. Use **Proposed plan** for the artifact and **Actionable proposed plan** when the user can act on it now.
- "activity", "event", and "log" blur together. Use **Activity** for domain/runtime records; use **Work log** for the derived UI presentation of those records.
- "sidebar thread" sounds like a separate entity. Use **Sidebar summary** for the derived navigation model and **Thread** for the domain object.
