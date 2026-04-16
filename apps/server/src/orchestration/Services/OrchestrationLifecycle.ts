/**
 * OrchestrationLifecycle - Composite orchestration lifecycle service interface.
 *
 * Owns startup of orchestration-side runtime workers that translate domain and
 * provider runtime events into downstream side effects. This is the canonical
 * lifecycle boundary for server startup and boundary tests.
 *
 * @module OrchestrationLifecycle
 */
import { Context } from "effect";
import type { Effect, Scope } from "effect";

/**
 * OrchestrationLifecycleShape - Service API for orchestration lifecycle.
 */
export interface OrchestrationLifecycleShape {
  /**
   * Start orchestration lifecycle workers for provider/runtime/checkpoint
   * flows.
   *
   * The returned effect must be run in a scope so all worker fibers can be
   * finalized on shutdown.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when all lifecycle worker queues are empty and idle.
   *
   * Intended for tests and harnesses so they can wait on the lifecycle
   * boundary instead of individual inner reactors.
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * OrchestrationLifecycle - Service tag for orchestration lifecycle
 * coordination.
 */
export class OrchestrationLifecycle extends Context.Service<
  OrchestrationLifecycle,
  OrchestrationLifecycleShape
>()("t3/orchestration/Services/OrchestrationLifecycle") {}
