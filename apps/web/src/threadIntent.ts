import {
  deriveActivePlanState,
  deriveActiveWorkStartedAt,
  derivePendingApprovals,
  derivePendingUserInputs,
  derivePhase,
  deriveWorkLogEntries,
  findLatestProposedPlan,
  findSidebarProposedPlan,
  hasActionableProposedPlan,
  hasToolActivityForTurn,
  isLatestTurnSettled,
} from "./session-logic";
import type {
  ActivePlanState,
  LatestProposedPlanState,
  PendingApproval,
  PendingUserInput,
  WorkLogEntry,
} from "./session-logic";
import type { ChatMessage, SessionPhase, Thread } from "./types";

export interface SidebarThreadIntent {
  latestUserMessageAt: string | null;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
  hasActionableProposedPlan: boolean;
  hasPlanReadyPrompt: boolean;
}

export interface CompletionVisibilityInput {
  latestTurn: Pick<Thread, "latestTurn">["latestTurn"];
  lastVisitedAt?: string | null | undefined;
}

export interface ThreadIntentInput {
  thread: Pick<
    Thread,
    | "id"
    | "session"
    | "latestTurn"
    | "activities"
    | "proposedPlans"
    | "messages"
    | "interactionMode"
  >;
  threadCatalog?: ReadonlyArray<Pick<Thread, "id" | "proposedPlans">>;
  localDispatchStartedAt?: string | null;
}

export interface ThreadIntent {
  phase: SessionPhase;
  latestTurnSettled: boolean;
  activeWorkStartedAt: string | null;
  completionSummaryRange: { startedAt: string; completedAt: string } | null;
  pendingApprovals: ReadonlyArray<PendingApproval>;
  pendingUserInputs: ReadonlyArray<PendingUserInput>;
  activePendingApproval: PendingApproval | null;
  activePendingUserInput: PendingUserInput | null;
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  sidebarProposedPlan: LatestProposedPlanState | null;
  hasActionableProposedPlan: boolean;
  hasPlanReadyPrompt: boolean;
  workLogEntries: ReadonlyArray<WorkLogEntry>;
}

type SidebarThreadIntentInput = Pick<
  Thread,
  "messages" | "activities" | "proposedPlans" | "latestTurn" | "interactionMode" | "session"
>;

function hasPlanReadyPrompt(input: {
  hasPendingUserInput: boolean;
  interactionMode: Thread["interactionMode"];
  latestTurn: Thread["latestTurn"];
  session: Thread["session"];
  hasActionableProposedPlan: boolean;
}): boolean {
  return (
    !input.hasPendingUserInput &&
    input.interactionMode === "plan" &&
    isLatestTurnSettled(input.latestTurn, input.session) &&
    input.hasActionableProposedPlan
  );
}

function getLatestUserMessageAt(messages: ReadonlyArray<ChatMessage>): string | null {
  let latestUserMessageAt: string | null = null;
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    if (latestUserMessageAt === null || message.createdAt > latestUserMessageAt) {
      latestUserMessageAt = message.createdAt;
    }
  }
  return latestUserMessageAt;
}

export function hasUnseenCompletion(input: CompletionVisibilityInput): boolean {
  if (!input.latestTurn?.completedAt) return false;
  const completedAt = Date.parse(input.latestTurn.completedAt);
  if (Number.isNaN(completedAt)) return false;
  if (!input.lastVisitedAt) return true;

  const lastVisitedAt = Date.parse(input.lastVisitedAt);
  if (Number.isNaN(lastVisitedAt)) return true;
  return completedAt > lastVisitedAt;
}

export function deriveSidebarThreadIntent(thread: SidebarThreadIntentInput): SidebarThreadIntent {
  const hasPendingUserInput = derivePendingUserInputs(thread.activities).length > 0;
  const actionableProposedPlan = hasActionableProposedPlan(
    findLatestProposedPlan(thread.proposedPlans, thread.latestTurn?.turnId ?? null),
  );

  return {
    latestUserMessageAt: getLatestUserMessageAt(thread.messages),
    hasPendingApprovals: derivePendingApprovals(thread.activities).length > 0,
    hasPendingUserInput,
    hasActionableProposedPlan: actionableProposedPlan,
    hasPlanReadyPrompt: hasPlanReadyPrompt({
      hasPendingUserInput,
      interactionMode: thread.interactionMode,
      latestTurn: thread.latestTurn,
      session: thread.session,
      hasActionableProposedPlan: actionableProposedPlan,
    }),
  };
}

export function deriveThreadIntent(input: ThreadIntentInput): ThreadIntent {
  const latestTurnId = input.thread.latestTurn?.turnId ?? undefined;
  const latestTurnSettled = isLatestTurnSettled(input.thread.latestTurn, input.thread.session);
  const latestTurnHasToolActivity = hasToolActivityForTurn(input.thread.activities, latestTurnId);
  const pendingApprovals = derivePendingApprovals(input.thread.activities);
  const pendingUserInputs = derivePendingUserInputs(input.thread.activities);
  const activeProposedPlan = latestTurnSettled
    ? findLatestProposedPlan(input.thread.proposedPlans, latestTurnId ?? null)
    : null;
  const sidebarProposedPlan = findSidebarProposedPlan({
    threads: input.threadCatalog ?? [input.thread],
    latestTurn: input.thread.latestTurn,
    latestTurnSettled,
    threadId: input.thread.id,
  });
  const workLogEntries = deriveWorkLogEntries(input.thread.activities, latestTurnId);

  return {
    phase: derivePhase(input.thread.session),
    latestTurnSettled,
    activeWorkStartedAt: deriveActiveWorkStartedAt(
      input.thread.latestTurn,
      input.thread.session,
      input.localDispatchStartedAt ?? null,
    ),
    completionSummaryRange:
      latestTurnSettled &&
      latestTurnHasToolActivity &&
      input.thread.latestTurn?.startedAt &&
      input.thread.latestTurn.completedAt
        ? {
            startedAt: input.thread.latestTurn.startedAt,
            completedAt: input.thread.latestTurn.completedAt,
          }
        : null,
    pendingApprovals,
    pendingUserInputs,
    activePendingApproval: pendingApprovals[0] ?? null,
    activePendingUserInput: pendingUserInputs[0] ?? null,
    activePlan: deriveActivePlanState(input.thread.activities, latestTurnId),
    activeProposedPlan,
    sidebarProposedPlan,
    hasActionableProposedPlan: hasActionableProposedPlan(activeProposedPlan),
    hasPlanReadyPrompt: hasPlanReadyPrompt({
      hasPendingUserInput: pendingUserInputs.length > 0,
      interactionMode: input.thread.interactionMode,
      latestTurn: input.thread.latestTurn,
      session: input.thread.session,
      hasActionableProposedPlan: hasActionableProposedPlan(activeProposedPlan),
    }),
    workLogEntries,
  };
}
