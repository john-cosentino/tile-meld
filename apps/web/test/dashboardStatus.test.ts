import { describe, expect, it } from "vitest";
import {
  classifyRoomStatus,
  dashboardCardHref,
  type ClassifiableRoom,
} from "../src/dashboard/dashboardStatus.js";

// Phase 6 -- the one shared, authoritative status-classification rule.
// Every scenario here mirrors a server-side fixture in
// apps/server/test/http/rooms.test.ts ("Phase 6 dashboard read-model
// fields"): the server supplies the authoritative primitives, this module
// is the single place that maps them onto the five user-facing labels.

function room(overrides: Partial<ClassifiableRoom> = {}): ClassifiableRoom {
  return {
    status: "open",
    latestGameStatus: null,
    selfSeatStatus: null,
    ...overrides,
  };
}

describe("classifyRoomStatus", () => {
  it("classifies an open room with no game yet as Open / neutral", () => {
    expect(classifyRoomStatus(room({ status: "open" }))).toEqual({
      label: "Open",
      tone: "neutral",
    });
  });

  it("classifies a room with a currently active game as Active / active-tone", () => {
    expect(
      classifyRoomStatus(
        room({ status: "in_game", latestGameStatus: "active", selfSeatStatus: "active" }),
      ),
    ).toEqual({ label: "Active", tone: "active" });
  });

  it("classifies a completed game the player finished without resigning as Completed / grey", () => {
    expect(
      classifyRoomStatus(
        room({
          status: "between_games",
          latestGameStatus: "completed",
          selfSeatStatus: "active",
        }),
      ),
    ).toEqual({ label: "Completed", tone: "grey" });
  });

  it("classifies the player's own resignation from the latest completed game as Resigned / grey", () => {
    expect(
      classifyRoomStatus(
        room({
          status: "between_games",
          latestGameStatus: "completed",
          selfSeatStatus: "resigned",
        }),
      ),
    ).toEqual({ label: "Resigned", tone: "grey" });
  });

  it("classifies an abandoned room as Ended / grey, regardless of its prior game state", () => {
    expect(
      classifyRoomStatus(
        room({ status: "abandoned", latestGameStatus: "completed", selfSeatStatus: "resigned" }),
      ),
    ).toEqual({ label: "Ended", tone: "grey" });
  });

  it("classifies a closed room as Ended / grey (reserved status, mapped defensively)", () => {
    expect(classifyRoomStatus(room({ status: "closed" }))).toEqual({
      label: "Ended",
      tone: "grey",
    });
  });

  it("prioritizes a new active rematch over a prior resignation in the same room", () => {
    // Once a rematch is dealt, room.status flips to in_game and the fresh
    // game's seat starts active -- the classifier never looks at history,
    // only the CURRENT latest-game fields.
    const afterRematch = room({
      status: "in_game",
      latestGameStatus: "active",
      selfSeatStatus: "active",
    });
    expect(classifyRoomStatus(afterRematch)).toEqual({ label: "Active", tone: "active" });
  });

  it("falls back to Completed if between_games somehow has no self seat data (defensive default)", () => {
    expect(
      classifyRoomStatus(
        room({ status: "between_games", latestGameStatus: "completed", selfSeatStatus: null }),
      ),
    ).toEqual({ label: "Completed", tone: "grey" });
  });

  it("every possible room status maps to exactly one of the five labels", () => {
    const statuses: ClassifiableRoom["status"][] = [
      "open",
      "in_game",
      "between_games",
      "closed",
      "abandoned",
    ];
    const labels = new Set(
      statuses.map(
        (status) =>
          classifyRoomStatus(
            room({ status, latestGameStatus: "completed", selfSeatStatus: "active" }),
          ).label,
      ),
    );
    for (const label of labels) {
      expect(["Open", "Active", "Completed", "Resigned", "Ended"]).toContain(label);
    }
  });
});

describe("dashboardCardHref", () => {
  it("Open goes to the Waiting Room", () => {
    const href = dashboardCardHref(
      { roomId: "r1", latestGameId: null },
      { label: "Open", tone: "neutral" },
    );
    expect(href).toBe("/rooms/r1");
  });

  it("Active goes to the latest game", () => {
    const href = dashboardCardHref(
      { roomId: "r1", latestGameId: "g1" },
      { label: "Active", tone: "active" },
    );
    expect(href).toBe("/games/g1");
  });

  it("Completed goes to the latest game's Game Over screen (the same game route)", () => {
    const href = dashboardCardHref(
      { roomId: "r1", latestGameId: "g1" },
      { label: "Completed", tone: "grey" },
    );
    expect(href).toBe("/games/g1");
  });

  it("Resigned goes to the latest game's Game Over screen", () => {
    const href = dashboardCardHref(
      { roomId: "r1", latestGameId: "g1" },
      { label: "Resigned", tone: "grey" },
    );
    expect(href).toBe("/games/g1");
  });

  it("Ended with a surviving completed game goes to it", () => {
    const href = dashboardCardHref(
      { roomId: "r1", latestGameId: "g1" },
      { label: "Ended", tone: "grey" },
    );
    expect(href).toBe("/games/g1");
  });

  it("Ended with no surviving game returns undefined -- an unavailable state, never a broken link", () => {
    const href = dashboardCardHref(
      { roomId: "r1", latestGameId: null },
      { label: "Ended", tone: "grey" },
    );
    expect(href).toBeUndefined();
  });

  it("never links to any game id other than the room's own latestGameId", () => {
    const href = dashboardCardHref(
      { roomId: "r1", latestGameId: "the-only-game-this-room-knows-about" },
      { label: "Active", tone: "active" },
    );
    expect(href).toBe("/games/the-only-game-this-room-knows-about");
  });
});
