import { useState, type FormEvent } from "react";
import { useChat } from "./useChat.js";

type ChatPanelProps = {
  readonly gameId: string;
  /** Chat goes read-only once the game has ended (§10.1 screen 8) -- a
   * rematch is a new game with its own fresh chat history. */
  readonly readOnly: boolean;
};

export function ChatPanel({ gameId, readOnly }: ChatPanelProps) {
  const { messages, send, error } = useChat(gameId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    await send(body);
    setSending(false);
    setDraft("");
  }

  return (
    <div className="stack card">
      <h2 style={{ margin: 0 }}>Chat</h2>

      <div
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="stack"
        style={{ maxHeight: "12rem", overflowY: "auto", gap: "var(--space-1)" }}
      >
        {messages.length === 0 && <p className="muted">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id}>
            <strong>{m.senderDisplay}: </strong>
            <span>{m.body}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {readOnly ? (
        <p className="muted">Chat is read-only now that the game has ended.</p>
      ) : (
        <form className="row" onSubmit={(e) => void onSubmit(e)}>
          <label className="visually-hidden" htmlFor="chat-input">
            Chat message
          </label>
          <input
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Say something…"
            style={{ flex: 1 }}
          />
          <button type="submit" className="primary" disabled={sending || !draft.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
