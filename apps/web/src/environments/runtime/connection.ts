import type {
  EnvironmentId,
  OrchestrationEvent,
  OrchestrationReadModel,
  ServerConfig,
  ServerLifecycleWelcomePayload,
  TerminalEvent,
} from "@t3tools/contracts";
import type { KnownEnvironment } from "@t3tools/client-runtime";

import { createOrchestrationSyncController } from "./orchestrationSync";
import type { WsRpcClient } from "~/rpc/wsRpcClient";

export interface EnvironmentConnection {
  readonly kind: "primary" | "saved";
  readonly environmentId: EnvironmentId;
  readonly knownEnvironment: KnownEnvironment;
  readonly client: WsRpcClient;
  readonly ensureBootstrapped: () => Promise<void>;
  readonly reconnect: () => Promise<void>;
  readonly dispose: () => Promise<void>;
}

interface OrchestrationHandlers {
  readonly applyEventBatch: (
    events: ReadonlyArray<OrchestrationEvent>,
    environmentId: EnvironmentId,
  ) => void;
  readonly syncSnapshot: (snapshot: OrchestrationReadModel, environmentId: EnvironmentId) => void;
  readonly applyTerminalEvent: (event: TerminalEvent, environmentId: EnvironmentId) => void;
}

interface EnvironmentConnectionInput extends OrchestrationHandlers {
  readonly kind: "primary" | "saved";
  readonly knownEnvironment: KnownEnvironment;
  readonly client: WsRpcClient;
  readonly refreshMetadata?: () => Promise<void>;
  readonly onConfigSnapshot?: (config: ServerConfig) => void;
  readonly onWelcome?: (payload: ServerLifecycleWelcomePayload) => void;
}

export function createEnvironmentConnection(
  input: EnvironmentConnectionInput,
): EnvironmentConnection {
  const environmentId = input.knownEnvironment.environmentId;

  if (!environmentId) {
    throw new Error(
      `Known environment ${input.knownEnvironment.label} is missing its environmentId.`,
    );
  }

  const observeEnvironmentIdentity = (nextEnvironmentId: EnvironmentId, source: string) => {
    if (environmentId !== nextEnvironmentId) {
      throw new Error(
        `Environment connection ${environmentId} changed identity to ${nextEnvironmentId} via ${source}.`,
      );
    }
  };

  const orchestrationSync = createOrchestrationSyncController({
    environmentId,
    getSnapshot: () => input.client.orchestration.getSnapshot(),
    replayEvents: ({ fromSequenceExclusive }) =>
      input.client.orchestration.replayEvents({ fromSequenceExclusive }),
    applyEventBatch: input.applyEventBatch,
    syncSnapshot: input.syncSnapshot,
  });

  const unsubLifecycle = input.client.server.subscribeLifecycle(
    (event: Parameters<Parameters<WsRpcClient["server"]["subscribeLifecycle"]>[0]>[0]) => {
      if (event.type !== "welcome") {
        return;
      }
      observeEnvironmentIdentity(
        event.payload.environment.environmentId,
        "server lifecycle welcome",
      );
      input.onWelcome?.(event.payload);
    },
  );

  const unsubConfig = input.client.server.subscribeConfig(
    (event: Parameters<Parameters<WsRpcClient["server"]["subscribeConfig"]>[0]>[0]) => {
      if (event.type !== "snapshot") {
        return;
      }
      observeEnvironmentIdentity(event.config.environment.environmentId, "server config snapshot");
      input.onConfigSnapshot?.(event.config);
    },
  );

  const unsubDomainEvent = input.client.orchestration.onDomainEvent(
    (event: Parameters<Parameters<WsRpcClient["orchestration"]["onDomainEvent"]>[0]>[0]) => {
      orchestrationSync.handleDomainEvent(event);
    },
    {
      onResubscribe: () => {
        orchestrationSync.handleResubscribe();
      },
    },
  );

  const unsubTerminalEvent = input.client.terminal.onEvent(
    (event: Parameters<Parameters<WsRpcClient["terminal"]["onEvent"]>[0]>[0]) => {
      input.applyTerminalEvent(event, environmentId);
    },
  );

  void orchestrationSync.ensureBootstrapped().catch(() => undefined);

  const cleanup = () => {
    orchestrationSync.dispose();
    unsubDomainEvent();
    unsubTerminalEvent();
    unsubLifecycle();
    unsubConfig();
  };

  return {
    kind: input.kind,
    environmentId,
    knownEnvironment: input.knownEnvironment,
    client: input.client,
    ensureBootstrapped: orchestrationSync.ensureBootstrapped,
    reconnect: async () => {
      await input.client.reconnect();
      await input.refreshMetadata?.();
      await orchestrationSync.ensureBootstrapped();
    },
    dispose: async () => {
      cleanup();
      await input.client.dispose();
    },
  };
}
