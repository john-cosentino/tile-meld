import type { Server } from "socket.io";

export type SocketData = { playerId: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RealtimeServer = Server<any, any, any, SocketData>;
