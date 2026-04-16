import { ThreadId, type OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import { Effect, Stream } from "effect";

import { createOrderedOrchestrationEventStream } from "./orderedEventStream";

const now = new Date().toISOString();
const threadId = ThreadId.make("thread-1");

function makeEvent(sequence: number): OrchestrationEvent {
  return {
    sequence,
    eventId: `event-${sequence}` as OrchestrationEvent["eventId"],
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
  } as OrchestrationEvent;
}

describe("createOrderedOrchestrationEventStream", () => {
  it("replays overlapping replay and live events in sequence once", async () => {
    const stream = await Effect.runPromise(
      createOrderedOrchestrationEventStream({
        fromSequenceExclusive: 1,
        replayStream: Stream.make(makeEvent(2), makeEvent(3)),
        liveStream: Stream.make(makeEvent(3), makeEvent(4)),
      }),
    );

    const events = await Effect.runPromise(Stream.runCollect(Stream.take(stream, 3)));

    expect(Array.from(events).map((event) => event.sequence)).toEqual([2, 3, 4]);
  });

  it("buffers higher live events until the missing replayed sequence arrives", async () => {
    const stream = await Effect.runPromise(
      createOrderedOrchestrationEventStream({
        fromSequenceExclusive: 1,
        replayStream: Stream.make(makeEvent(2)),
        liveStream: Stream.make(makeEvent(4), makeEvent(3)),
      }),
    );

    const events = await Effect.runPromise(Stream.runCollect(Stream.take(stream, 3)));

    expect(Array.from(events).map((event) => event.sequence)).toEqual([2, 3, 4]);
  });

  it("ignores stale duplicate events below the current frontier", async () => {
    const stream = await Effect.runPromise(
      createOrderedOrchestrationEventStream({
        fromSequenceExclusive: 2,
        replayStream: Stream.make(makeEvent(3), makeEvent(3)),
        liveStream: Stream.make(makeEvent(2), makeEvent(4)),
      }),
    );

    const events = await Effect.runPromise(Stream.runCollect(Stream.take(stream, 2)));

    expect(Array.from(events).map((event) => event.sequence)).toEqual([3, 4]);
  });
});
