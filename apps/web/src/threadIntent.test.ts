import { EventId, ThreadId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { deriveSidebarThreadIntent, deriveThreadIntent, hasUnseenCompletion } from "./threadIntent";
import { type Thread } from "./types";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1" as Thread["id"],
    environmentId: "environment-1" as Thread["environmentId"],
    codexThreadId: null,
    projectId: "project-1" as Thread["projectId"],
    title: "Thread",
    modelSelection: {
      provider: "codex",
      model: "gpt-5-codex",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-04-13T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-04-13T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

function makeActivity(
  overrides: Partial<OrchestrationThreadActivity> &
    Pick<OrchestrationThreadActivity, "id" | "kind">,
): OrchestrationThreadActivity {
  return {
    id: overrides.id,
    kind: overrides.kind,
    createdAt: "2026-04-13T00:00:00.000Z",
    summary: "Activity",
    tone: "info",
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    ...(overrides.summary ? { summary: overrides.summary } : {}),
    ...(overrides.tone ? { tone: overrides.tone } : {}),
    payload: overrides.payload ?? null,
    turnId: overrides.turnId ?? null,
  };
}

describe("deriveSidebarThreadIntent", () => {
  it("derives sidebar intent from thread state", () => {
    const thread = makeThread({
      messages: [
        {
          id: "assistant-1" as Thread["messages"][number]["id"],
          role: "assistant",
          text: "Earlier response",
          createdAt: "2026-04-13T00:00:01.000Z",
          completedAt: "2026-04-13T00:00:02.000Z",
          streaming: false,
        },
        {
          id: "user-1" as Thread["messages"][number]["id"],
          role: "user",
          text: "Need a plan",
          createdAt: "2026-04-13T00:00:03.000Z",
          streaming: false,
        },
        {
          id: "user-2" as Thread["messages"][number]["id"],
          role: "user",
          text: "And a summary",
          createdAt: "2026-04-13T00:00:05.000Z",
          streaming: false,
        },
      ],
      activities: [
        makeActivity({
          id: EventId.make("approval-requested"),
          kind: "approval.requested",
          createdAt: "2026-04-13T00:00:06.000Z",
          payload: {
            requestId: "approval-1",
            requestKind: "command",
            detail: "Run command?",
          },
        }),
        makeActivity({
          id: EventId.make("user-input-requested"),
          kind: "user-input.requested",
          createdAt: "2026-04-13T00:00:07.000Z",
          payload: {
            requestId: "input-1",
            questions: [
              {
                id: "change_scope",
                header: "Scope",
                question: "What should change?",
                options: [
                  {
                    label: "Sidebar only",
                    description: "Keep the change limited to the sidebar.",
                  },
                ],
                multiSelect: false,
              },
            ],
          },
        }),
      ],
      proposedPlans: [
        {
          id: "plan-1",
          turnId: TurnId.make("turn-1"),
          planMarkdown: "# Plan",
          implementedAt: null,
          implementationThreadId: null,
          createdAt: "2026-04-13T00:00:04.000Z",
          updatedAt: "2026-04-13T00:00:08.000Z",
        },
      ],
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:03.000Z",
        startedAt: "2026-04-13T00:00:03.000Z",
        completedAt: "2026-04-13T00:00:08.000Z",
        assistantMessageId: null,
      },
    });

    expect(deriveSidebarThreadIntent(thread)).toEqual({
      latestUserMessageAt: "2026-04-13T00:00:05.000Z",
      hasPendingApprovals: true,
      hasPendingUserInput: true,
      hasActionableProposedPlan: true,
      hasPlanReadyPrompt: false,
    });
  });

  it("does not mark implemented plans as actionable", () => {
    const thread = makeThread({
      proposedPlans: [
        {
          id: "plan-1",
          turnId: TurnId.make("turn-1"),
          planMarkdown: "# Plan",
          implementedAt: "2026-04-13T00:00:10.000Z",
          implementationThreadId: "thread-2" as Thread["id"],
          createdAt: "2026-04-13T00:00:04.000Z",
          updatedAt: "2026-04-13T00:00:08.000Z",
        },
      ],
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:03.000Z",
        startedAt: "2026-04-13T00:00:03.000Z",
        completedAt: "2026-04-13T00:00:08.000Z",
        assistantMessageId: null,
      },
    });

    expect(deriveSidebarThreadIntent(thread)).toMatchObject({
      hasActionableProposedPlan: false,
      hasPlanReadyPrompt: false,
    });
  });
});

describe("deriveThreadIntent", () => {
  it("derives active-thread facts from thread state", () => {
    const thread = makeThread({
      session: {
        provider: "codex",
        status: "ready",
        createdAt: "2026-04-13T00:00:00.000Z",
        orchestrationStatus: "ready",
        updatedAt: "2026-04-13T00:00:09.000Z",
      },
      messages: [
        {
          id: "user-1" as Thread["messages"][number]["id"],
          role: "user",
          text: "Need a plan",
          createdAt: "2026-04-13T00:00:03.000Z",
          streaming: false,
        },
      ],
      activities: [
        makeActivity({
          id: EventId.make("approval-requested"),
          kind: "approval.requested",
          createdAt: "2026-04-13T00:00:04.000Z",
          payload: {
            requestId: "approval-1",
            requestKind: "command",
            detail: "Run command?",
          },
        }),
        makeActivity({
          id: EventId.make("user-input-requested"),
          kind: "user-input.requested",
          createdAt: "2026-04-13T00:00:05.000Z",
          payload: {
            requestId: "input-1",
            questions: [
              {
                id: "change_scope",
                header: "Scope",
                question: "What should change?",
                options: [
                  {
                    label: "Sidebar only",
                    description: "Keep the change limited to the sidebar.",
                  },
                ],
                multiSelect: false,
              },
            ],
          },
        }),
        makeActivity({
          id: EventId.make("plan-updated"),
          kind: "turn.plan.updated",
          createdAt: "2026-04-13T00:00:06.000Z",
          turnId: TurnId.make("turn-1"),
          summary: "Checkpoint captured",
          payload: {
            explanation: "Refine the UI",
            plan: [{ step: "Implement intent boundary", status: "inProgress" }],
          },
        }),
        makeActivity({
          id: EventId.make("work-started"),
          kind: "tool.started",
          createdAt: "2026-04-13T00:00:06.500Z",
          turnId: TurnId.make("turn-1"),
          summary: "Tool call",
        }),
        makeActivity({
          id: EventId.make("work-completed"),
          kind: "tool.completed",
          createdAt: "2026-04-13T00:00:07.000Z",
          turnId: TurnId.make("turn-1"),
          summary: "Tool call complete",
          tone: "tool",
        }),
      ],
      proposedPlans: [
        {
          id: "plan-1",
          turnId: TurnId.make("turn-1"),
          planMarkdown: "# Plan",
          implementedAt: null,
          implementationThreadId: null,
          createdAt: "2026-04-13T00:00:04.500Z",
          updatedAt: "2026-04-13T00:00:08.000Z",
        },
      ],
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:03.000Z",
        startedAt: "2026-04-13T00:00:03.000Z",
        completedAt: "2026-04-13T00:00:08.000Z",
        assistantMessageId: null,
      },
    });

    expect(
      deriveThreadIntent({
        thread,
        localDispatchStartedAt: "2026-04-13T00:00:09.000Z",
      }),
    ).toEqual({
      phase: "ready",
      latestTurnSettled: true,
      activeWorkStartedAt: "2026-04-13T00:00:09.000Z",
      completionSummaryRange: {
        startedAt: "2026-04-13T00:00:03.000Z",
        completedAt: "2026-04-13T00:00:08.000Z",
      },
      pendingApprovals: [
        {
          requestId: "approval-1",
          requestKind: "command",
          createdAt: "2026-04-13T00:00:04.000Z",
          detail: "Run command?",
        },
      ],
      pendingUserInputs: [
        {
          requestId: "input-1",
          createdAt: "2026-04-13T00:00:05.000Z",
          questions: [
            {
              id: "change_scope",
              header: "Scope",
              question: "What should change?",
              options: [
                {
                  label: "Sidebar only",
                  description: "Keep the change limited to the sidebar.",
                },
              ],
              multiSelect: false,
            },
          ],
        },
      ],
      activePendingApproval: {
        requestId: "approval-1",
        requestKind: "command",
        createdAt: "2026-04-13T00:00:04.000Z",
        detail: "Run command?",
      },
      activePendingUserInput: {
        requestId: "input-1",
        createdAt: "2026-04-13T00:00:05.000Z",
        questions: [
          {
            id: "change_scope",
            header: "Scope",
            question: "What should change?",
            options: [
              {
                label: "Sidebar only",
                description: "Keep the change limited to the sidebar.",
              },
            ],
            multiSelect: false,
          },
        ],
      },
      activePlan: {
        createdAt: "2026-04-13T00:00:06.000Z",
        turnId: "turn-1",
        explanation: "Refine the UI",
        steps: [{ step: "Implement intent boundary", status: "inProgress" }],
      },
      activeProposedPlan: {
        id: "plan-1",
        createdAt: "2026-04-13T00:00:04.500Z",
        updatedAt: "2026-04-13T00:00:08.000Z",
        turnId: "turn-1",
        planMarkdown: "# Plan",
        implementedAt: null,
        implementationThreadId: null,
      },
      sidebarProposedPlan: {
        id: "plan-1",
        createdAt: "2026-04-13T00:00:04.500Z",
        updatedAt: "2026-04-13T00:00:08.000Z",
        turnId: "turn-1",
        planMarkdown: "# Plan",
        implementedAt: null,
        implementationThreadId: null,
      },
      hasActionableProposedPlan: true,
      hasPlanReadyPrompt: false,
      workLogEntries: [
        {
          id: "work-completed",
          createdAt: "2026-04-13T00:00:07.000Z",
          label: "Tool call complete",
          tone: "tool",
        },
      ],
    });
  });

  it("uses a source plan for the sidebar while the latest turn is unsettled", () => {
    const sourceThreadId = ThreadId.make("thread-source");
    const sourcePlan = {
      id: "plan-source",
      turnId: TurnId.make("turn-source"),
      planMarkdown: "# Source plan",
      implementedAt: "2026-04-13T00:00:04.000Z",
      implementationThreadId: ThreadId.make("thread-1"),
      createdAt: "2026-04-13T00:00:02.000Z",
      updatedAt: "2026-04-13T00:00:05.000Z",
    } as const;

    const thread = makeThread({
      session: {
        provider: "codex",
        status: "running",
        activeTurnId: TurnId.make("turn-1"),
        createdAt: "2026-04-13T00:00:00.000Z",
        orchestrationStatus: "running",
        updatedAt: "2026-04-13T00:00:09.000Z",
      },
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "running",
        requestedAt: "2026-04-13T00:00:03.000Z",
        startedAt: "2026-04-13T00:00:03.000Z",
        completedAt: null,
        assistantMessageId: null,
        sourceProposedPlan: {
          threadId: sourceThreadId,
          planId: sourcePlan.id,
        },
      },
      activities: [
        makeActivity({
          id: EventId.make("work-completed-unsettled"),
          kind: "tool.completed",
          createdAt: "2026-04-13T00:00:07.000Z",
          turnId: TurnId.make("turn-1"),
          summary: "Tool call complete",
          tone: "tool",
        }),
      ],
      proposedPlans: [
        {
          id: "plan-1",
          turnId: TurnId.make("turn-1"),
          planMarkdown: "# Active plan",
          implementedAt: null,
          implementationThreadId: null,
          createdAt: "2026-04-13T00:00:04.500Z",
          updatedAt: "2026-04-13T00:00:08.000Z",
        },
      ],
    });

    expect(
      deriveThreadIntent({
        thread,
        threadCatalog: [
          { id: thread.id, proposedPlans: thread.proposedPlans },
          { id: sourceThreadId, proposedPlans: [sourcePlan] },
        ],
        localDispatchStartedAt: "2026-04-13T00:00:09.000Z",
      }),
    ).toEqual({
      phase: "running",
      latestTurnSettled: false,
      activeWorkStartedAt: "2026-04-13T00:00:03.000Z",
      completionSummaryRange: null,
      pendingApprovals: [],
      pendingUserInputs: [],
      activePendingApproval: null,
      activePendingUserInput: null,
      activePlan: null,
      activeProposedPlan: null,
      sidebarProposedPlan: {
        id: "plan-source",
        createdAt: "2026-04-13T00:00:02.000Z",
        updatedAt: "2026-04-13T00:00:05.000Z",
        turnId: "turn-source",
        planMarkdown: "# Source plan",
        implementedAt: "2026-04-13T00:00:04.000Z",
        implementationThreadId: ThreadId.make("thread-1"),
      },
      hasActionableProposedPlan: false,
      hasPlanReadyPrompt: false,
      workLogEntries: [
        {
          id: "work-completed-unsettled",
          createdAt: "2026-04-13T00:00:07.000Z",
          label: "Tool call complete",
          tone: "tool",
        },
      ],
    });
  });

  it("marks a settled actionable plan in plan mode as ready for follow-up", () => {
    const thread = makeThread({
      interactionMode: "plan",
      session: {
        provider: "codex",
        status: "ready",
        createdAt: "2026-04-13T00:00:00.000Z",
        orchestrationStatus: "ready",
        updatedAt: "2026-04-13T00:00:09.000Z",
      },
      proposedPlans: [
        {
          id: "plan-1",
          turnId: TurnId.make("turn-1"),
          planMarkdown: "# Plan",
          implementedAt: null,
          implementationThreadId: null,
          createdAt: "2026-04-13T00:00:04.500Z",
          updatedAt: "2026-04-13T00:00:08.000Z",
        },
      ],
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:03.000Z",
        startedAt: "2026-04-13T00:00:03.000Z",
        completedAt: "2026-04-13T00:00:08.000Z",
        assistantMessageId: null,
      },
    });

    expect(deriveThreadIntent({ thread }).hasPlanReadyPrompt).toBe(true);
    expect(deriveSidebarThreadIntent(thread).hasPlanReadyPrompt).toBe(true);
  });

  it("omits completion summary range when no tool activity happened", () => {
    const thread = makeThread({
      session: {
        provider: "codex",
        status: "ready",
        createdAt: "2026-04-13T00:00:00.000Z",
        orchestrationStatus: "ready",
        updatedAt: "2026-04-13T00:00:09.000Z",
      },
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-04-13T00:00:03.000Z",
        startedAt: "2026-04-13T00:00:03.000Z",
        completedAt: "2026-04-13T00:00:08.000Z",
        assistantMessageId: null,
      },
    });

    expect(deriveThreadIntent({ thread }).completionSummaryRange).toBeNull();
  });
});

describe("hasUnseenCompletion", () => {
  it("returns true when a completed turn is newer than the last visit", () => {
    expect(
      hasUnseenCompletion({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-13T00:00:01.000Z",
          startedAt: "2026-04-13T00:00:01.000Z",
          completedAt: "2026-04-13T00:00:05.000Z",
          assistantMessageId: null,
        },
        lastVisitedAt: "2026-04-13T00:00:04.000Z",
      }),
    ).toBe(true);
  });

  it("returns false when the completion has already been seen", () => {
    expect(
      hasUnseenCompletion({
        latestTurn: {
          turnId: TurnId.make("turn-1"),
          state: "completed",
          requestedAt: "2026-04-13T00:00:01.000Z",
          startedAt: "2026-04-13T00:00:01.000Z",
          completedAt: "2026-04-13T00:00:05.000Z",
          assistantMessageId: null,
        },
        lastVisitedAt: "2026-04-13T00:00:05.000Z",
      }),
    ).toBe(false);
  });
});
