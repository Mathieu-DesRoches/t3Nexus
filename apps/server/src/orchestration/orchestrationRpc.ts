import {
  type OrchestrationEvent,
  OrchestrationGetSnapshotError,
  OrchestrationReplayEventsError,
} from "@t3tools/contracts";
import { Effect, Stream } from "effect";
import { clamp } from "effect/Number";

import { createOrderedOrchestrationEventStream } from "./orderedEventStream";
import type { OrchestrationEngineShape } from "./Services/OrchestrationEngine";
import type { ProjectionSnapshotQueryShape } from "./Services/ProjectionSnapshotQuery";

export interface OrchestrationRpcDependencies {
  readonly projectionSnapshotQuery: ProjectionSnapshotQueryShape;
  readonly orchestrationEngine: OrchestrationEngineShape;
  readonly enrichProjectEvent: (
    event: OrchestrationEvent,
  ) => Effect.Effect<OrchestrationEvent, never>;
  readonly enrichOrchestrationEvents: (
    events: ReadonlyArray<OrchestrationEvent>,
  ) => Effect.Effect<Array<OrchestrationEvent>, never>;
}

export function getOrchestrationSnapshotRpc(input: OrchestrationRpcDependencies) {
  return input.projectionSnapshotQuery.getSnapshot().pipe(
    Effect.mapError(
      (cause) =>
        new OrchestrationGetSnapshotError({
          message: "Failed to load orchestration snapshot",
          cause,
        }),
    ),
  );
}

export function replayOrchestrationEventsRpc(
  input: OrchestrationRpcDependencies,
  fromSequenceExclusive: number,
) {
  return Stream.runCollect(
    input.orchestrationEngine.readEvents(
      clamp(fromSequenceExclusive, {
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 0,
      }),
    ),
  ).pipe(
    Effect.map((events) => Array.from(events)),
    Effect.flatMap(input.enrichOrchestrationEvents),
    Effect.mapError(
      (cause) =>
        new OrchestrationReplayEventsError({
          message: "Failed to replay orchestration events",
          cause,
        }),
    ),
  );
}

export function subscribeOrchestrationDomainEventsRpc(input: OrchestrationRpcDependencies) {
  return Effect.gen(function* () {
    const snapshot = yield* input.orchestrationEngine.getReadModel();
    const fromSequenceExclusive = snapshot.snapshotSequence;
    const replayEvents: Array<OrchestrationEvent> = yield* Stream.runCollect(
      input.orchestrationEngine.readEvents(fromSequenceExclusive),
    ).pipe(
      Effect.map((events) => Array.from(events)),
      Effect.flatMap(input.enrichOrchestrationEvents),
      Effect.catch(() => Effect.succeed([] as Array<OrchestrationEvent>)),
    );

    return yield* createOrderedOrchestrationEventStream({
      fromSequenceExclusive,
      replayStream: Stream.fromIterable(replayEvents),
      liveStream: input.orchestrationEngine.streamDomainEvents.pipe(
        Stream.mapEffect(input.enrichProjectEvent),
      ),
    });
  });
}
