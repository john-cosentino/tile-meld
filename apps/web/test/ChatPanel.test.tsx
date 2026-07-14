import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { triggerSocketEvent, emitAck, getSocket } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      listeners.get(event)?.delete(handler);
    },
  };
  return {
    triggerSocketEvent: (event: string, payload: unknown) => {
      listeners.get(event)?.forEach((handler) => handler(payload));
    },
    emitAck: vi.fn().mockResolvedValue({ ok: true }),
    getSocket: vi.fn(() => socket),
  };
});

vi.mock("../src/api/socket.js", () => ({ getSocket, emitAck }));

const getGameChat = vi.fn();
vi.mock("../src/api/client.js", () => ({
  api: { getGameChat: (...args: unknown[]) => getGameChat(...args) },
  ApiError: class ApiError extends Error {},
}));

import { ChatPanel } from "../src/chat/ChatPanel.js";

describe("ChatPanel", () => {
  beforeEach(() => {
    getGameChat.mockReset();
    emitAck.mockReset();
    emitAck.mockResolvedValue({ ok: true });
  });

  it("loads and displays chat history on mount", async () => {
    getGameChat.mockResolvedValue({
      messages: [
        {
          id: "1",
          seatIndex: 0,
          senderDisplay: "Alice",
          body: "hi there",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    render(<ChatPanel gameId="g1" readOnly={false} />);

    await screen.findByText("hi there");
    expect(screen.getByText("Alice:")).toBeInTheDocument();
    expect(getGameChat).toHaveBeenCalledWith("g1");
  });

  it("appends a live chat:message event to the list", async () => {
    getGameChat.mockResolvedValue({ messages: [] });
    render(<ChatPanel gameId="g1" readOnly={false} />);
    await waitFor(() => expect(getGameChat).toHaveBeenCalled());

    act(() => {
      triggerSocketEvent("chat:message", {
        seatIndex: 1,
        senderDisplay: "Bob",
        body: "yo",
        createdAt: "2026-01-01T00:01:00Z",
      });
    });

    await screen.findByText("yo");
  });

  it("sends a message via the socket and clears the input", async () => {
    getGameChat.mockResolvedValue({ messages: [] });
    render(<ChatPanel gameId="g1" readOnly={false} />);
    const input = await screen.findByPlaceholderText("Say something…");

    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(emitAck).toHaveBeenCalledWith("chat:send", { gameId: "g1", body: "hello" }),
    );
    expect(input).toHaveValue("");
  });

  it("shows a read-only notice and no input once the game has ended", async () => {
    getGameChat.mockResolvedValue({ messages: [] });
    render(<ChatPanel gameId="g1" readOnly={true} />);

    await screen.findByText(/read-only/);
    expect(screen.queryByPlaceholderText("Say something…")).not.toBeInTheDocument();
  });
});
