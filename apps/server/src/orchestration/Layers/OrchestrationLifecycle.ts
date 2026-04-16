import { Effect, Layer, Scope, SynchronizedRef } from "effect";

import {
  OrchestrationLifecycle,
  type OrchestrationLifecycleShape,
} from "../Services/OrchestrationLifecycle.ts";
import { CheckpointReactor } from "../Services/CheckpointReactor.ts";
import { ProviderCommandReactor } from "../Services/ProviderCommandReactor.ts";
import { ProviderRuntimeIngestionService } from "../Services/ProviderRuntimeIngestion.ts";
import { CheckpointReactorLive } from "./CheckpointReactor.ts";
import { ProviderCommandReactorLive } from "./ProviderCommandReactor.ts";
import { ProviderRuntimeIngestionLive } from "./ProviderRuntimeIngestion.ts";
import { RuntimeReceiptBusLive } from "./RuntimeReceiptBus.ts";

interface LifecycleWorker {
  readonly name: string;
  readonly start: OrchestrationLifecycleShape["start"];
  readonly drain: OrchestrationLifecycleShape["drain"];
}

interface LifecycleState {
  readonly started: boolean;
}

const runWorkerStartPhase = (
  worker: LifecycleWorker,
  effect: Effect.Effect<void, never, Scope.Scope>,
) =>
  effect.pipe(
    Effect.annotateSpans({
      "orchestration.lifecycle.worker": worker.name,
      "orchestration.lifecycle.phase": "start",
    }),
    Effect.withSpan(`orchestration.lifecycle.start.${worker.name}`),
  );

const runWorkerDrainPhase = (worker: LifecycleWorker, effect: Effect.Effect<void>) =>
  effect.pipe(
    Effect.annotateSpans({
      "orchestration.lifecycle.worker": worker.name,
      "orchestration.lifecycle.phase": "drain",
    }),
    Effect.withSpan(`orchestration.lifecycle.drain.${worker.name}`),
  );

const startLifecycleWorkers = (workers: ReadonlyArray<LifecycleWorker>) =>
  Effect.forEach(workers, (worker) => runWorkerStartPhase(worker, worker.start()), {
    concurrency: 1,
    discard: true,
  }).pipe(Effect.asVoid);

const drainLifecycleWorkers = (workers: ReadonlyArray<LifecycleWorker>) =>
  Effect.forEach(workers, (worker) => runWorkerDrainPhase(worker, worker.drain), {
    concurrency: 1,
    discard: true,
  }).pipe(Effect.asVoid);

export const makeOrchestrationLifecycle = Effect.gen(function* () {
  const providerRuntimeIngestion = yield* ProviderRuntimeIngestionService;
  const providerCommandReactor = yield* ProviderCommandReactor;
  const checkpointReactor = yield* CheckpointReactor;
  const lifecycleStateRef = yield* SynchronizedRef.make<LifecycleState>({
    started: false,
  });
  const workers: ReadonlyArray<LifecycleWorker> = [
    {
      name: "provider-runtime-ingestion",
      start: providerRuntimeIngestion.start,
      drain: providerRuntimeIngestion.drain,
    },
    {
      name: "provider-command-reactor",
      start: providerCommandReactor.start,
      drain: providerCommandReactor.drain,
    },
    {
      name: "checkpoint-reactor",
      start: checkpointReactor.start,
      drain: checkpointReactor.drain,
    },
  ];

  const claimLifecycleStart = SynchronizedRef.modifyEffect(lifecycleStateRef, (state) =>
    Effect.succeed<[boolean, LifecycleState]>(
      state.started
        ? [false, state]
        : [
            true,
            {
              started: true,
            },
          ],
    ),
  );

  const start: OrchestrationLifecycleShape["start"] = () =>
    Effect.gen(function* () {
      const shouldStart = yield* claimLifecycleStart;
      if (!shouldStart) {
        return;
      }

      yield* Effect.addFinalizer(() =>
        SynchronizedRef.set(lifecycleStateRef, {
          started: false,
        }),
      );
      yield* startLifecycleWorkers(workers);
    }).pipe(Effect.withSpan("orchestration.lifecycle.start"));
  const drain = drainLifecycleWorkers(workers);

  return {
    start,
    drain,
  } satisfies OrchestrationLifecycleShape;
});

export const OrchestrationLifecycleLive = Layer.effect(
  OrchestrationLifecycle,
  makeOrchestrationLifecycle,
).pipe(
  Layer.provideMerge(ProviderRuntimeIngestionLive),
  Layer.provideMerge(ProviderCommandReactorLive),
  Layer.provideMerge(CheckpointReactorLive.pipe(Layer.provideMerge(RuntimeReceiptBusLive))),
);
