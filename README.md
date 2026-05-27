# T3 Nexus

T3 Nexus is Mat's maintained fork of T3 Code, a minimal web GUI for coding agents.

## Installation

> [!WARNING]
> T3 Code currently supports Codex and Claude.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - Claude: install Claude Code and run `claude auth login`

### Run without installing

```bash
npx t3
```

### Desktop app

For local Windows builds, use the repo install script. It creates a unique local SemVer prerelease build and runs the generated NSIS installer so Windows launchers can find `T3 Nexus`.

```powershell
bun run install:desktop:win
```

Windows packaging requires Visual Studio C++ Build Tools because Electron Builder rebuilds native desktop dependencies.

The preferred durable Windows update lane is GitHub Actions:

- pushing `clean-main` runs `Nexus Desktop Release`
- the workflow builds the Windows NSIS installer on `windows-2022`
- the workflow publishes a versioned GitHub Release such as `nexus-desktop-v0.1.42`
- the release contains the installer plus Electron updater metadata

To build the installer without running it:

```powershell
bun run dist:desktop:win:local
```

Upstream T3 Code desktop packages are still available from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from package registries:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
```

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

## If you REALLY want to contribute still.... read this first

Before local development, prepare the environment and install dependencies:

```bash
# Optional: only needed if you use mise for dev tool management.
mise install
bun install .
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
