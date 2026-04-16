import type {
  ChatAttachment,
  OrchestrationCheckpointFile,
  OrchestrationCheckpointSummary,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProject,
  OrchestrationProposedPlan,
  OrchestrationReadModel,
  OrchestrationSession,
  OrchestrationThread,
  OrchestrationThreadActivity,
  ProjectScript,
} from "@t3tools/contracts";

import { ORCHESTRATION_PROJECTOR_NAMES } from "./ProjectionPipeline.ts";

export interface ProjectionSnapshotProjectRow {
  readonly projectId: OrchestrationProject["id"];
  readonly title: string;
  readonly workspaceRoot: string;
  readonly defaultModelSelection: OrchestrationProject["defaultModelSelection"];
  readonly scripts: ReadonlyArray<ProjectScript>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface ProjectionSnapshotThreadRow {
  readonly threadId: OrchestrationThread["id"];
  readonly projectId: OrchestrationThread["projectId"];
  readonly title: string;
  readonly modelSelection: OrchestrationThread["modelSelection"];
  readonly runtimeMode: OrchestrationThread["runtimeMode"];
  readonly interactionMode: OrchestrationThread["interactionMode"];
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
}

export interface ProjectionSnapshotMessageRow {
  readonly messageId: OrchestrationMessage["id"];
  readonly threadId: OrchestrationThread["id"];
  readonly turnId: OrchestrationMessage["turnId"];
  readonly role: OrchestrationMessage["role"];
  readonly text: string;
  readonly attachments: ReadonlyArray<ChatAttachment> | null;
  readonly isStreaming: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectionSnapshotProposedPlanRow {
  readonly planId: OrchestrationProposedPlan["id"];
  readonly threadId: OrchestrationThread["id"];
  readonly turnId: OrchestrationProposedPlan["turnId"];
  readonly planMarkdown: string;
  readonly implementedAt: string | null;
  readonly implementationThreadId: OrchestrationProposedPlan["implementationThreadId"];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectionSnapshotActivityRow {
  readonly activityId: OrchestrationThreadActivity["id"];
  readonly threadId: OrchestrationThread["id"];
  readonly turnId: OrchestrationThreadActivity["turnId"];
  readonly tone: OrchestrationThreadActivity["tone"];
  readonly kind: OrchestrationThreadActivity["kind"];
  readonly summary: string;
  readonly payload: unknown;
  readonly sequence: number | null;
  readonly createdAt: string;
}

export interface ProjectionSnapshotSessionRow {
  readonly threadId: OrchestrationThread["id"];
  readonly status: OrchestrationSession["status"];
  readonly providerName: OrchestrationSession["providerName"];
  readonly runtimeMode: OrchestrationSession["runtimeMode"];
  readonly activeTurnId: OrchestrationSession["activeTurnId"];
  readonly lastError: OrchestrationSession["lastError"];
  readonly updatedAt: string;
}

export interface ProjectionSnapshotCheckpointRow {
  readonly threadId: OrchestrationThread["id"];
  readonly turnId: OrchestrationCheckpointSummary["turnId"];
  readonly checkpointTurnCount: OrchestrationCheckpointSummary["checkpointTurnCount"];
  readonly checkpointRef: OrchestrationCheckpointSummary["checkpointRef"];
  readonly status: OrchestrationCheckpointSummary["status"];
  readonly files: ReadonlyArray<OrchestrationCheckpointFile>;
  readonly assistantMessageId: OrchestrationCheckpointSummary["assistantMessageId"];
  readonly completedAt: string;
}

export interface ProjectionSnapshotLatestTurnRow {
  readonly threadId: OrchestrationThread["id"];
  readonly turnId: OrchestrationLatestTurn["turnId"];
  readonly state: string;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly assistantMessageId: OrchestrationLatestTurn["assistantMessageId"];
  readonly sourceProposedPlanThreadId: OrchestrationThread["id"] | null;
  readonly sourceProposedPlanId: OrchestrationProposedPlan["id"] | null;
}

export interface ProjectionSnapshotStateRow {
  readonly projector: string;
  readonly lastAppliedSequence: number;
  readonly updatedAt: string;
}

export interface ProjectionSnapshotAssemblerInput {
  readonly projectRows: ReadonlyArray<ProjectionSnapshotProjectRow>;
  readonly threadRows: ReadonlyArray<ProjectionSnapshotThreadRow>;
  readonly messageRows: ReadonlyArray<ProjectionSnapshotMessageRow>;
  readonly proposedPlanRows: ReadonlyArray<ProjectionSnapshotProposedPlanRow>;
  readonly activityRows: ReadonlyArray<ProjectionSnapshotActivityRow>;
  readonly sessionRows: ReadonlyArray<ProjectionSnapshotSessionRow>;
  readonly checkpointRows: ReadonlyArray<ProjectionSnapshotCheckpointRow>;
  readonly latestTurnRows: ReadonlyArray<ProjectionSnapshotLatestTurnRow>;
  readonly stateRows: ReadonlyArray<ProjectionSnapshotStateRow>;
  readonly repositoryIdentities: ReadonlyMap<
    OrchestrationProject["id"],
    OrchestrationProject["repositoryIdentity"]
  >;
}

const REQUIRED_SNAPSHOT_PROJECTORS = [
  ORCHESTRATION_PROJECTOR_NAMES.projects,
  ORCHESTRATION_PROJECTOR_NAMES.threads,
  ORCHESTRATION_PROJECTOR_NAMES.threadMessages,
  ORCHESTRATION_PROJECTOR_NAMES.threadProposedPlans,
  ORCHESTRATION_PROJECTOR_NAMES.threadActivities,
  ORCHESTRATION_PROJECTOR_NAMES.threadSessions,
  ORCHESTRATION_PROJECTOR_NAMES.checkpoints,
] as const;

function maxIso(left: string | null, right: string): string {
  if (left === null) {
    return right;
  }
  return left > right ? left : right;
}

function computeSnapshotSequence(stateRows: ReadonlyArray<ProjectionSnapshotStateRow>): number {
  if (stateRows.length === 0) {
    return 0;
  }
  const sequenceByProjector = new Map(
    stateRows.map((row) => [row.projector, row.lastAppliedSequence] as const),
  );

  let minSequence = Number.POSITIVE_INFINITY;
  for (const projector of REQUIRED_SNAPSHOT_PROJECTORS) {
    const sequence = sequenceByProjector.get(projector);
    if (sequence === undefined) {
      return 0;
    }
    if (sequence < minSequence) {
      minSequence = sequence;
    }
  }

  return Number.isFinite(minSequence) ? minSequence : 0;
}

function toLatestTurnState(state: string): OrchestrationLatestTurn["state"] {
  if (state === "error") {
    return "error";
  }
  if (state === "interrupted") {
    return "interrupted";
  }
  if (state === "completed") {
    return "completed";
  }
  return "running";
}

export function assembleProjectionSnapshot(
  input: ProjectionSnapshotAssemblerInput,
): Pick<OrchestrationReadModel, "snapshotSequence" | "projects" | "threads" | "updatedAt"> {
  const messagesByThread = new Map<string, Array<OrchestrationMessage>>();
  const proposedPlansByThread = new Map<string, Array<OrchestrationProposedPlan>>();
  const activitiesByThread = new Map<string, Array<OrchestrationThreadActivity>>();
  const checkpointsByThread = new Map<string, Array<OrchestrationCheckpointSummary>>();
  const sessionsByThread = new Map<string, OrchestrationSession>();
  const latestTurnByThread = new Map<string, OrchestrationLatestTurn>();

  let updatedAt: string | null = null;

  for (const row of input.projectRows) {
    updatedAt = maxIso(updatedAt, row.updatedAt);
  }
  for (const row of input.threadRows) {
    updatedAt = maxIso(updatedAt, row.updatedAt);
  }
  for (const row of input.stateRows) {
    updatedAt = maxIso(updatedAt, row.updatedAt);
  }

  for (const row of input.messageRows) {
    updatedAt = maxIso(updatedAt, row.updatedAt);
    const threadMessages = messagesByThread.get(row.threadId) ?? [];
    threadMessages.push({
      id: row.messageId,
      role: row.role,
      text: row.text,
      ...(row.attachments !== null ? { attachments: row.attachments } : {}),
      turnId: row.turnId,
      streaming: row.isStreaming === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    messagesByThread.set(row.threadId, threadMessages);
  }

  for (const row of input.proposedPlanRows) {
    updatedAt = maxIso(updatedAt, row.updatedAt);
    const threadProposedPlans = proposedPlansByThread.get(row.threadId) ?? [];
    threadProposedPlans.push({
      id: row.planId,
      turnId: row.turnId,
      planMarkdown: row.planMarkdown,
      implementedAt: row.implementedAt,
      implementationThreadId: row.implementationThreadId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    proposedPlansByThread.set(row.threadId, threadProposedPlans);
  }

  for (const row of input.activityRows) {
    updatedAt = maxIso(updatedAt, row.createdAt);
    const threadActivities = activitiesByThread.get(row.threadId) ?? [];
    threadActivities.push({
      id: row.activityId,
      tone: row.tone,
      kind: row.kind,
      summary: row.summary,
      payload: row.payload,
      turnId: row.turnId,
      ...(row.sequence !== null ? { sequence: row.sequence } : {}),
      createdAt: row.createdAt,
    });
    activitiesByThread.set(row.threadId, threadActivities);
  }

  for (const row of input.checkpointRows) {
    updatedAt = maxIso(updatedAt, row.completedAt);
    const threadCheckpoints = checkpointsByThread.get(row.threadId) ?? [];
    threadCheckpoints.push({
      turnId: row.turnId,
      checkpointTurnCount: row.checkpointTurnCount,
      checkpointRef: row.checkpointRef,
      status: row.status,
      files: row.files,
      assistantMessageId: row.assistantMessageId,
      completedAt: row.completedAt,
    });
    checkpointsByThread.set(row.threadId, threadCheckpoints);
  }

  for (const row of input.latestTurnRows) {
    updatedAt = maxIso(updatedAt, row.requestedAt);
    if (row.startedAt !== null) {
      updatedAt = maxIso(updatedAt, row.startedAt);
    }
    if (row.completedAt !== null) {
      updatedAt = maxIso(updatedAt, row.completedAt);
    }
    if (latestTurnByThread.has(row.threadId)) {
      continue;
    }
    latestTurnByThread.set(row.threadId, {
      turnId: row.turnId,
      state: toLatestTurnState(row.state),
      requestedAt: row.requestedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      assistantMessageId: row.assistantMessageId,
      ...(row.sourceProposedPlanThreadId !== null && row.sourceProposedPlanId !== null
        ? {
            sourceProposedPlan: {
              threadId: row.sourceProposedPlanThreadId,
              planId: row.sourceProposedPlanId,
            },
          }
        : {}),
    });
  }

  for (const row of input.sessionRows) {
    updatedAt = maxIso(updatedAt, row.updatedAt);
    sessionsByThread.set(row.threadId, {
      threadId: row.threadId,
      status: row.status,
      providerName: row.providerName,
      runtimeMode: row.runtimeMode,
      activeTurnId: row.activeTurnId,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
    });
  }

  return {
    snapshotSequence: computeSnapshotSequence(input.stateRows),
    projects: input.projectRows.map((row) => ({
      id: row.projectId,
      title: row.title,
      workspaceRoot: row.workspaceRoot,
      repositoryIdentity: input.repositoryIdentities.get(row.projectId) ?? null,
      defaultModelSelection: row.defaultModelSelection,
      scripts: row.scripts,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    })),
    threads: input.threadRows.map((row) => ({
      id: row.threadId,
      projectId: row.projectId,
      title: row.title,
      modelSelection: row.modelSelection,
      runtimeMode: row.runtimeMode,
      interactionMode: row.interactionMode,
      branch: row.branch,
      worktreePath: row.worktreePath,
      latestTurn: latestTurnByThread.get(row.threadId) ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt,
      messages: messagesByThread.get(row.threadId) ?? [],
      proposedPlans: proposedPlansByThread.get(row.threadId) ?? [],
      activities: activitiesByThread.get(row.threadId) ?? [],
      checkpoints: checkpointsByThread.get(row.threadId) ?? [],
      session: sessionsByThread.get(row.threadId) ?? null,
    })),
    updatedAt: updatedAt ?? new Date(0).toISOString(),
  };
}
