import { io, type Socket } from "socket.io-client";

// One Socket.IO connection per app session, created lazily on first use and
// reused across page navigations -- reconnecting per-route would drop the
// "presence" story Socket.IO exists for. Connects to the same origin as
// the page (the Vite dev-server proxy forwards /socket.io to the API
// server; a production deployment sits both behind one reverse-proxy
// origin), so no URL/CORS configuration is needed here.

let socket: Socket | undefined;

export function getSocket(): Socket {
  socket ??= io({ withCredentials: true, autoConnect: true });
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
