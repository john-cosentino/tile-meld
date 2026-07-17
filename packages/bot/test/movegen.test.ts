import { describe, expect, it } from "vitest";
import { generateBotTurn } from "../src/index.js";
import { assertLegalCommit, input, jok, num } from "./helpers.js";

// Phase B unit coverage for the deterministic move generator (docs plan §6/§12).

function expectCommit(decision: ReturnType<typeof generateBotTurn>) {
  expect(decision.kind).toBe("commit");
  if (decision.kind !== "commit") throw new Error("not a commit");
  return decision;
}

describe("initial meld threshold", () => {
  it("draws when no rack-only meld reaches the threshold", () => {
    const inp = input({ rack: [num("C1", 1), num("C1", 2), num("C1", 3), num("C4", 8)] });
    expect(generateBotTurn(inp).kind).toBe("draw");
  });

  it("commits a meld that totals exactly the threshold", () => {
    const inp = input({ rack: [num("C1", 9), num("C1", 10), num("C1", 11), num("C4", 2)] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.faceValuePlayed).toBe(30);
    expect(commit.tilesPlayed).toBe(3);
  });

  it("commits a meld above the threshold", () => {
    const inp = input({ rack: [num("C1", 10), num("C1", 11), num("C1", 12), num("C1", 13)] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.faceValuePlayed).toBe(46);
  });
});

describe("rack-only sets", () => {
  it("builds a run", () => {
    const inp = input({ hasInitialMeld: true, rack: [num("C2", 4), num("C2", 5), num("C2", 6)] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.tilesPlayed).toBe(3);
  });

  it("builds a group", () => {
    const inp = input({ hasInitialMeld: true, rack: [num("C1", 7), num("C2", 7), num("C3", 7)] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.tilesPlayed).toBe(3);
  });

  it("plays multiple new melds in one turn", () => {
    const inp = input({
      hasInitialMeld: true,
      rack: [
        num("C1", 1),
        num("C1", 2),
        num("C1", 3),
        num("C2", 5),
        num("C3", 5),
        num("C4", 5),
        num("C1", 13), // unplayable extra
      ],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.arrangement.length).toBe(2);
    expect(commit.tilesPlayed).toBe(6);
    expect(commit.wins).toBe(false);
  });

  it("handles duplicate physical tiles without ever duplicating a tileId", () => {
    const inp = input({
      hasInitialMeld: true,
      rack: [
        num("C1", 3),
        num("C1", 4),
        num("C1", 5, "a"),
        num("C1", 5, "b"),
        num("C1", 6),
        num("C1", 7),
      ],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit); // asserts no duplicate tileIds
    // The best run is 3-4-5-6-7 (5 tiles); the second copy of C1-5 stays back.
    expect(commit.tilesPlayed).toBe(5);
  });
});

describe("jokers", () => {
  it("uses one joker to fill a run gap", () => {
    const inp = input({ hasInitialMeld: true, rack: [num("C1", 5), num("C1", 7), jok("a")] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.tilesPlayed).toBe(3);
    expect(commit.arrangement.flat()).toContain("J-a");
  });

  it("uses two jokers in a legal meld", () => {
    const inp = input({
      hasInitialMeld: true,
      rack: [num("C1", 4), num("C1", 5), jok("a"), jok("b")],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.tilesPlayed).toBe(4);
    expect(commit.wins).toBe(true);
    const flat = commit.arrangement.flat();
    expect(flat).toContain("J-a");
    expect(flat).toContain("J-b");
  });

  it("assigns jokers deterministically (identical output across runs)", () => {
    const build = () =>
      generateBotTurn(input({ hasInitialMeld: true, rack: [num("C1", 5), jok("a"), jok("b")] }));
    expect(build()).toEqual(build());
  });
});

describe("table interaction", () => {
  it("never touches existing table tiles before the initial meld", () => {
    const table = [[num("C1", 3), num("C1", 4), num("C1", 5)]];
    const inp = input({
      table,
      hasInitialMeld: false,
      rack: [num("C2", 9), num("C2", 10), num("C2", 11)],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    // The pre-existing set is preserved verbatim at position 0; the new meld
    // is appended.
    expect(commit.arrangement[0]).toEqual(["C1-3-a", "C1-4-a", "C1-5-a"]);
    expect(commit.arrangement.length).toBe(2);
  });

  it("extends an existing run in place, keeping its position", () => {
    const table = [[num("C1", 3), num("C1", 4), num("C1", 5)]];
    const inp = input({ table, hasInitialMeld: true, rack: [num("C1", 2), num("C1", 6)] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.arrangement.length).toBe(1);
    expect(commit.arrangement[0]).toEqual(["C1-2-a", "C1-3-a", "C1-4-a", "C1-5-a", "C1-6-a"]);
    expect(commit.tilesPlayed).toBe(2);
  });

  it("extends an existing group with a missing colour", () => {
    const table = [[num("C1", 7), num("C2", 7), num("C3", 7)]];
    const inp = input({ table, hasInitialMeld: true, rack: [num("C4", 7)] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.tilesPlayed).toBe(1);
    expect(commit.arrangement[0]).toHaveLength(4);
  });

  it("never extends a table set that contains a joker (would change its assignment)", () => {
    // Group of fives with a joker representing C1 (smallest missing). Adding
    // C1-5 would push the joker to C4 -- a forbidden reassignment -- so the
    // bot draws instead.
    const table = [[num("C2", 5), num("C3", 5), jok("a")]];
    const inp = input({ table, hasInitialMeld: true, rack: [num("C1", 5)] });
    expect(generateBotTurn(inp).kind).toBe("draw");
  });

  it("does not perform unsupported table rearrangement", () => {
    // The only way to use C1-2/C1-3 would be to pull C1-1 out of the group --
    // a rearrangement the bot does not do -- so it draws.
    const table = [[num("C1", 1), num("C2", 1), num("C3", 1)]];
    const inp = input({ table, hasInitialMeld: true, rack: [num("C1", 2), num("C1", 3)] });
    expect(generateBotTurn(inp).kind).toBe("draw");
  });

  it("leaves untouched sets exactly where they were when extending another", () => {
    const table = [
      [num("C1", 3), num("C1", 4), num("C1", 5)],
      [num("C2", 7), num("C2", 8), num("C2", 9)],
    ];
    const inp = input({ table, hasInitialMeld: true, rack: [num("C1", 6)] });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    // Set 1 is unchanged and stays at index 1; set 0 is the extended run.
    expect(commit.arrangement[1]).toEqual(["C2-7-a", "C2-8-a", "C2-9-a"]);
    expect(commit.arrangement[0]).toEqual(["C1-3-a", "C1-4-a", "C1-5-a", "C1-6-a"]);
  });
});

describe("deterministic ranking", () => {
  it("prefers a winning move that empties the rack", () => {
    const inp = input({
      hasInitialMeld: true,
      rack: [num("C1", 1), num("C1", 2), num("C1", 3), num("C2", 1), num("C3", 1), num("C4", 1)],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.wins).toBe(true);
    expect(commit.tilesPlayed).toBe(6);
  });

  it("prefers the greater number of tiles played", () => {
    const inp = input({
      hasInitialMeld: true,
      rack: [num("C1", 3), num("C1", 4), num("C1", 5), num("C1", 6)],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.tilesPlayed).toBe(4);
  });

  it("breaks an equal tile-count tie by greatest face value", () => {
    // A run 3-4-5 (face 12) and a group of fives (face 15) both play 3 tiles
    // but conflict on C1-5; the higher-face group wins.
    const inp = input({
      hasInitialMeld: true,
      rack: [num("C1", 3), num("C1", 4), num("C1", 5), num("C2", 5), num("C3", 5)],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    expect(commit.tilesPlayed).toBe(3);
    expect(commit.faceValuePlayed).toBe(15);
  });

  it("uses the canonical (lowest) tileId among duplicate copies", () => {
    const inp = input({
      hasInitialMeld: true,
      rack: [num("C1", 5, "a"), num("C1", 5, "b"), num("C2", 5), num("C3", 5)],
    });
    const commit = expectCommit(generateBotTurn(inp));
    assertLegalCommit(inp, commit);
    const flat = commit.arrangement.flat();
    expect(flat).toContain("C1-5-a");
    expect(flat).not.toContain("C1-5-b");
  });

  it("produces identical output for identical input", () => {
    const make = () =>
      input({
        hasInitialMeld: true,
        rack: [
          num("C1", 3),
          num("C1", 4),
          num("C1", 5),
          num("C2", 5),
          num("C3", 5),
          jok("a"),
          num("C4", 9),
          num("C4", 10),
          num("C4", 11),
        ],
      });
    const first = generateBotTurn(make());
    for (let i = 0; i < 5; i++) expect(generateBotTurn(make())).toEqual(first);
  });
});

describe("fallback", () => {
  it("draws when no supported move exists and the pool is non-empty", () => {
    const inp = input({
      hasInitialMeld: true,
      poolNonEmpty: true,
      rack: [num("C1", 1), num("C2", 5), num("C3", 9)],
    });
    expect(generateBotTurn(inp).kind).toBe("draw");
  });

  it("passes when no supported move exists and the pool is empty", () => {
    const inp = input({
      hasInitialMeld: true,
      poolNonEmpty: false,
      rack: [num("C1", 1), num("C2", 5), num("C3", 9)],
    });
    expect(generateBotTurn(inp).kind).toBe("pass");
  });
});

describe("search bounds", () => {
  it("still returns a legal commit under a tiny node budget", () => {
    const inp = input({
      hasInitialMeld: true,
      rack: [num("C1", 3), num("C1", 4), num("C1", 5), num("C2", 5), num("C3", 5)],
    });
    const decision = generateBotTurn(inp, { maxNodes: 1 });
    // With a 1-node budget it may not find the optimum, but whatever it
    // returns is either a legal commit or a fallback -- never illegal.
    if (decision.kind === "commit") assertLegalCommit(inp, decision);
    else expect(decision.kind).toBe("draw");
  });
});
