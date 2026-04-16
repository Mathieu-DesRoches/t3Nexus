import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { CheckpointReactor } from "../Services/CheckpointReactor.ts";
import { OrchestrationLifecycle } from "../Services/OrchestrationLifecycle.ts";
import { ProviderCommandReactor } from "../Services/ProviderCommandReactor.ts";
import { ProviderRuntimeIngestionService } from "../Services/ProviderRuntimeIngestion.ts";
import { makeOrchestrationLifecycle } from "./OrchestrationLifecycle.ts";

describe("OrchestrationLifecycle", () => {
  let runtime: ManagedRuntime.ManagedRuntime<OrchestrationLifecycle, never> | null = null;

  afterEach(async () => {
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
  });

  it("starts provider ingestion, provider command, and checkpoint reactors", async () => {
    const started: string[] = [];

    runtime = ManagedRuntime.make(
      Layer.effect(OrchestrationLifecycle, makeOrchestrationLifecycle).pipe(
        Layer.provideMerge(
          Layer.succeed(ProviderRuntimeIngestionService, {
            start: () => {
              started.push("provider-runtime-ingestion");
              return Effect.void;
            },
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(ProviderCommandReactor, {
            start: () => {
              started.push("provider-command-reactor");
              return Effect.void;
            },
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(CheckpointReactor, {
            start: () => {
              started.push("checkpoint-reactor");
              return Effect.void;
            },
            drain: Effect.void,
          }),
        ),
      ),
    );

    const lifecycle = await runtime.runPromise(Effect.service(OrchestrationLifecycle));
    const scope = await Effect.runPromise(Scope.make("sequential"));
    await Effect.runPromise(lifecycle.start().pipe(Scope.provide(scope)));

    expect(started).toEqual([
      "provider-runtime-ingestion",
      "provider-command-reactor",
      "checkpoint-reactor",
    ]);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("drains the inner lifecycle workers through one boundary", async () => {
    const drained: string[] = [];

    runtime = ManagedRuntime.make(
      Layer.effect(OrchestrationLifecycle, makeOrchestrationLifecycle).pipe(
        Layer.provideMerge(
          Layer.succeed(ProviderRuntimeIngestionService, {
            start: () => Effect.void,
            drain: Effect.sync(() => {
              drained.push("provider-runtime-ingestion");
            }),
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(ProviderCommandReactor, {
            start: () => Effect.void,
            drain: Effect.sync(() => {
              drained.push("provider-command-reactor");
            }),
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(CheckpointReactor, {
            start: () => Effect.void,
            drain: Effect.sync(() => {
              drained.push("checkpoint-reactor");
            }),
          }),
        ),
      ),
    );

    const lifecycle = await runtime.runPromise(Effect.service(OrchestrationLifecycle));
    await runtime.runPromise(lifecycle.drain);

    expect(drained).toEqual([
      "provider-runtime-ingestion",
      "provider-command-reactor",
      "checkpoint-reactor",
    ]);
  });

  it("drains workers in the same deterministic order they are started", async () => {
    const phases: string[] = [];

    runtime = ManagedRuntime.make(
      Layer.effect(OrchestrationLifecycle, makeOrchestrationLifecycle).pipe(
        Layer.provideMerge(
          Layer.succeed(ProviderRuntimeIngestionService, {
            start: () =>
              Effect.sync(() => {
                phases.push("start:provider-runtime-ingestion");
              }),
            drain: Effect.sync(() => {
              phases.push("drain:provider-runtime-ingestion");
            }),
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(ProviderCommandReactor, {
            start: () =>
              Effect.sync(() => {
                phases.push("start:provider-command-reactor");
              }),
            drain: Effect.sync(() => {
              phases.push("drain:provider-command-reactor");
            }),
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(CheckpointReactor, {
            start: () =>
              Effect.sync(() => {
                phases.push("start:checkpoint-reactor");
              }),
            drain: Effect.sync(() => {
              phases.push("drain:checkpoint-reactor");
            }),
          }),
        ),
      ),
    );

    const lifecycle = await runtime.runPromise(Effect.service(OrchestrationLifecycle));
    const scope = await Effect.runPromise(Scope.make("sequential"));
    await Effect.runPromise(lifecycle.start().pipe(Scope.provide(scope)));
    await runtime.runPromise(lifecycle.drain);

    expect(phases).toEqual([
      "start:provider-runtime-ingestion",
      "start:provider-command-reactor",
      "start:checkpoint-reactor",
      "drain:provider-runtime-ingestion",
      "drain:provider-command-reactor",
      "drain:checkpoint-reactor",
    ]);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("does not restart workers while the lifecycle scope is still active", async () => {
    const started: string[] = [];

    runtime = ManagedRuntime.make(
      Layer.effect(OrchestrationLifecycle, makeOrchestrationLifecycle).pipe(
        Layer.provideMerge(
          Layer.succeed(ProviderRuntimeIngestionService, {
            start: () =>
              Effect.sync(() => {
                started.push("provider-runtime-ingestion");
              }),
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(ProviderCommandReactor, {
            start: () =>
              Effect.sync(() => {
                started.push("provider-command-reactor");
              }),
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(CheckpointReactor, {
            start: () =>
              Effect.sync(() => {
                started.push("checkpoint-reactor");
              }),
            drain: Effect.void,
          }),
        ),
      ),
    );

    const lifecycle = await runtime.runPromise(Effect.service(OrchestrationLifecycle));
    const scope = await Effect.runPromise(Scope.make("sequential"));

    await Effect.runPromise(lifecycle.start().pipe(Scope.provide(scope)));
    await Effect.runPromise(lifecycle.start().pipe(Scope.provide(scope)));

    expect(started).toEqual([
      "provider-runtime-ingestion",
      "provider-command-reactor",
      "checkpoint-reactor",
    ]);

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("allows restarting workers after the lifecycle scope closes", async () => {
    const started: string[] = [];

    runtime = ManagedRuntime.make(
      Layer.effect(OrchestrationLifecycle, makeOrchestrationLifecycle).pipe(
        Layer.provideMerge(
          Layer.succeed(ProviderRuntimeIngestionService, {
            start: () =>
              Effect.sync(() => {
                started.push("provider-runtime-ingestion");
              }),
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(ProviderCommandReactor, {
            start: () =>
              Effect.sync(() => {
                started.push("provider-command-reactor");
              }),
            drain: Effect.void,
          }),
        ),
        Layer.provideMerge(
          Layer.succeed(CheckpointReactor, {
            start: () =>
              Effect.sync(() => {
                started.push("checkpoint-reactor");
              }),
            drain: Effect.void,
          }),
        ),
      ),
    );

    const lifecycle = await runtime.runPromise(Effect.service(OrchestrationLifecycle));
    const firstScope = await Effect.runPromise(Scope.make("sequential"));
    const secondScope = await Effect.runPromise(Scope.make("sequential"));

    await Effect.runPromise(lifecycle.start().pipe(Scope.provide(firstScope)));
    await Effect.runPromise(Scope.close(firstScope, Exit.void));
    await Effect.runPromise(lifecycle.start().pipe(Scope.provide(secondScope)));

    expect(started).toEqual([
      "provider-runtime-ingestion",
      "provider-command-reactor",
      "checkpoint-reactor",
      "provider-runtime-ingestion",
      "provider-command-reactor",
      "checkpoint-reactor",
    ]);

    await Effect.runPromise(Scope.close(secondScope, Exit.void));
  });
});
