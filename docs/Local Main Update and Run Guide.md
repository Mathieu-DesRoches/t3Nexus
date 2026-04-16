# Local Main Update and Run Guide

This guide is for the repo at:

`C:\Users\User\Projects\t3-lab\t3Nexus`

## Current Status

At the time this file was written:

- repo was clean
- `main` matched `origin/main`
- `main` also matched `upstream/main`
- current commit was `7a008461`

That means you may not need to update before launching. The shortest path is:

```powershell
cd "C:\Users\User\Projects\t3-lab\t3Nexus"
bun install
bun run dev:desktop
```

## Full Repeatable Update And Launch Flow

1. Close any running T3 Code or T3 Nexus windows.

2. Open Cursor or Codex Desktop on:

   `C:\Users\User\Projects\t3-lab\t3Nexus`

3. Open a terminal.

4. Go to the repo root:

```powershell
cd "C:\Users\User\Projects\t3-lab\t3Nexus"
```

5. Fetch latest upstream changes:

```powershell
git fetch upstream --tags --prune
```

6. Make sure you are on `main`:

```powershell
git checkout main
```

7. Fast-forward local `main` to upstream:

```powershell
git pull --ff-only upstream main
```

8. Push the updated `main` to your fork:

```powershell
git push origin main
```

9. Install or refresh dependencies:

```powershell
bun install
```

10. Check runtime versions:

```powershell
bun --version
node --version
```

Expected:

- `bun` `1.3.9`
- `node` `24.13.1` or newer

11. Launch the desktop app from source:

```powershell
bun run dev:desktop
```

12. Wait for the app window to open.

## Important Note About The Version Number

The app may still show version `0.0.17` in Settings. That does not mean you failed to update. `main` is newer than the `v0.0.17` release tag, but the visible version string has not been bumped yet.

## Quick Verification

To confirm you are on newer code:

```powershell
git log --oneline -n 5
```

If the top commit is newer than `e3004ae8` (`v0.0.17`), you are already beyond the release tag.

## If Launch Fails

Run these first:

```powershell
git status --short --branch
bun --version
node --version
```

Then retry:

```powershell
bun install
bun run dev:desktop
```

## If The App Still Shows Disconnects Or Stale Refresh

That may still be an upstream issue rather than a local setup mistake. The next investigation target should be current `main` behavior around:

- auth/session cookies
- websocket refresh publishing
- provider session handoff

Read `docs/Codex Desktop Handoff.md` before continuing.
