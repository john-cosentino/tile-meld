import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Phase 7 -- a purged (retention-deleted, or otherwise no-longer-
// accessible) game must produce a clear, terminal "not found" state, never
// an endless "Loading table…" or a silent automatic retry loop. The
// server already answers a missing game_seats row (whether the game never
// existed or was deleted later) with a "forbidden" ack, and a genuinely
// nonexistent game with "not_found" -- useGame treats both identically,
// which is exactly what lets a purged game read the same as "you were
// never seated here" without revealing why it's gone.

const { getSocket, mockSocket, fireSocket, fireManager } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const managerListeners = new Map<string, Set<(payload: unknown) => void>>();
  const manager = {
    on: (event: string, handler: (payload: unknown) => void) => {
      if (!managerListeners.has(event)) managerListeners.set(event, new Set());
      managerListeners.get(event)!.add(handler);
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      managerListeners.get(event)?.delete(handler);
    },
  };
  const socket = {
    connected: true,
    io: manager,
    connect: vi.fn(),
    on: (event: string, handler: (payload: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      listeners.get(event)?.delete(handler);
    },
    emit: vi.fn(),
  };
  return {
    getSocket: vi.fn(() => socket),
    mockSocket: socket,
    mockManager: manager,
    // Test helpers -- fire a Socket-level ("connect"/"disconnect"/...) or
    // Manager-level (socket.io namespace, e.g. "reconnect_failed") event.
    fireSocket: (event: string, payload?: unknown) => {
      for (const handler of listeners.get(event) ?? []) handler(payload);
    },
    fireManager: (event: string, payload?: unknown) => {
      for (const handler of managerListeners.get(event) ?? []) handler(payload);
    },
  };
});
vi.mock("../src/api/socket.js", () => ({
  getSocket,
  emitAck: vi.fn(),
  SocketActionError: class SocketActionError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

const getGame = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: { getGame: (...a: unknown[]) => getGame(...a) },
}));

import { AnnouncerProvider } from "../src/announcer/AnnouncerProvider.js";
import { useGame } from "../src/tabletop/useGame.js";

function wrapper({ children }: { readonly children: ReactNode }) {
  return <AnnouncerProvider>{children}</AnnouncerProvider>;
}

type JoinAck = { readonly ok: boolean; readonly code?: string; readonly message?: string };

function mockJoinAck(ack: JoinAck): void {
  mockSocket.emit.mockImplementation(
    (event: string, _payload: unknown, cb?: (a: JoinAck) => void) => {
      if (event === "game:join") cb?.(ack);
    },
  );
}

describe("useGame -- purged/missing game handling (Phase 7)", () => {
  beforeEach(() => {
    mockSocket.emit.mockReset();
    getGame.mockReset();
  });

  it("sets notFound when the join ack reports forbidden (a purged game's game_seats are gone)", async () => {
    mockJoinAck({ ok: false, code: "forbidden", message: "not a seat holder in this game" });
    const { result } = renderHook(() => useGame("purged-game"), { wrapper });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.view).toBeUndefined();
  });

  it("sets notFound when the join ack reports not_found", async () => {
    mockJoinAck({ ok: false, code: "not_found", message: "no such game" });
    const { result } = renderHook(() => useGame("gone-game"), { wrapper });
    await waitFor(() => expect(result.current.notFound).toBe(true));
  });

  it("does not treat an unrelated error as not-found -- ordinary recoverable errors keep their existing banner behavior", async () => {
    mockJoinAck({ ok: false, code: "rate_limited", message: "slow down" });
    const { result } = renderHook(() => useGame("busy-game"), { wrapper });
    await waitFor(() => expect(result.current.banner).toBe("slow down"));
    expect(result.current.notFound).toBe(false);
  });

  it("emits game:join exactly once on connect -- a not_found ack never triggers an automatic retry/reconnect loop", async () => {
    mockJoinAck({ ok: false, code: "not_found", message: "no such game" });
    const { result } = renderHook(() => useGame("gone-game"), { wrapper });
    await waitFor(() => expect(result.current.notFound).toBe(true));

    const joinCalls = mockSocket.emit.mock.calls.filter((call) => call[0] === "game:join");
    expect(joinCalls).toHaveLength(1);
  });

  it("loads normally, with notFound false, for a game that still exists", async () => {
    // The ack payload is {ok:true} plus the full RedactedGameView, which
    // mockJoinAck's minimal JoinAck type doesn't model -- cast through
    // unknown since only `ok` matters to the mock socket itself.
    mockJoinAck({
      ok: true,
      gameId: "g1",
      roomId: "r1",
      version: 0,
      table: [],
      poolCount: 10,
      activeSeat: 0,
      consecutivePasses: 0,
      status: "active",
      deadlineAt: null,
      turnId: "t1",
      self: {
        seatIndex: 0,
        displayName: "Alice",
        rackCount: 14,
        status: "active",
        hasInitialMeld: false,
        isComputer: false,
        rack: [],
      },
      opponents: [],
    } as unknown as JoinAck);
    const { result } = renderHook(() => useGame("g1"), { wrapper });
    await waitFor(() => expect(result.current.view).toBeDefined());
    expect(result.current.notFound).toBe(false);
  });
});

// Stabilization pass: "disconnected" alone couldn't distinguish "Socket.IO
// is actively retrying in the background" from "genuinely gave up" -- see
// the ConnectionState doc comment in useGame.ts. These exercise the real
// Socket.IO event names (not fabricated ones), firing them through the
// same mock Socket/Manager the rest of this file already uses.
describe("useGame -- reconnection lifecycle (stabilization pass)", () => {
  beforeEach(() => {
    mockSocket.emit.mockReset();
    mockSocket.connect.mockReset();
    getGame.mockReset();
    mockJoinAck({ ok: true, gameId: "g1" } as unknown as JoinAck);
  });

  it("an ordinary disconnect enters 'reconnecting', not the terminal 'disconnected'", async () => {
    const { result } = renderHook(() => useGame("g1"), { wrapper });
    await waitFor(() => expect(result.current.connectionState).toBe("connected"));

    fireSocket("disconnect", "transport close");
    await waitFor(() => expect(result.current.connectionState).toBe("reconnecting"));
    expect(screen.getByRole("status").textContent).toContain("Connection lost. Reconnecting");
  });

  it("a server-forced disconnect ('io server disconnect') goes straight to 'disconnected' -- Socket.IO won't auto-retry that one", async () => {
    const { result } = renderHook(() => useGame("g1"), { wrapper });
    await waitFor(() => expect(result.current.connectionState).toBe("connected"));

    fireSocket("disconnect", "io server disconnect");
    await waitFor(() => expect(result.current.connectionState).toBe("disconnected"));
  });

  it("recovering from 'reconnecting' back to 'connected' announces 'Reconnected.'", async () => {
    const { result } = renderHook(() => useGame("g1"), { wrapper });
    await waitFor(() => expect(result.current.connectionState).toBe("connected"));

    fireSocket("disconnect", "transport close");
    await waitFor(() => expect(result.current.connectionState).toBe("reconnecting"));

    fireSocket("connect");
    await waitFor(() => expect(result.current.connectionState).toBe("connected"));
    expect(screen.getByRole("status").textContent).toContain("Reconnected.");
  });

  it("the Manager giving up ('reconnect_failed') enters the terminal 'disconnected' state", async () => {
    const { result } = renderHook(() => useGame("g1"), { wrapper });
    await waitFor(() => expect(result.current.connectionState).toBe("connected"));

    fireSocket("disconnect", "transport close");
    await waitFor(() => expect(result.current.connectionState).toBe("reconnecting"));

    fireManager("reconnect_failed");
    await waitFor(() => expect(result.current.connectionState).toBe("disconnected"));
    expect(screen.getByRole("status").textContent).toContain("Could not reconnect");
  });

  it("reconnect() re-invokes the socket's own connect() -- the same path used on first load, nothing new server-side", async () => {
    const { result } = renderHook(() => useGame("g1"), { wrapper });
    await waitFor(() => expect(result.current.connectionState).toBe("connected"));

    fireSocket("disconnect", "io server disconnect");
    await waitFor(() => expect(result.current.connectionState).toBe("disconnected"));

    result.current.reconnect();
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.connectionState).toBe("connecting"));
  });
});
