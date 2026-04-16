import type { EnvironmentId, OrchestrationEvent, OrchestrationReadModel } from "@t3tools/contracts";

import {
  createOrchestrationRecoveryCoordinator,
  deriveReplayRetryDecision,
  type OrchestrationRecoveryReason,
  type ReplayRetryTracker,
} from "../../orchestrationRecovery";
import { isTransportConnectionErrorMessage } from "~/rpc/transportError";

const REPLAY_RECOVERY_RETRY_DELAY_MS = 100;
const MAX_NO_PROGRESS_REPLAY_RETRIES = 3;
const RECOVERY_TRANSPORT_RETRY_DELAY_MS = 250;
const MAX_RECOVERY_TRANSPORT_RETRIES = 20;

export interface OrchestrationSyncController {
  readonly ensureBootstrapped: () => Promise<void>;
  readonly handleDomainEvent: (event: OrchestrationEvent) => void;
  readonly handleResubscribe: () => void;
  readonly dispose: () => void;
}

interface OrchestrationSyncHandlers {
  readonly applyEventBatch: (
    events: ReadonlyArray<OrchestrationEvent>,
    environmentId: EnvironmentId,
  ) => void;
  readonly syncSnapshot: (snapshot: OrchestrationReadModel, environmentId: EnvironmentId) => void;
}

interface OrchestrationSyncInput extends OrchestrationSyncHandlers {
  readonly environmentId: EnvironmentId;
  readonly getSnapshot: () => Promise<OrchestrationReadModel>;
  readonly replayEvents: (input: {
    readonly fromSequenceExclusive: number;
  }) => Promise<ReadonlyArray<OrchestrationEvent>>;
}

function createSnapshotBootstrapController(input: {
  readonly isBootstrapped: () => boolean;
  readonly runSnapshotRecovery: (
    reason: Extract<OrchestrationRecoveryReason, "bootstrap" | "replay-failed">,
  ) => Promise<void>;
}) {
  let inFlight: Promise<void> | null = null;

  return {
    ensureSnapshotRecovery(
      reason: Extract<OrchestrationRecoveryReason, "bootstrap" | "replay-failed">,
    ): Promise<void> {
      if (input.isBootstrapped()) {
        return Promise.resolve();
      }

      if (inFlight !== null) {
        return inFlight;
      }

      const nextInFlight = input.runSnapshotRecovery(reason).finally(() => {
        if (inFlight === nextInFlight) {
          inFlight = null;
        }
      });
      inFlight = nextInFlight;
      return inFlight;
    },
  };
}

export function createOrchestrationSyncController(
  input: OrchestrationSyncInput,
): OrchestrationSyncController {
  const recovery = createOrchestrationRecoveryCoordinator();
  let replayRetryTracker: ReplayRetryTracker | null = null;
  const pendingDomainEvents: OrchestrationEvent[] = [];
  let flushPendingDomainEventsScheduled = false;
  let disposed = false;

  const flushPendingDomainEvents = () => {
    flushPendingDomainEventsScheduled = false;
    if (disposed || pendingDomainEvents.length === 0) {
      return;
    }

    const events = pendingDomainEvents.splice(0, pendingDomainEvents.length);
    const nextEvents = recovery.markEventBatchApplied(events);
    if (nextEvents.length === 0) {
      return;
    }
    input.applyEventBatch(nextEvents, input.environmentId);
  };

  const schedulePendingDomainEventFlush = () => {
    if (flushPendingDomainEventsScheduled) {
      return;
    }

    flushPendingDomainEventsScheduled = true;
    queueMicrotask(flushPendingDomainEvents);
  };

  const retryTransportRecoveryOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          disposed ||
          !isTransportConnectionErrorMessage(message) ||
          attempt >= MAX_RECOVERY_TRANSPORT_RETRIES - 1
        ) {
          throw error;
        }

        await new Promise<void>((resolve) => {
          setTimeout(resolve, RECOVERY_TRANSPORT_RETRY_DELAY_MS);
        });

        if (disposed) {
          throw error;
        }
      }
    }
  };

  const scheduleReplayRecovery = (reason: "sequence-gap" | "resubscribe") => {
    void runReplayRecovery(reason).catch(() => undefined);
  };

  const runReplayRecovery = async (reason: "sequence-gap" | "resubscribe"): Promise<void> => {
    if (!recovery.beginReplayRecovery(reason)) {
      return;
    }

    const fromSequenceExclusive = recovery.getState().latestSequence;
    try {
      const events = await retryTransportRecoveryOperation(() =>
        input.replayEvents({ fromSequenceExclusive }),
      );
      if (!disposed) {
        const nextEvents = recovery.markEventBatchApplied(events);
        if (nextEvents.length > 0) {
          input.applyEventBatch(nextEvents, input.environmentId);
        }
      }
    } catch {
      replayRetryTracker = null;
      recovery.failReplayRecovery();
      if (disposed) {
        return;
      }
      await snapshotBootstrap.ensureSnapshotRecovery("replay-failed");
      return;
    }

    if (disposed) {
      return;
    }

    const replayCompletion = recovery.completeReplayRecovery();
    const retryDecision = deriveReplayRetryDecision({
      previousTracker: replayRetryTracker,
      completion: replayCompletion,
      recoveryState: recovery.getState(),
      baseDelayMs: REPLAY_RECOVERY_RETRY_DELAY_MS,
      maxNoProgressRetries: MAX_NO_PROGRESS_REPLAY_RETRIES,
    });
    replayRetryTracker = retryDecision.tracker;

    if (retryDecision.shouldRetry) {
      if (retryDecision.delayMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, retryDecision.delayMs);
        });
        if (disposed) {
          return;
        }
      }
      scheduleReplayRecovery(reason);
    } else if (replayCompletion.shouldReplay && import.meta.env.MODE !== "test") {
      console.warn(
        "[orchestration-recovery]",
        "Stopping replay recovery after no-progress retries.",
        {
          environmentId: input.environmentId,
          state: recovery.getState(),
        },
      );
    }
  };

  const runSnapshotRecovery = async (
    reason: Extract<OrchestrationRecoveryReason, "bootstrap" | "replay-failed">,
  ): Promise<void> => {
    const started = recovery.beginSnapshotRecovery(reason);
    if (!started) {
      return;
    }

    try {
      const snapshot = await retryTransportRecoveryOperation(input.getSnapshot);
      if (!disposed) {
        input.syncSnapshot(snapshot, input.environmentId);
        if (recovery.completeSnapshotRecovery(snapshot.snapshotSequence)) {
          scheduleReplayRecovery("sequence-gap");
        }
      }
    } catch (error) {
      recovery.failSnapshotRecovery();
      throw error;
    }
  };

  const snapshotBootstrap = createSnapshotBootstrapController({
    isBootstrapped: () => recovery.getState().bootstrapped,
    runSnapshotRecovery,
  });

  return {
    ensureBootstrapped: () => snapshotBootstrap.ensureSnapshotRecovery("bootstrap"),
    handleDomainEvent: (event) => {
      const action = recovery.classifyDomainEvent(event.sequence);
      if (action === "apply") {
        pendingDomainEvents.push(event);
        schedulePendingDomainEventFlush();
        return;
      }
      if (action === "recover") {
        flushPendingDomainEvents();
        scheduleReplayRecovery("sequence-gap");
      }
    },
    handleResubscribe: () => {
      if (disposed) {
        return;
      }
      flushPendingDomainEvents();
      scheduleReplayRecovery("resubscribe");
    },
    dispose: () => {
      disposed = true;
      flushPendingDomainEventsScheduled = false;
      pendingDomainEvents.length = 0;
    },
  };
}
