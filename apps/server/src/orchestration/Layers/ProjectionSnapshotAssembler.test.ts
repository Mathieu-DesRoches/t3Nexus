import {
  CheckpointRef,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
  TurnId,
  type OrchestrationProject,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { ORCHESTRATION_PROJECTOR_NAMES } from "./ProjectionPipeline.ts";
import { assembleProjectionSnapshot } from "./ProjectionSnapshotAssembler.ts";

const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asTurnId = (value: string): TurnId => TurnId.make(value);
const asMessageId = (value: string): MessageId => MessageId.make(value);
const asCheckpointRef = (value: string): CheckpointRef => CheckpointRef.make(value);
const asEventId = (value: string): EventId => EventId.make(value);

describe("assembleProjectionSnapshot", () => {
  it("assembles grouped thread state into a read-model snapshot", () => {
    const projectId = asProjectId("project-1");
    const threadId = asThreadId("thread-1");
    const repositoryIdentities = new Map<
      OrchestrationProject["id"],
      OrchestrationProject["repositoryIdentity"]
    >([[projectId, null]]);

    const snapshot = assembleProjectionSnapshot({
      projectRows: [
        {
          projectId,
          title: "Project 1",
          workspaceRoot: "/tmp/project-1",
          defaultModelSelection: {
            provider: "codex",
            model: "gpt-5-codex",
          },
          scripts: [],
          createdAt: "2026-02-24T00:00:00.000Z",
          updatedAt: "2026-02-24T00:00:01.000Z",
          deletedAt: null,
        },
      ],
      threadRows: [
        {
          threadId,
          projectId,
          title: "Thread 1",
          modelSelection: {
            provider: "codex",
            model: "gpt-5-codex",
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: "2026-02-24T00:00:02.000Z",
          updatedAt: "2026-02-24T00:00:03.000Z",
          archivedAt: null,
          deletedAt: null,
        },
      ],
      messageRows: [
        {
          messageId: asMessageId("message-1"),
          threadId,
          turnId: asTurnId("turn-1"),
          role: "assistant",
          text: "hello from projection",
          attachments: null,
          isStreaming: 0,
          createdAt: "2026-02-24T00:00:04.000Z",
          updatedAt: "2026-02-24T00:00:05.000Z",
        },
      ],
      proposedPlanRows: [
        {
          planId: "plan-1",
          threadId,
          turnId: asTurnId("turn-1"),
          planMarkdown: "# Ship it",
          implementedAt: "2026-02-24T00:00:05.500Z",
          implementationThreadId: asThreadId("thread-2"),
          createdAt: "2026-02-24T00:00:05.000Z",
          updatedAt: "2026-02-24T00:00:05.500Z",
        },
      ],
      activityRows: [
        {
          activityId: asEventId("activity-1"),
          threadId,
          turnId: asTurnId("turn-1"),
          tone: "info",
          kind: "runtime.note",
          summary: "provider started",
          payload: { stage: "start" },
          sequence: null,
          createdAt: "2026-02-24T00:00:06.000Z",
        },
      ],
      sessionRows: [
        {
          threadId,
          status: "running",
          providerName: "codex",
          runtimeMode: "approval-required",
          activeTurnId: asTurnId("turn-1"),
          lastError: null,
          updatedAt: "2026-02-24T00:00:07.000Z",
        },
      ],
      checkpointRows: [
        {
          threadId,
          turnId: asTurnId("turn-1"),
          checkpointTurnCount: 1,
          checkpointRef: asCheckpointRef("checkpoint-1"),
          status: "ready",
          files: [],
          assistantMessageId: asMessageId("message-1"),
          completedAt: "2026-02-24T00:00:08.000Z",
        },
      ],
      latestTurnRows: [
        {
          threadId,
          turnId: asTurnId("turn-1"),
          state: "completed",
          requestedAt: "2026-02-24T00:00:08.000Z",
          startedAt: "2026-02-24T00:00:08.000Z",
          completedAt: "2026-02-24T00:00:08.000Z",
          assistantMessageId: asMessageId("message-1"),
          sourceProposedPlanThreadId: threadId,
          sourceProposedPlanId: "plan-1",
        },
      ],
      stateRows: Object.values(ORCHESTRATION_PROJECTOR_NAMES).map((projector, index) => ({
        projector,
        lastAppliedSequence: 5 + index,
        updatedAt: "2026-02-24T00:00:09.000Z",
      })),
      repositoryIdentities,
    });

    expect(snapshot.snapshotSequence).toBe(5);
    expect(snapshot.updatedAt).toBe("2026-02-24T00:00:09.000Z");
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.threads).toEqual([
      expect.objectContaining({
        id: threadId,
        latestTurn: expect.objectContaining({
          turnId: asTurnId("turn-1"),
          state: "completed",
          sourceProposedPlan: {
            threadId,
            planId: "plan-1",
          },
        }),
        messages: [expect.objectContaining({ id: asMessageId("message-1") })],
        proposedPlans: [expect.objectContaining({ id: "plan-1" })],
        activities: [expect.objectContaining({ id: "activity-1" })],
        checkpoints: [expect.objectContaining({ checkpointRef: asCheckpointRef("checkpoint-1") })],
        session: expect.objectContaining({
          providerName: "codex",
          runtimeMode: "approval-required",
        }),
      }),
    ]);
  });

  it("falls back to sequence 0 when required projector state is missing", () => {
    const snapshot = assembleProjectionSnapshot({
      projectRows: [],
      threadRows: [],
      messageRows: [],
      proposedPlanRows: [],
      activityRows: [],
      sessionRows: [],
      checkpointRows: [],
      latestTurnRows: [],
      stateRows: [
        {
          projector: ORCHESTRATION_PROJECTOR_NAMES.projects,
          lastAppliedSequence: 7,
          updatedAt: "2026-02-24T00:00:09.000Z",
        },
      ],
      repositoryIdentities: new Map(),
    });

    expect(snapshot.snapshotSequence).toBe(0);
    expect(snapshot.updatedAt).toBe("2026-02-24T00:00:09.000Z");
  });
});
