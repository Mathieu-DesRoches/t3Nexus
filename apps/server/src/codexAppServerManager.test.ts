import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import {
  ApprovalRequestId,
  ProviderItemId,
  ThreadId,
  TurnId,
  type ProviderSession,
} from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexAppServerManager } from "./codexAppServerManager.ts";

const asThreadId = (value: string): ThreadId => ThreadId.make(value);
const asTurnId = (value: string): TurnId => TurnId.make(value);
const asItemId = (value: string): ProviderItemId => ProviderItemId.make(value);
const asRequestId = (value: string): ApprovalRequestId => ApprovalRequestId.make(value);

class FakeChildProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = {
    writable: true,
    write: vi.fn(),
  };
  killed = true;
}

class FakeReadline extends EventEmitter {
  readonly close = vi.fn();
}

function makeSession(threadId: ThreadId): ProviderSession {
  const now = new Date().toISOString();
  return {
    provider: "codex",
    status: "running",
    runtimeMode: "full-access",
    threadId,
    activeTurnId: asTurnId("turn-1"),
    resumeCursor: { threadId: "provider-thread-1" },
    cwd: process.cwd(),
    createdAt: now,
    updatedAt: now,
  };
}

function seedManagerSession(manager: CodexAppServerManager, threadId: ThreadId) {
  const child = new FakeChildProcess();
  const output = new FakeReadline();
  const reject = vi.fn();
  const timeout = setTimeout(() => undefined, 60_000);
  const context = {
    session: makeSession(threadId),
    account: {
      type: "unknown",
      planType: null,
      sparkEnabled: true,
    },
    child,
    output,
    pending: new Map([
      [
        "1",
        {
          method: "thread/read",
          timeout,
          resolve: vi.fn(),
          reject,
        },
      ],
    ]),
    pendingApprovals: new Map([
      [
        asRequestId("req-approval"),
        {
          requestId: asRequestId("req-approval"),
          jsonRpcId: "rpc-approval",
          method: "item/fileRead/requestApproval",
          requestKind: "file-read" as const,
          threadId,
          turnId: asTurnId("turn-1"),
          itemId: asItemId("item-1"),
        },
      ],
    ]),
    pendingUserInputs: new Map([
      [
        asRequestId("req-input"),
        {
          requestId: asRequestId("req-input"),
          jsonRpcId: "rpc-input",
          threadId,
          turnId: asTurnId("turn-1"),
          itemId: asItemId("item-1"),
        },
      ],
    ]),
    collabReceiverTurns: new Map<string, TurnId>(),
    nextRequestId: 2,
    stopping: false,
  };

  (manager as unknown as { sessions: Map<ThreadId, unknown> }).sessions.set(threadId, context);

  return {
    child,
    context,
    output,
    reject,
    timeout,
  };
}

describe("CodexAppServerManager", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cleans up pending state and emits session/closed on graceful stop", () => {
    const manager = new CodexAppServerManager();
    const threadId = asThreadId("thread-1");
    const events: Array<{ method: string; message: string | undefined }> = [];
    manager.on("event", (event) => {
      events.push({ method: event.method, message: event.message });
    });

    const seeded = seedManagerSession(manager, threadId);

    manager.stopSession(threadId);

    expect(seeded.reject).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Session stopped before request completed.",
      }),
    );
    expect(seeded.output.close).toHaveBeenCalledTimes(1);
    expect(seeded.context.stopping).toBe(true);
    expect(seeded.context.pending.size).toBe(0);
    expect(seeded.context.pendingApprovals.size).toBe(0);
    expect(seeded.context.pendingUserInputs.size).toBe(0);
    expect(manager.hasSession(threadId)).toBe(false);
    expect(events.at(-1)).toEqual({
      method: "session/closed",
      message: "Session stopped",
    });

    clearTimeout(seeded.timeout);
  });

  it("cleans up pending state and closes output when the process exits unexpectedly", () => {
    const manager = new CodexAppServerManager();
    const threadId = asThreadId("thread-1");
    const events: Array<{ method: string; message: string | undefined }> = [];
    manager.on("event", (event) => {
      events.push({ method: event.method, message: event.message });
    });

    const seeded = seedManagerSession(manager, threadId);
    (
      manager as unknown as { attachProcessListeners: (context: unknown) => void }
    ).attachProcessListeners(seeded.context);

    seeded.child.emit("exit", 1, null);

    expect(seeded.reject).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Session exited before request completed.",
      }),
    );
    expect(seeded.output.close).toHaveBeenCalledTimes(1);
    expect(seeded.context.pending.size).toBe(0);
    expect(seeded.context.pendingApprovals.size).toBe(0);
    expect(seeded.context.pendingUserInputs.size).toBe(0);
    expect(manager.hasSession(threadId)).toBe(false);
    expect(events.at(-1)).toEqual({
      method: "session/exited",
      message: "codex app-server exited (code=1, signal=null).",
    });

    clearTimeout(seeded.timeout);
  });
});
