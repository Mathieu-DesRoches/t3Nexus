import {
  EventId,
  ProjectId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import { Effect, Option, Stream } from "effect";

import {
  getOrchestrationSnapshotRpc,
  replayOrchestrationEventsRpc,
  subscribeOrchestrationDomainEventsRpc,
  type OrchestrationRpcDependencies,
} from "./orchestrationRpc";

const now = new Date().toISOString();
const threadId = ThreadId.make("thread-1");
const projectId = ProjectId.make("project-1");

function makeReadModel(snapshotSequence = 0): OrchestrationReadModel {
  return {
    snapshotSequence,
    updatedAt: now,
    projects: [
      {
        id: projectId,
        title: "Project",
        workspaceRoot: "/tmp/project",
        repositoryIdentity: null,
        defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
        scripts: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
    threads: [],
  };
}

function makeEvent(sequence: number): OrchestrationEvent {
  return {
    sequence,
    eventId: EventId.make(`event-${sequence}`),
    aggregateKind: "thread",
    aggregateId: threadId,
    occurredAt: now,
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    type: "thread.reverted",
    payload: {
      threadId,
      turnCount: sequence,
    },
  };
}

function makeDependencies(input?: {
  readonly snapshot?: OrchestrationReadModel;
  readonly readEvents?: (fromSequenceExclusive: number) => Stream.Stream<OrchestrationEvent>;
  readonly streamDomainEvents?: Stream.Stream<OrchestrationEvent>;
}): OrchestrationRpcDependencies {
  return {
    projectionSnapshotQuery: {
      getSnapshot: () => Effect.succeed(input?.snapshot ?? makeReadModel(1)),
      getCounts: () => Effect.succeed({ projectCount: 1, threadCount: 0 }),
      getActiveProjectByWorkspaceRoot: () => Effect.succeed(Option.none()),
      getFirstActiveThreadIdByProjectId: () => Effect.succeed(Option.none()),
      getThreadCheckpointContext: () => Effect.succeed(Option.none()),
    },
    orchestrationEngine: {
      getReadModel: () => Effect.succeed(input?.snapshot ?? makeReadModel(1)),
      readEvents:
        input?.readEvents ??
        ((fromSequenceExclusive) => Stream.make(makeEvent(fromSequenceExclusive + 1))),
      dispatch: () => Effect.succeed({ sequence: 1 }),
      streamDomainEvents: input?.streamDomainEvents ?? Stream.empty,
    },
    enrichProjectEvent: (event) => Effect.succeed(event),
    enrichOrchestrationEvents: (events) => Effect.succeed([...events]),
  };
}

describe("orchestrationRpc", () => {
  it("loads the orchestration snapshot through a dedicated RPC helper", async () => {
    const snapshot = makeReadModel(3);

    const result = await Effect.runPromise(
      getOrchestrationSnapshotRpc(makeDependencies({ snapshot })),
    );

    expect(result.snapshotSequence).toBe(3);
  });

  it("replays orchestration events from a clamped cursor", async () => {
    let requestedCursor: number | null = null;
    const result = await Effect.runPromise(
      replayOrchestrationEventsRpc(
        makeDependencies({
          readEvents: (fromSequenceExclusive) => {
            requestedCursor = fromSequenceExclusive;
            return Stream.make(makeEvent(1));
          },
        }),
        -5,
      ),
    );

    expect(requestedCursor).toBe(0);
    expect(result.map((event) => event.sequence)).toEqual([1]);
  });

  it("subscribes with replay/live overlap resilience through the helper", async () => {
    const stream = await Effect.runPromise(
      subscribeOrchestrationDomainEventsRpc(
        makeDependencies({
          snapshot: makeReadModel(1),
          readEvents: () => Stream.make(makeEvent(2), makeEvent(3)),
          streamDomainEvents: Stream.make(makeEvent(3), makeEvent(4)),
        }),
      ),
    );

    const events = await Effect.runPromise(Stream.runCollect(Stream.take(stream, 3)));

    expect(Array.from(events).map((event) => event.sequence)).toEqual([2, 3, 4]);
  });
});
