import { describe, expect, it } from "vitest";
import { resolveCommit, buildInfoFrom } from "../scripts/generate-build-info.mjs";

describe("generate-build-info -- resolveCommit", () => {
  it("prefers RENDER_GIT_COMMIT (the Render Docker build ARG) when present", () => {
    const commit = resolveCommit({ RENDER_GIT_COMMIT: "abc1234" }, () => {
      throw new Error("git should not be called when RENDER_GIT_COMMIT is set");
    });
    expect(commit).toBe("abc1234");
  });

  it("falls back to the injected git-rev-parse function when RENDER_GIT_COMMIT is unset", () => {
    const commit = resolveCommit({}, () => "def5678deadbeef");
    expect(commit).toBe("def5678deadbeef");
  });

  it("falls back to 'unknown' (never throws) when neither source is available -- a missing", () => {
    const commit = resolveCommit({}, () => {
      throw new Error("no .git in this build context");
    });
    expect(commit).toBe("unknown");
  });
});

describe("generate-build-info -- buildInfoFrom", () => {
  it("produces the expected shape with a 7-char short commit", () => {
    const info = buildInfoFrom({
      env: { RENDER_GIT_COMMIT: "ff6068cd947c2995347411d308319ba61e3767f6" },
      gitRevParse: () => {
        throw new Error("unused");
      },
      packageVersion: "0.0.0",
      now: new Date("2026-07-31T12:00:00.000Z"),
    });
    expect(info).toEqual({
      commit: "ff6068cd947c2995347411d308319ba61e3767f6",
      commitShort: "ff6068c",
      builtAt: "2026-07-31T12:00:00.000Z",
      version: "0.0.0",
    });
  });

  it("never leaks anything beyond commit/commitShort/builtAt/version -- no secrets, env vars, or paths", () => {
    const info = buildInfoFrom({
      env: { RENDER_GIT_COMMIT: "abc1234", SESSION_TOKEN_HMAC_SECRET: "should-never-appear" },
      gitRevParse: () => "unused",
      packageVersion: "0.0.0",
      now: new Date("2026-07-31T12:00:00.000Z"),
    });
    expect(Object.keys(info).sort()).toEqual(["builtAt", "commit", "commitShort", "version"]);
    expect(JSON.stringify(info)).not.toContain("should-never-appear");
  });

  it("keeps commitShort as 'unknown' (not a sliced 'unknown') when the commit itself is unknown", () => {
    const info = buildInfoFrom({
      env: {},
      gitRevParse: () => {
        throw new Error("no git");
      },
      packageVersion: "0.0.0",
      now: new Date("2026-07-31T12:00:00.000Z"),
    });
    expect(info.commit).toBe("unknown");
    expect(info.commitShort).toBe("unknown");
  });
});
