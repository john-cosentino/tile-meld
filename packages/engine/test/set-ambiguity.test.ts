import { describe, expect, it } from "vitest";
import { validateGroup, validateRun, validateSet } from "../src/sets.js";
import { joker, numbered } from "./fixtures.js";

describe("validateSet -- ambiguous run/group arrangements", () => {
  it("resolves an arrangement valid as both a run and a group to the group interpretation", () => {
    // One real tile (C1, 7) plus both jokers, in an order that also happens
    // to form a valid run (C1: 7,8,9). Confirm both sub-validators would
    // individually accept it before checking validateSet's tie-break.
    const tiles = [numbered("C1", 7), joker("a"), joker("b")];
    expect(validateRun(tiles).valid).toBe(true);
    expect(validateGroup(tiles).valid).toBe(true);

    const result = validateSet(tiles);
    expect(result).toMatchObject({ valid: true, kind: "group", value: 7 });
  });

  it("is deterministic across repeated calls on the ambiguous arrangement", () => {
    const build = () => validateSet([numbered("C1", 7), joker("a"), joker("b")]);
    expect(build()).toEqual(build());
  });

  it("falls back to the run interpretation when only the run is valid", () => {
    const tiles = [numbered("C1", 5), numbered("C1", 6), numbered("C1", 7)];
    expect(validateGroup(tiles).valid).toBe(false);
    expect(validateSet(tiles)).toMatchObject({ valid: true, kind: "run", color: "C1" });
  });

  it("uses the group interpretation when only the group is valid", () => {
    const tiles = [numbered("C1", 7), numbered("C2", 7), numbered("C3", 7)];
    expect(validateRun(tiles).valid).toBe(false);
    expect(validateSet(tiles)).toMatchObject({ valid: true, kind: "group", value: 7 });
  });

  it("reports invalid_set when neither interpretation is valid", () => {
    const tiles = [numbered("C1", 1), numbered("C2", 5), numbered("C3", 9)];
    expect(validateSet(tiles)).toEqual({ valid: false, reason: "invalid_set" });
  });
});
