import { io, type Socket } from "socket.io-client";

// One Socket.IO connection per app session, created lazily on first use and
// reused across page navigations -- reconnecting per-route would drop the
// "presence" story Socket.IO exists for. Connects to the same origin as
// the page (the Vite dev-server proxy forwards /socket.io to the API
// server; a production deployment sits both behind one reverse-proxy
// origin), so no URL/CORS configuration is needed here.

let socket: Socket | undefined;

export function getSocket(): Socket {
  // reconnectionAttempts bounded (default is Infinity) -- a turn deadline
  // is measured in hours, not seconds, so there is no value in the
  // Manager silently retrying in a backgrounded tab forever; ~10 attempts
  // at the default backoff (up to 5s each) covers a genuine short network
  // blip within under a minute. Past that, useGame.ts surfaces a
  // "Disconnected" state with a manual Reconnect action (Socket.connect())
  // rather than leaving the user with no way back short of a full reload.
  socket ??= io({ withCredentials: true, autoConnect: true, reconnectionAttempts: 10 });
  return socket;
}

export type AckResponse<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };

/** Emits an event and resolves with its ack payload -- throws a plain
 * Error carrying the server's {code, message} on an { ok: false } ack, so
 * callers can just `await emitAck(...)` and catch. */
export function emitAck<T = Record<string, unknown>>(event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    getSocket().emit(event, payload, (response: AckResponse<T>) => {
      if (response.ok) {
        resolve(response);
      } else {
        reject(new SocketActionError(response.code, response.message));
      }
    });
  });
}

export class SocketActionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
