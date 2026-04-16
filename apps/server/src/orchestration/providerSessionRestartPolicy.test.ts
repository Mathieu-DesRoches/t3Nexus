import { describe, expect, it } from "vitest";

import { deriveProviderSessionRestartPolicy } from "./providerSessionRestartPolicy";

describe("deriveProviderSessionRestartPolicy", () => {
  it("does not restart when runtime mode and model selection are unchanged", () => {
    expect(
      deriveProviderSessionRestartPolicy({
        currentProvider: "codex",
        currentRuntimeMode: "approval-required",
        desiredRuntimeMode: "approval-required",
        requestedModelSelection: {
          provider: "codex",
          model: "gpt-5-codex",
        },
        activeSessionModel: "gpt-5-codex",
        sessionModelSwitch: "in-session",
        previousModelSelection: {
          provider: "codex",
          model: "gpt-5-codex",
        },
      }),
    ).toMatchObject({
      shouldRestart: false,
      clearResumeCursor: false,
      runtimeModeChanged: false,
      providerChanged: false,
      modelChanged: false,
    });
  });

  it("restarts and clears resume cursor when the provider model requires session restart", () => {
    expect(
      deriveProviderSessionRestartPolicy({
        currentProvider: "codex",
        currentRuntimeMode: "approval-required",
        desiredRuntimeMode: "approval-required",
        requestedModelSelection: {
          provider: "codex",
          model: "gpt-5.4",
        },
        activeSessionModel: "gpt-5-codex",
        sessionModelSwitch: "restart-session",
        previousModelSelection: {
          provider: "codex",
          model: "gpt-5-codex",
        },
      }),
    ).toMatchObject({
      shouldRestart: true,
      clearResumeCursor: true,
      modelChanged: true,
      shouldRestartForModelChange: true,
    });
  });

  it("restarts claude sessions when the requested model selection changes", () => {
    expect(
      deriveProviderSessionRestartPolicy({
        currentProvider: "claudeAgent",
        currentRuntimeMode: "full-access",
        desiredRuntimeMode: "full-access",
        requestedModelSelection: {
          provider: "claudeAgent",
          model: "sonnet",
        },
        activeSessionModel: "sonnet",
        sessionModelSwitch: "in-session",
        previousModelSelection: {
          provider: "claudeAgent",
          model: "opus",
        },
      }),
    ).toMatchObject({
      shouldRestart: true,
      clearResumeCursor: false,
      shouldRestartForModelSelectionChange: true,
    });
  });
});
