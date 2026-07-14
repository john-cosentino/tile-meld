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
    const button = screen.getByRole("option", { name: "Crimson 7" });
    expect(button).toBeInTheDocument();
  });

  it("labels a joker distinctly from any color", () => {
    renderTile({ tile: { kind: "joker", tileId: "J-a" } });
    expect(screen.getByRole("option", { name: "Joker" })).toBeInTheDocument();
  });

  it("reflects selection via aria-selected", () => {
    renderTile({
      tile: { kind: "numbered", tileId: "C2-3-a", color: "C2", value: 3 },
      selected: true,
    });
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
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
    fireEvent.click(screen.getByRole("option"));
    expect(activated).toBe(true);
  });
});
