import { describe, expect, it } from "vitest";
import {
  canonicalizeUsername,
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  DisplayNameSchema,
  GetRoomResponseSchema,
  isReservedUsername,
  JoinRoomRequestSchema,
  PublicRoomSummarySchema,
  PublicRoomsQuerySchema,
  RedactedGameViewSchema,
  TileSchema,
  UsernameSchema,
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

describe("UsernameSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(UsernameSchema.parse("  alice  ")).toBe("alice");
  });

  it("accepts letters, digits, underscore, and hyphen", () => {
    expect(UsernameSchema.safeParse("alice_bob-99").success).toBe(true);
  });

  it("rejects internal whitespace", () => {
    expect(UsernameSchema.safeParse("al ice").success).toBe(false);
  });

  it("rejects disallowed characters", () => {
    expect(UsernameSchema.safeParse("alice!").success).toBe(false);
    expect(UsernameSchema.safeParse("alice.bob").success).toBe(false);
    expect(UsernameSchema.safeParse("alice@bob").success).toBe(false);
  });

  it("rejects a username shorter than 3 characters", () => {
    expect(UsernameSchema.safeParse("ab").success).toBe(false);
  });

  it("accepts the 3-character boundary", () => {
    expect(UsernameSchema.safeParse("abc").success).toBe(true);
  });

  it("rejects a username longer than 24 characters", () => {
    expect(UsernameSchema.safeParse("a".repeat(25)).success).toBe(false);
  });

  it("accepts the 24-character boundary", () => {
    expect(UsernameSchema.safeParse("a".repeat(24)).success).toBe(true);
  });

  it("rejects an empty or whitespace-only username", () => {
    expect(UsernameSchema.safeParse("   ").success).toBe(false);
  });
});

describe("canonicalizeUsername", () => {
  it("lowercases and trims", () => {
    expect(canonicalizeUsername("  Alice  ")).toBe("alice");
  });

  it("makes case-variant usernames collide", () => {
    expect(canonicalizeUsername("Alice")).toBe(canonicalizeUsername("ALICE"));
    expect(canonicalizeUsername("Alice")).toBe(canonicalizeUsername("alice"));
  });
});

describe("isReservedUsername", () => {
  it("reserves system-oriented names", () => {
    for (const name of ["computer", "system", "admin", "moderator", "null", "undefined"]) {
      expect(isReservedUsername(name)).toBe(true);
    }
  });

  it("reserves names beginning with public_", () => {
    expect(isReservedUsername("public_john")).toBe(true);
    expect(isReservedUsername("public_")).toBe(true);
  });

  it("does not reserve an ordinary username", () => {
    expect(isReservedUsername("alice")).toBe(false);
    expect(isReservedUsername("publicjohn")).toBe(false);
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

describe("room response schemas -- friendly name field (Phase 2)", () => {
  it("CreateRoomResponseSchema accepts a server-generated name", () => {
    const result = CreateRoomResponseSchema.safeParse({
      roomId: "r1",
      code: "ABCD1234",
      name: "John",
    });
    expect(result.success).toBe(true);
  });

  it("PublicRoomSummarySchema accepts a null name for a legacy room", () => {
    const result = PublicRoomSummarySchema.safeParse({
      roomId: "r1",
      code: "ABCD1234",
      name: null,
      memberDisplayNames: ["Alice"],
      memberCount: 1,
      capacity: 4,
      turnLimitHours: 8,
    });
    expect(result.success).toBe(true);
  });

  it("GetRoomResponseSchema requires the name field to be present (nullable, not optional)", () => {
    const withoutName = GetRoomResponseSchema.safeParse({
      roomId: "r1",
      code: "ABCD1234",
      visibility: "private",
      capacity: 2,
      turnLimitHours: 4,
      status: "open",
      hostPlayerId: null,
      members: [],
      latestGameId: null,
    });
    expect(withoutName.success).toBe(false);

    const withNullName = GetRoomResponseSchema.safeParse({
      roomId: "r1",
      code: "ABCD1234",
      name: null,
      visibility: "private",
      capacity: 2,
      turnLimitHours: 4,
      status: "open",
      hostPlayerId: null,
      members: [],
      latestGameId: null,
    });
    expect(withNullName.success).toBe(true);
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
