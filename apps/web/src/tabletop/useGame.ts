import { useCallback, useEffect, useRef, useState } from "react";
import type { RedactedGameView } from "@tile-meld/shared";
import type { TurnEvent } from "@tile-meld/engine";
import { api } from "../api/client.js";
import { getSocket, emitAck, SocketActionError } from "../api/socket.js";
import { useAnnouncer } from "../announcer/AnnouncerProvider.js";

// "disconnected" means truly no active retry: either the Manager's
// bounded reconnection attempts (see socket.ts) were exhausted, or the
// server itself forced the disconnect ("io server disconnect", the one
// disconnect reason Socket.IO's own client does NOT auto-retry after --
// see the socket.io docs on Manager#reconnection). "reconnecting" means
// the Manager is actively retrying in the background right now. Collapsing
// these into one "disconnected" state (the previous 3-value type) left a
// user with no way to tell "still trying" from "gave up, do something" --
// Phase 3 stabilization requirement.
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

type TurnActionAck = {
  readonly ok: true;
  readonly version: number;
  readonly event: TurnEvent;
};

function describeEvent(event: TurnEvent): string {
  switch (event.type) {
    case "committed":
      return `Seat ${event.seatIndex + 1} committed a turn.`;
    case "invalid_commit":
      return `Seat ${event.seatIndex + 1}'s commit was invalid and drew ${event.penaltyDrawn} penalty tile(s).`;
    case "drawn":
      return `Seat ${event.seatIndex + 1} drew a tile.`;
    case "passed":
      return `Seat ${event.seatIndex + 1} passed.`;
    case "resigned":
      return `Seat ${event.seatIndex + 1} resigned.`;
    case "timed_out":
      return `Seat ${event.seatIndex + 1} timed out and drew ${event.penaltyDrawn} penalty tile(s).`;
    default:
      return "The game state changed.";
  }
}

/** Subscribes to one game's live state over Socket.IO: joins the game
 * room, keeps a canonical `RedactedGameView` in sync, and exposes the
 * turn-action methods. `game:patch` only carries the event, not the
 * resulting table/rack (§7.3), so every patch triggers a fresh
 * GET /api/games/:id fetch to reconcile -- simple and correct, and the
 * volume here is tiny (an async, turn-based game). */
export function useGame(gameId: string) {
  const { announce } = useAnnouncer();
  const [view, setView] = useState<RedactedGameView | undefined>(undefined);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [banner, setBanner] = useState<string | undefined>(undefined);
  const [warningToast, setWarningToast] = useState<string | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const connectionStateRef = useRef(connectionState);
  connectionStateRef.current = connectionState;
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refetch = useCallback(async () => {
    try {
      const fresh = await api.getGame(gameId);
      setView(fresh);
    } catch {
      // A transient fetch failure here just leaves the previous view in
      // place; the next patch/reconnect will retry.
    }
  }, [gameId]);

  useEffect(() => {
    const socket = getSocket();

    function onConnect(): void {
      const wasReconnecting = connectionStateRef.current === "reconnecting";
      setConnectionState("connected");
      if (wasReconnecting) announce("Reconnected.");
      socket.emit(
        "game:join",
        { gameId },
        (ack: { ok: boolean; code?: string; message?: string } & Partial<RedactedGameView>) => {
          if (ack.ok) {
            setView(ack as unknown as RedactedGameView);
          } else if (ack.code === "not_found" || ack.code === "forbidden") {
            setNotFound(true);
          } else {
            setBanner(ack.message ?? "Could not load the game.");
          }
        },
      );
    }
    // Socket.IO auto-retries after every disconnect reason EXCEPT
    // "io server disconnect" (the server explicitly kicked the client) --
    // that one specific reason is the only case with no retry in flight,
    // so it goes straight to the terminal "disconnected" state instead of
    // the transient "reconnecting" one. See socket.io's own Manager docs.
    function onDisconnect(reason: string): void {
      if (reason === "io server disconnect") {
        setConnectionState("disconnected");
        announce("Disconnected.");
      } else {
        setConnectionState("reconnecting");
        announce("Connection lost. Reconnecting…");
      }
    }
    // Manager-level events (reconnection lifecycle) live on socket.io, not
    // the Socket itself -- distinct namespace from 'connect'/'disconnect'.
    function onReconnectFailed(): void {
      setConnectionState("disconnected");
      announce("Could not reconnect. Use the Reconnect button to try again.");
    }
    function onGameState(payload: RedactedGameView): void {
      setView(payload);
    }
    function onGamePatch(payload: { readonly events: readonly TurnEvent[] }): void {
      for (const event of payload.events) announce(describeEvent(event));
      void refetch();
    }
    function onTurnStarted(payload: { readonly seatIndex: number }): void {
      const current = viewRef.current;
      const mine = current?.self.seatIndex === payload.seatIndex;
      if (mine) {
        announce("It's your turn.");
        return;
      }
      const opponent = current?.opponents.find((o) => o.seatIndex === payload.seatIndex);
      announce(
        opponent?.isComputer
          ? "Computer is playing."
          : `Turn started for seat ${payload.seatIndex + 1}.`,
      );
    }
    function onTurnWarning(payload: {
      readonly seatIndex: number;
      readonly remainingMs: number;
    }): void {
      const mine = viewRef.current?.self.seatIndex === payload.seatIndex;
      const minutes = Math.max(1, Math.round(payload.remainingMs / 60_000));
      const message = mine
        ? `${minutes} minute(s) left on your turn.`
        : `${minutes} minute(s) left on seat ${payload.seatIndex + 1}'s turn.`;
      announce(message);
      // A visible, dismissible banner alongside the aria-live announcement
      // -- always-available in-app notification per §8.4, not just for
      // screen-reader users. Auto-clears so it doesn't linger indefinitely
      // if the player never dismisses it.
      setWarningToast(message);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      warningTimerRef.current = setTimeout(() => setWarningToast(undefined), 15_000);
    }
    function onGameOver(payload: { readonly winnerSeatIndex: number }): void {
      const mine = viewRef.current?.self.seatIndex === payload.winnerSeatIndex;
      announce(mine ? "Game over -- you won!" : "Game over.");
      void refetch();
    }
    function onSocketError(payload: { readonly code: string; readonly message: string }): void {
      setBanner(payload.message);
      announce(`Error: ${payload.message}`);
      if (payload.code === "stale") void refetch();
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("game:state", onGameState);
    socket.on("game:patch", onGamePatch);
    socket.on("turn:started", onTurnStarted);
    socket.on("turn:warning", onTurnWarning);
    socket.on("game:over", onGameOver);
    socket.on("error", onSocketError);
    // Manager-level (reconnection lifecycle), not Socket-level -- deliberately
    // NOT subscribing to 'reconnect_attempt' or 'reconnect_error', which fire
    // on every single retry and would spam the live region; 'reconnect_failed'
    // (the terminal "gave up" transition) is the only one worth announcing.
    socket.io.on("reconnect_failed", onReconnectFailed);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game:state", onGameState);
      socket.off("game:patch", onGamePatch);
      socket.off("turn:started", onTurnStarted);
      socket.off("turn:warning", onTurnWarning);
      socket.off("game:over", onGameOver);
      socket.off("error", onSocketError);
      socket.io.off("reconnect_failed", onReconnectFailed);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [gameId, refetch, announce]);

  // Manual recovery once the Manager has given up retrying on its own
  // (bounded reconnectionAttempts, see socket.ts) -- re-invokes the exact
  // same connection path used on first load, nothing server-side to
  // support beyond accepting a normal new connection.
  const reconnect = useCallback(() => {
    setConnectionState("connecting");
    getSocket().connect();
  }, []);

  const withVersionAndTurn = useCallback(
    <T>(build: (version: number, turnId: string) => Promise<T>): Promise<T> | undefined => {
      const current = viewRef.current;
      if (!current || current.turnId === null) return undefined;
      return build(current.version, current.turnId);
    },
    [],
  );

  const commit = useCallback(
    (arrangement: readonly (readonly string[])[]) =>
      withVersionAndTurn((expectedVersion, turnId) =>
        emitAck<TurnActionAck>("turn:commit", {
          gameId,
          expectedVersion,
          turnId,
          arrangement,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    [gameId, withVersionAndTurn],
  );

  const draw = useCallback(
    () =>
      withVersionAndTurn((expectedVersion, turnId) =>
        emitAck<TurnActionAck>("turn:draw", {
          gameId,
          expectedVersion,
          turnId,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    [gameId, withVersionAndTurn],
  );

  const pass = useCallback(
    () =>
      withVersionAndTurn((expectedVersion, turnId) =>
        emitAck<TurnActionAck>("turn:pass", {
          gameId,
          expectedVersion,
          turnId,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    [gameId, withVersionAndTurn],
  );

  const resign = useCallback(
    () => emitAck<TurnActionAck>("turn:resign", { gameId, idempotencyKey: crypto.randomUUID() }),
    [gameId],
  );

  const dismissBanner = useCallback(() => setBanner(undefined), []);
  const dismissWarningToast = useCallback(() => setWarningToast(undefined), []);

  return {
    view,
    connectionState,
    reconnect,
    banner,
    dismissBanner,
    warningToast,
    dismissWarningToast,
    notFound,
    commit,
    draw,
    pass,
    resign,
    isSocketActionError: (err: unknown): err is SocketActionError =>
      err instanceof SocketActionError,
  };
}
