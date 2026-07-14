import { describe, expect, it } from "vitest";
import {
  buildInitialDraft,
  moveTile,
  reorderInSet,
  reorderRack,
} from "../src/tabletop/draftState.js";

describe("draftState", () => {
  it("buildInitialDraft seeds sets and rack from canonical ids, each set with a stable id", () => {
    const draft = buildInitialDraft(
      ["r1", "r2"],
      [
        ["a", "b", "c"],
        ["d", "e", "f"],
      ],
    );
    expect(draft.rack).toEqual(["r1", "r2"]);
    expect(draft.sets).toHaveLength(2);
    expect(draft.sets[0]!.tileIds).toEqual(["a", "b", "c"]);
    expect(draft.sets[0]!.id).not.toBe(draft.sets[1]!.id);
  });

  it("moveTile rack -> new-set creates a fresh set and removes the tile from the rack", () => {
    const draft = buildInitialDraft(["r1", "r2"], []);
    const next = moveTile(draft, "r1", { zone: "new-set" });
    expect(next.rack).toEqual(["r2"]);
    expect(next.sets).toHaveLength(1);
    expect(next.sets[0]!.tileIds).toEqual(["r1"]);
  });

  it("moveTile set -> rack removes an emptied set entirely", () => {
    const draft = buildInitialDraft([], [["a"]]);
    const next = moveTile(draft, "a", { zone: "rack" });
    expect(next.rack).toEqual(["a"]);
    expect(next.sets).toHaveLength(0);
  });

  it("moveTile set -> set appends to the destination set, not the source", () => {
    const draft = buildInitialDraft([], [["a", "b"], ["c"]]);
    const [first, second] = draft.sets;
    const next = moveTile(draft, "a", { zone: "set", setId: second!.id });
    const remainingFirst = next.sets.find((s) => s.id === first!.id);
    const grownSecond = next.sets.find((s) => s.id === second!.id);
    expect(remainingFirst?.tileIds).toEqual(["b"]);
    expect(grownSecond?.tileIds).toEqual(["c", "a"]);
  });

  it("moveTile is idempotent about tile provenance -- moving a tile already in the destination just repositions it", () => {
    const draft = buildInitialDraft(["r1"], []);
    const withNewSet = moveTile(draft, "r1", { zone: "new-set" });
    const setId = withNewSet.sets[0]!.id;
    // Moving it "into" the same set it's already in should not duplicate it.
    const again = moveTile(withNewSet, "r1", { zone: "set", setId });
    expect(again.sets[0]!.tileIds).toEqual(["r1"]);
  });

  it("reorderInSet swaps a tile with its left/right neighbor, and is a no-op at the boundary", () => {
    const draft = buildInitialDraft([], [["a", "b", "c"]]);
    const setId = draft.sets[0]!.id;

    const movedRight = reorderInSet(draft, setId, "a", "right");
    expect(movedRight.sets[0]!.tileIds).toEqual(["b", "a", "c"]);

    const noopLeft = reorderInSet(draft, setId, "a", "left");
    expect(noopLeft.sets[0]!.tileIds).toEqual(["a", "b", "c"]);

    const noopRight = reorderInSet(draft, setId, "c", "right");
    expect(noopRight.sets[0]!.tileIds).toEqual(["a", "b", "c"]);
  });

  it("reorderRack replaces the rack order wholesale", () => {
    const draft = buildInitialDraft(["a", "b", "c"], []);
    const next = reorderRack(draft, ["c", "a", "b"]);
    expect(next.rack).toEqual(["c", "a", "b"]);
  });
});
