import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { Tile } from "../src/tabletop/Tile.js";

// Tile relies on @dnd-kit's useDraggable, which requires a DndContext
// ancestor -- wrap every render the same way the real Table/Rack do.
function renderTile(ui: Parameters<typeof Tile>[0]) {
  return render(
    <DndContext>
      <Tile {...ui} />
    </DndContext>,
  );
}

describe("Tile", () => {
  it("labels a numbered tile with its color name and value -- not color alone (§10.3)", () => {
    renderTile({ tile: { kind: "numbered", tileId: "C1-7-a", color: "C1", value: 7 } });
    const button = screen.getByRole("button", { name: "Crimson 7" });
    expect(button).toBeInTheDocument();
  });

  it("labels a joker distinctly from any color", () => {
    renderTile({ tile: { kind: "joker", tileId: "J-a" } });
    expect(screen.getByRole("button", { name: "Joker" })).toBeInTheDocument();
  });

  it("reflects selection via aria-pressed", () => {
    renderTile({
      tile: { kind: "numbered", tileId: "C2-3-a", color: "C2", value: 3 },
      selected: true,
    });
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("consumes the shared --tile-color-* custom property instead of an inline hex (Phase 4 token plumbing)", () => {
    // packages/shared/src/branding.ts (via applyBrandingTokens.ts) is the
    // single source of truth for the four tile hex values -- this asserts
    // Tile.tsx reads that property rather than duplicating
    // TILE_COLOR_BY_CODE[...].hex directly into a `color` style.
    renderTile({ tile: { kind: "numbered", tileId: "C2-9-a", color: "C2", value: 9 } });
    const button = screen.getByRole("button", { name: "Cobalt 9" });
    expect(button.style.getPropertyValue("--tile-face-color")).toBe("var(--tile-color-C2)");
    expect(button.style.color).toBe("");
  });

  it("marks a joker tile with a distinct class instead of an inline color (Phase 4)", () => {
    renderTile({ tile: { kind: "joker", tileId: "J-a" } });
    const button = screen.getByRole("button", { name: "Joker" });
    expect(button.className).toContain("is-joker");
    expect(button.style.getPropertyValue("--tile-face-color")).toBe("");
  });

  it("reflects invalid and dragging state via classes, not inline color/border overrides", () => {
    renderTile({
      tile: { kind: "numbered", tileId: "C1-2-a", color: "C1", value: 2 },
      invalid: true,
    });
    const button = screen.getByRole("button", { name: "Crimson 2" });
    expect(button.className).toContain("is-invalid");
    expect(button.style.borderColor).toBe("");
  });

  it("calls onActivate when clicked", () => {
    // A plain fireEvent.click, not userEvent.click: userEvent simulates a
    // full realistic pointerdown/pointerup/click sequence, which routes
    // through dnd-kit's PointerSensor (attached via {...listeners}) and
    // jsdom's incomplete PointerEvent support (no setPointerCapture) before
    // ever reaching our onClick -- unrelated to what this test is actually
    // checking (that the click handler is wired up at all).
    let activated = false;
    renderTile({
      tile: { kind: "numbered", tileId: "C3-1-a", color: "C3", value: 1 },
      onActivate: () => {
        activated = true;
      },
    });
    fireEvent.click(screen.getByRole("button"));
    expect(activated).toBe(true);
  });
});
