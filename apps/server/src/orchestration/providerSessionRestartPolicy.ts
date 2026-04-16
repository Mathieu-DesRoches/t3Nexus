import type { ModelSelection, ProviderKind, RuntimeMode } from "@t3tools/contracts";
import { Equal } from "effect";

export interface ProviderSessionRestartPolicyInput {
  readonly currentProvider: ProviderKind | undefined;
  readonly currentRuntimeMode: RuntimeMode | undefined;
  readonly desiredRuntimeMode: RuntimeMode;
  readonly requestedModelSelection: ModelSelection | undefined;
  readonly activeSessionModel: string | undefined;
  readonly sessionModelSwitch: "unsupported" | "in-session" | "restart-session";
  readonly previousModelSelection: ModelSelection | undefined;
}

export interface ProviderSessionRestartPolicy {
  readonly runtimeModeChanged: boolean;
  readonly providerChanged: boolean;
  readonly modelChanged: boolean;
  readonly shouldRestartForModelChange: boolean;
  readonly shouldRestartForModelSelectionChange: boolean;
  readonly shouldRestart: boolean;
  readonly clearResumeCursor: boolean;
}

export function deriveProviderSessionRestartPolicy(
  input: ProviderSessionRestartPolicyInput,
): ProviderSessionRestartPolicy {
  const runtimeModeChanged = input.desiredRuntimeMode !== input.currentRuntimeMode;
  const providerChanged =
    input.requestedModelSelection !== undefined &&
    input.currentProvider !== undefined &&
    input.requestedModelSelection.provider !== input.currentProvider;
  const modelChanged =
    input.requestedModelSelection !== undefined &&
    input.requestedModelSelection.model !== input.activeSessionModel;
  const shouldRestartForModelChange =
    modelChanged && input.sessionModelSwitch === "restart-session";
  const shouldRestartForModelSelectionChange =
    input.currentProvider === "claudeAgent" &&
    input.requestedModelSelection !== undefined &&
    !Equal.equals(input.previousModelSelection, input.requestedModelSelection);
  const shouldRestart =
    runtimeModeChanged ||
    providerChanged ||
    shouldRestartForModelChange ||
    shouldRestartForModelSelectionChange;

  return {
    runtimeModeChanged,
    providerChanged,
    modelChanged,
    shouldRestartForModelChange,
    shouldRestartForModelSelectionChange,
    shouldRestart,
    clearResumeCursor: providerChanged || shouldRestartForModelChange,
  };
}
