# Codex Desktop Handoff

Use this file to resume work in Codex Desktop if T3 Code is closed.

## Current Repo

- Repo path: `C:\Users\User\Projects\t3-lab\t3Nexus`
- Use this repo, not the older `T3 Nexus` workspace with a space in the folder name.
- Current branch: `main`
- Current remotes:
  - `origin` -> `https://github.com/Mathieu-DesRoches/t3Nexus.git`
  - `upstream` -> `https://github.com/pingdotgg/t3code.git`

## Current State

- Repo is clean.
- `main`, `origin/main`, and `upstream/main` are aligned.
- Current commit: `7a008461`
- Latest visible version in the app may still say `0.0.17` even though `main` is newer than the `v0.0.17` release tag.

## Why This Exists

This session established the correct repo to use, confirmed that it is already synced to latest `main`, and wrote a repeatable step-by-step guide for updating and running the local fork.

## First Files To Read

1. `docs/Codex Desktop Handoff.md`
2. `docs/Local Main Update and Run Guide.md`

## Immediate Next Action

From the repo root:

```powershell
cd "C:\Users\User\Projects\t3-lab\t3Nexus"
bun install
bun run dev:desktop
```

If you want to refresh against upstream again before launching:

```powershell
cd "C:\Users\User\Projects\t3-lab\t3Nexus"
git fetch upstream --tags --prune
git checkout main
git pull --ff-only upstream main
git push origin main
bun install
bun run dev:desktop
```

## Environment Requirements

- `bun` `1.3.9`
- `node` `24.13.1` or newer

Check them with:

```powershell
bun --version
node --version
```

## If Problems Continue

Focus first on:

- disconnects
- stale UI refresh/state
- provider session handoff issues
- auth/session cookie instability

Relevant upstream context already identified in this session:

- `4ae9de31` `Stabilize auth session cookies per server mode (#1898)`
- branch `cursor/refresh-provider-publishing-135f`
- branch `cursor/provider-session-handoff-5274`

## Suggested Prompt For Codex Desktop

```text
Open C:\Users\User\Projects\t3-lab\t3Nexus, read docs/Codex Desktop Handoff.md and docs/Local Main Update and Run Guide.md, then help me continue from there. If the local app still has disconnect or stale refresh issues on current main, investigate the likely session/auth/websocket fixes next.
```
