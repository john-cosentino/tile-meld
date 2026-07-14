import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";
import { getSocket, emitAck } from "../api/socket.js";

export type ChatMessage = {
  readonly id: string;
  readonly seatIndex: number | null;
  readonly senderDisplay: string;
  readonly body: string;
  readonly createdAt: string;
};

/** Loads chat history once, then appends live chat:message events -- the
 * socket event only covers messages sent while connected (§7.3), so
 * history has to come from a separate fetch for anything sent before this
 * client joined. */
export function useChat(gameId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .getGameChat(gameId)
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch(() => {
        // A failed history fetch just leaves the panel empty -- live
        // messages from here on still work via the socket.
      });

    const socket = getSocket();
    function onMessage(payload: Omit<ChatMessage, "id">): void {
      setMessages((prev) => [...prev, { ...payload, id: crypto.randomUUID() }]);
    }
    socket.on("chat:message", onMessage);

    return () => {
      cancelled = true;
      socket.off("chat:message", onMessage);
    };
  }, [gameId]);

  const send = useCallback(
    async (body: string): Promise<void> => {
      setError(undefined);
      try {
        await emitAck("chat:send", { gameId, body });
      } catch (err) {
        setError(err instanceof ApiError || err instanceof Error ? err.message : "Could not send.");
      }
    },
    [gameId],
  );

  return { messages, send, error };
}
