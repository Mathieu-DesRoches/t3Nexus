import type { OrchestrationEvent } from "@t3tools/contracts";
import { Effect, Ref, Stream } from "effect";

interface OrderedEventStreamInput {
  readonly fromSequenceExclusive: number;
  readonly replayStream: Stream.Stream<OrchestrationEvent>;
  readonly liveStream: Stream.Stream<OrchestrationEvent>;
}

type SequenceState = {
  readonly nextSequence: number;
  readonly pendingBySequence: Map<number, OrchestrationEvent>;
};

export function createOrderedOrchestrationEventStream(
  input: OrderedEventStreamInput,
): Effect.Effect<Stream.Stream<OrchestrationEvent>> {
  return Effect.gen(function* () {
    const state = yield* Ref.make<SequenceState>({
      nextSequence: input.fromSequenceExclusive + 1,
      pendingBySequence: new Map<number, OrchestrationEvent>(),
    });

    return Stream.merge(input.replayStream, input.liveStream).pipe(
      Stream.mapEffect((event) =>
        Ref.modify(
          state,
          ({ nextSequence, pendingBySequence }): [Array<OrchestrationEvent>, SequenceState] => {
            if (event.sequence < nextSequence || pendingBySequence.has(event.sequence)) {
              return [[], { nextSequence, pendingBySequence }];
            }

            const updatedPending = new Map(pendingBySequence);
            updatedPending.set(event.sequence, event);

            const emit: Array<OrchestrationEvent> = [];
            let expected = nextSequence;
            for (;;) {
              const expectedEvent = updatedPending.get(expected);
              if (!expectedEvent) {
                break;
              }
              emit.push(expectedEvent);
              updatedPending.delete(expected);
              expected += 1;
            }

            return [emit, { nextSequence: expected, pendingBySequence: updatedPending }];
          },
        ),
      ),
      Stream.flatMap((events) => Stream.fromIterable(events)),
    );
  });
}
