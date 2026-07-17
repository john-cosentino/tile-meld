import { describe, expect, it } from "vitest";
import {
  CreateRoomRequestSchema,
  DisplayNameSchema,
  JoinRoomRequestSchema,
  PublicRoomsQuerySchema,
  RedactedGameViewSchema,
  TileSchema,
} from "../src/index.js";

describe("DisplayNameSchema", () => {
  it("trims and accepts a reasonable display name", () => {
    expect(DisplayNameSchema.parse("  Alice  ")).toBe("Alice");
  });

  it("rejects an empty display name", () => {
    expect(DisplayNameSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects an overly long display name", () => {
    expect(DisplayNameSchema.safeParse("x".repeat(41)).success).toBe(false);
  });
});

describe("CreateRoomRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = CreateRoomRequestSchema.safeParse({
      displayName: "Host",
      capacity: 4,
      visibility: "public",
      turnLimitHours: 8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid capacity", () => {
    const result = CreateRoomRequestSchema.safeParse({
      displayName: "Host",
      capacity: 5,
      visibility: "public",
      turnLimitHours: 8,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid turn limit", () => {
    const result = CreateRoomRequestSchema.safeParse({
      displayName: "Host",
      capacity: 2,
      visibility: "private",
      turnLimitHours: 6,
    });
    expect(result.success).toBe(false);
  });
});

describe("JoinRoomRequestSchema", () => {
  it("requires both code and displayName", () => {
    expect(JoinRoomRequestSchema.safeParse({ code: "ABC12345" }).success).toBe(false);
    expect(JoinRoomRequestSchema.safeParse({ code: "ABC12345", displayName: "Bob" }).success).toBe(
      true,
    );
  });
});

describe("PublicRoomsQuerySchema", () => {
  it("applies defaults when omitted", () => {
    const result = PublicRoomsQuerySchema.parse({});
    expect(result).toEqual({ limit: 20, offset: 0 });
  });

  it("coerces string query params to numbers", () => {
    const result = PublicRoomsQuerySchema.parse({ limit: "10", offset: "5" });
    expect(result).toEqual({ limit: 10, offset: 5 });
  });

  it("rejects a limit over the max", () => {
    expect(PublicRoomsQuerySchema.safeParse({ limit: 100 }).success).toBe(false);
  });
});

describe("TileSchema", () => {
  it("accepts a valid numbered tile", () => {
    expect(
      TileSchema.safeParse({ kind: "numbered", tileId: "C1-7-a", color: "C1", value: 7 }).success,
    ).toBe(true);
  });

  it("accepts a valid joker", () => {
    expect(TileSchema.safeParse({ kind: "joker", tileId: "J-a" }).success).toBe(true);
  });

  it("rejects an out-of-range value", () => {
    expect(
      TileSchema.safeParse({ kind: "numbered", tileId: "C1-14-a", color: "C1", value: 14 }).success,
    ).toBe(false);
  });

  it("rejects an invalid color", () => {
    expect(
      TileSchema.safeParse({ kind: "numbered", tileId: "C5-7-a", color: "C5", value: 7 }).success,
    ).toBe(false);
  });
});

describe("RedactedGameViewSchema", () => {
  it("accepts a well-formed redacted view and never requires opponent rack tiles", () => {
    const view = {
      gameId: "game-1",
      version: 3,
      table: [[{ kind: "numbered", tileId: "C1-5-a", color: "C1", value: 5 }]],
      poolCount: 42,
      activeSeat: 1,
      consecutivePasses: 0,
      status: "active",
      deadlineAt: "2026-07-14T12:00:00.000Z",
      turnId: "turn-1",
      self: {
        seatIndex: 0,
        displayName: "Alice",
        rackCount: 2,
        status: "active",
        hasInitialMeld: false,
        isComputer: false,
        rack: [{ kind: "joker", tileId: "J-a" }],
      },
      opponents: [
        {
          seatIndex: 1,
          displayName: "Bob",
          rackCount: 14,
          status: "active",
          hasInitialMeld: false,
          isComputer: false,
        },
      ],
    };
    const result = RedactedGameViewSchema.safeParse(view);
    expect(result.success).toBe(true);
    // The opponent shape structurally has no "rack" field at all.
    expect((result.data?.opponents[0] as { rack?: unknown })?.rack).toBeUndefined();
  });
});
