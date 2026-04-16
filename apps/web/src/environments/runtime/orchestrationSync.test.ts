import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import { createOrchestrationSyncController } from "./orchestrationSync";

function createTestController(options?: {
  readonly getSnapshot?: () => Promise<{ readonly snapshotSequence: number }>;
  readonly replayEvents?: () => Promise<ReadonlyArray<any>>;
}) {
  const environmentId = EnvironmentId.make("env-1");
  const getSnapshot = vi.fn(
    options?.getSnapshot ??
      (async () =>
        ({
          snapshotSequence: 1,
          projects: [],
          threads: [],
        }) as any),
  );
  const replayEvents = vi.fn(options?.replayEvents ?? (async () => []));
  const syncSnapshot = vi.fn();
  const applyEventBatch = vi.fn();

  const controller = createOrchestrationSyncController({
    environmentId,
    getSnapshot,
    replayEvents: ({ fromSequenceExclusive }) => {
      void fromSequenceExclusive;
      return replayEvents();
    },
    syncSnapshot,
    applyEventBatch,
  });

  return {
    controller,
    environmentId,
    getSnapshot,
    replayEvents,
    syncSnapshot,
    applyEventBatch,
  };
}

describe("createOrchestrationSyncController", () => {
  it("bootstraps a snapshot on demand", async () => {
    const { controller, environmentId, getSnapshot, syncSnapshot } = createTestController();

    await controller.ensureBootstrapped();

    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(syncSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotSequence: 1 }),
      environmentId,
    );
  });

  it("deduplicates concurrent bootstrap requests", async () => {
    let resolveSnapshot!: (snapshot: any) => void;
    const snapshotPromise = new Promise<any>((resolve) => {
      resolveSnapshot = resolve;
    });
    const { controller, getSnapshot } = createTestController({
      getSnapshot: () => snapshotPromise,
    });

    const first = controller.ensureBootstrapped();
    const second = controller.ensureBootstrapped();

    expect(getSnapshot).toHaveBeenCalledTimes(1);

    resolveSnapshot({
      snapshotSequence: 1,
      projects: [],
      threads: [],
    });

    await Promise.all([first, second]);
  });

  it("retries replay recovery after transport disconnects during resubscribe", async () => {
    let replayAttempts = 0;
    const { controller, environmentId, replayEvents, applyEventBatch } = createTestController({
      replayEvents: async () => {
        replayAttempts += 1;
        if (replayAttempts === 1) {
          throw new Error("SocketCloseError: 1006");
        }

        return [
          {
            sequence: 2,
            type: "thread.created",
            payload: {},
          },
        ];
      },
    });

    await controller.ensureBootstrapped();
    controller.handleResubscribe();

    await vi.waitFor(() => {
      expect(replayEvents).toHaveBeenCalledTimes(2);
      expect(applyEventBatch).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            sequence: 2,
          }),
        ],
        environmentId,
      );
    });
  });

  it("swallows replay recovery failures triggered by resubscribe", async () => {
    const snapshotError = new Error("snapshot failed");
    let snapshotCalls = 0;
    const { controller } = createTestController({
      getSnapshot: async () => {
        snapshotCalls += 1;
        if (snapshotCalls === 1) {
          return {
            snapshotSequence: 1,
            projects: [],
            threads: [],
          } as any;
        }

        throw snapshotError;
      },
      replayEvents: async () => {
        throw new Error("SocketCloseError: 1006");
      },
    });

    await controller.ensureBootstrapped();

    const onUnhandledRejection = vi.fn();
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      controller.handleResubscribe();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }

    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });
});
