import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { RedactedGameView } from "@tile-meld/shared";
import type { ConnectionState } from "../src/tabletop/useGame.js";

// Phase 8 -- tabletop information hierarchy. These tests target the NEW
// region structure and the prominence/visibility guarantees the phase
// requires; the pre-existing TabletopComputerTurn/TabletopPageRematch/
// TabletopPurgedGame test files (all still passing, unmodified) already
// cover Game Over/Rematch rendering and the unavailable-game state -- not
// duplicated here.

vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useParams: () => ({ gameId: "g1" }),
}));

vi.mock("../src/tabletop/RematchPanel.js", () => ({ RematchPanel: () => null }));

// Phase 7: emoji (connection indicator, BOT marker) are now inside their
// own aria-hidden <span> (decorative, redundant with adjacent text -- see
// TabletopStatus.tsx/OpponentStrip.tsx), so a target string that includes
// an emoji is split across sibling DOM nodes and plain getByText no
// longer matches (RTL's documented behavior for text split across
// elements, not a real accessibility regression -- the text is still
// fully present and visible, just no longer one text node). This is
// RTL's own recommended workaround: match on the element whose OWN full
// text satisfies the pattern, but whose children individually don't (so
// the innermost/most specific match wins over an ancestor).
function textAcrossElements(pattern: RegExp | string) {
  const re =
    typeof pattern === "string"
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      : pattern;
  return (_: string, element: Element | null) => {
    if (!element || !re.test(element.textContent ?? "")) return false;
    return Array.from(element.children).every((child) => !re.test(child.textContent ?? ""));
  };
}

const chatMountCount = { current: 0 };
vi.mock("../src/chat/ChatPanel.js", () => ({
  ChatPanel: () => {
    // A real mount-tracking side effect (not a render counter) -- this is
    // the actual proof that collapsing/expanding chat never remounts (and
    // therefore never resets) the panel: React only re-runs a
    // no-dependency-array effect once per real mount, never on a parent
    // re-render or a `hidden` attribute toggle.
    useEffect(() => {
      chatMountCount.current += 1;
    }, []);
    return <div data-testid="chat-panel-mock">chat</div>;
  },
}));

const useGameMock = vi.fn();
vi.mock("../src/tabletop/useGame.js", () => ({ useGame: () => useGameMock() }));

import { TabletopPage } from "../src/pages/TabletopPage.js";

function seat(overrides: Partial<RedactedGameView["self"]> = {}): RedactedGameView["self"] {
  return {
    seatIndex: 0,
    displayName: "Alice",
    rackCount: 2,
    status: "active",
    hasInitialMeld: false,
    isComputer: false,
    portraitId: null,
    rack: [
      { kind: "numbered", tileId: "C1-5-a", color: "C1", value: 5 },
      { kind: "numbered", tileId: "C1-6-a", color: "C1", value: 6 },
    ],
    ...overrides,
  };
}

function opponent(
  overrides: Partial<RedactedGameView["opponents"][number]> = {},
): RedactedGameView["opponents"][number] {
  return {
    seatIndex: 1,
    displayName: "Bob",
    rackCount: 9,
    status: "active",
    hasInitialMeld: false,
    isComputer: false,
    portraitId: null,
    ...overrides,
  };
}

function view(overrides: Partial<RedactedGameView> = {}): RedactedGameView {
  return {
    gameId: "g1",
    roomId: "r1",
    version: 3,
    table: [],
    poolCount: 40,
    activeSeat: 0,
    consecutivePasses: 0,
    status: "active",
    deadlineAt: null,
    turnId: "t1",
    winnerSeatIndex: null,
    self: seat(),
    opponents: [opponent()],
    ...overrides,
  };
}

function gameHook(overrides: Partial<ReturnType<typeof baseHook>> = {}) {
  return { ...baseHook(), ...overrides };
}

function baseHook() {
  return {
    view: view(),
    connectionState: "connected" as ConnectionState,
    reconnect: vi.fn(),
    banner: undefined as string | undefined,
    dismissBanner: vi.fn(),
    warningToast: undefined as string | undefined,
    dismissWarningToast: vi.fn(),
    notFound: false,
    commit: vi.fn(),
    draw: vi.fn(),
    pass: vi.fn(),
    resign: vi.fn(),
    isSocketActionError: () => false,
  };
}

function renderTabletop() {
  return render(
    <MemoryRouter>
      <TabletopPage />
    </MemoryRouter>,
  );
}

describe("TabletopPage layout -- status prominence (Phase 8)", () => {
  it("shows a prominent 'Your turn' H1 when it is the player's own turn", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0 }) }));
    renderTabletop();
    expect(screen.getByRole("heading", { level: 1, name: "Your turn" })).toBeInTheDocument();
  });

  it("shows a 'Waiting on seat N' H1 while waiting for the opponent", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 1 }) }));
    renderTabletop();
    expect(
      screen.getByRole("heading", { level: 1, name: "Waiting on seat 2" }),
    ).toBeInTheDocument();
  });

  it("keeps the deadline countdown visible during an active turn", () => {
    const deadlineAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0, deadlineAt }) }));
    renderTabletop();
    expect(screen.getByText(/remaining/)).toBeInTheDocument();
  });

  it("keeps the connection-state indicator visible", () => {
    useGameMock.mockReturnValue(gameHook({ connectionState: "disconnected" }));
    renderTabletop();
    expect(screen.getByText(textAcrossElements("🔴 Disconnected"))).toBeInTheDocument();
  });

  it("distinguishes actively reconnecting from a terminal disconnect (Phase 3 stabilization)", () => {
    useGameMock.mockReturnValue(gameHook({ connectionState: "reconnecting" }));
    renderTabletop();
    expect(screen.getByText(textAcrossElements("🟡 Reconnecting…"))).toBeInTheDocument();
    // No manual action offered while a retry is already in flight.
    expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
  });

  it("offers a manual Reconnect action only once the connection is terminally disconnected", async () => {
    const user = userEvent.setup();
    const reconnect = vi.fn();
    useGameMock.mockReturnValue(gameHook({ connectionState: "disconnected", reconnect }));
    renderTabletop();

    const button = screen.getByRole("button", { name: "Reconnect" });
    await user.click(button);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("does not offer a Reconnect action while connected", () => {
    useGameMock.mockReturnValue(gameHook({ connectionState: "connected" }));
    renderTabletop();
    expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
  });

  it("exposes the status region under a stable semantic label", () => {
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();
    expect(screen.getByRole("region", { name: "Game status" })).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- opponents (Phase 8)", () => {
  it("shows opponent rack counts without exposing rack contents", () => {
    useGameMock.mockReturnValue(
      gameHook({
        view: view({ opponents: [opponent({ displayName: "Bob", rackCount: 9 })] }),
      }),
    );
    renderTabletop();
    const opponents = screen.getByRole("list", { name: "Opponents" });
    // Name and meta are two separate lines now (name-truncation hierarchy
    // pass, so a long generated username can never push the tile count
    // out of the frame) -- asserted independently rather than as one
    // combined string.
    expect(within(opponents).getByText("Bob")).toBeInTheDocument();
    expect(within(opponents).getByText(/9 tiles/)).toBeInTheDocument();
    // Structurally there is no tile-content field on an opponent at all
    // (RedactedGameView["opponents"] has no `rack`) -- nothing to leak.
  });

  it("marks a resigned opponent and a computer opponent distinctly, in text", () => {
    useGameMock.mockReturnValue(
      gameHook({
        view: view({
          opponents: [
            opponent({ seatIndex: 1, displayName: "Resigned Bob", status: "resigned" }),
            opponent({ seatIndex: 2, displayName: "Computer", isComputer: true }),
          ],
        }),
      }),
    );
    renderTabletop();
    expect(screen.getByText("Resigned Bob")).toBeInTheDocument();
    expect(screen.getByText(/\d+ tiles \(resigned\)/)).toBeInTheDocument();
    expect(screen.getByText("Computer")).toBeInTheDocument();
    expect(screen.getByText(textAcrossElements(/🤖\s*\d+ tiles/))).toBeInTheDocument();
  });

  it("gives each opponent a decorative portrait without breaking list semantics or the name/status text (Phase 5)", () => {
    useGameMock.mockReturnValue(
      gameHook({
        view: view({
          opponents: [
            opponent({ seatIndex: 1, displayName: "Bob", rackCount: 9 }),
            opponent({ seatIndex: 2, displayName: "Computer", isComputer: true }),
          ],
        }),
      }),
    );
    renderTabletop();
    const opponents = screen.getByRole("list", { name: "Opponents" });
    // Still exactly 2 list items -- the portrait is inside each <li>, not
    // an extra sibling that would break `list.children.length`.
    expect(within(opponents).getAllByRole("listitem")).toHaveLength(2);
    // Queried by tag, not getByRole("img"): an <img alt=""> has an implicit
    // ARIA role of "presentation"/"none" (correct decorative behavior),
    // so it deliberately does not match role "img".
    const images = opponents.querySelectorAll("img");
    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img).toHaveAttribute("alt", "");
    }
    // Text identity/state is unchanged and still present alongside the portrait.
    // Both fixtures default to rackCount 9, so "9 tiles" legitimately
    // appears twice here -- assert presence, not uniqueness.
    expect(within(opponents).getByText("Bob")).toBeInTheDocument();
    expect(within(opponents).getAllByText(/9 tiles/).length).toBeGreaterThan(0);
    expect(within(opponents).getByText("Computer")).toBeInTheDocument();
    expect(within(opponents).getByText(textAcrossElements(/🤖/))).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- board and rack regions (Phase 8)", () => {
  it("the board region contains the current table sets", () => {
    useGameMock.mockReturnValue(
      gameHook({
        view: view({
          table: [[{ kind: "numbered", tileId: "C1-5-a", color: "C1", value: 5 }]],
        }),
      }),
    );
    renderTabletop();
    const board = screen.getByTestId("tabletop-board");
    expect(within(board).getByRole("heading", { name: "Table" })).toBeInTheDocument();
    expect(within(board).getByText(/^Set 1 --/)).toBeInTheDocument();
  });

  it("the rack region contains the player's rack", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ self: seat({ rackCount: 2 }) }) }));
    renderTabletop();
    const rack = screen.getByTestId("tabletop-rack");
    expect(within(rack).getByRole("heading", { name: "Your rack (2)" })).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- actions (Phase 8)", () => {
  it("all current actions remain available in a labelled action group", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0 }) }));
    renderTabletop();
    const actions = screen.getByRole("group", { name: "Game actions" });
    for (const name of ["Undo", "Reset turn", "Draw tile", "Pass", "Commit turn", "Resign"]) {
      expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("resign confirmation still works", async () => {
    const user = userEvent.setup();
    useGameMock.mockReturnValue(gameHook({ view: view({ activeSeat: 0 }) }));
    renderTabletop();

    await user.click(screen.getByRole("button", { name: "Resign" }));
    expect(screen.getByText("Resign for good?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm resign" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Resign for good?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resign" })).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- feedback (Phase 8)", () => {
  it("initial-meld progress remains available during an active turn before the meld", () => {
    useGameMock.mockReturnValue(
      gameHook({ view: view({ activeSeat: 0, self: seat({ hasInitialMeld: false }) }) }),
    );
    renderTabletop();
    expect(screen.getByText(/Initial meld progress: \d+ \/ 30/)).toBeInTheDocument();
  });

  it("a general connection/game error banner remains visible", () => {
    useGameMock.mockReturnValue(gameHook({ banner: "Something went wrong" }));
    renderTabletop();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("a turn-warning toast remains visible", () => {
    useGameMock.mockReturnValue(gameHook({ warningToast: "5 minute(s) left on your turn." }));
    renderTabletop();
    expect(screen.getByText(/5 minute\(s\) left on your turn\./)).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- chat disclosure (Phase 8)", () => {
  it("chat toggles accessibly, exposing its expanded/collapsed state", async () => {
    chatMountCount.current = 0;
    const user = userEvent.setup();
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();

    // Collapsed by default (visual-composition pass: chat must not
    // compete with the game for attention -- see .tabletop-info-rail in
    // global.css) -- still fully expandable via this same toggle, and the
    // panel is hidden, not unmounted, so no chat state is ever lost.
    const toggle = screen.getByRole("button", { name: /chat/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Hide chat" })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Show chat" })).toBeInTheDocument();
  });

  it("chat state survives collapse/expand -- the panel is hidden, not unmounted", async () => {
    chatMountCount.current = 0;
    const user = userEvent.setup();
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();

    expect(chatMountCount.current).toBe(1);
    const toggle = screen.getByRole("button", { name: /chat/i });

    await user.click(toggle); // collapse
    await user.click(toggle); // expand
    await user.click(toggle); // collapse again

    expect(chatMountCount.current).toBe(1); // never remounted
  });

  it("the chat region is present under a stable test hook", () => {
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();
    expect(screen.getByTestId("tabletop-chat")).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- progressive rule help (Phase 6 stabilization)", () => {
  it("offers a collapsed-by-default How to play disclosure, never a mandatory tutorial", () => {
    useGameMock.mockReturnValue(gameHook());
    renderTabletop();
    const summary = screen.getByText("How to play");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    // Native <details> defaults to closed -- no `open` attribute.
    expect(details).not.toHaveAttribute("open");
    // The rule text itself is still real DOM content once opened, not an
    // image -- get it via the accessible list inside, scoped to this
    // element so it doesn't collide with unrelated page text.
    expect(within(details!).getByText(/Be the first to empty your rack/)).toBeInTheDocument();
  });
});

describe("TabletopPage layout -- artwork stays decorative-only (Phase 8, updated Phase 5)", () => {
  // Originally "zero <img> elements at all" (Phase 8, before any tabletop
  // artwork existed). Phase 5 deliberately adds decorative opponent
  // portraits to OpponentStrip, so the assertion that actually matters --
  // nothing required for correct rendering, no image can carry meaning on
  // its own -- now means "every <img> present is decorative" instead of
  // "no <img> is present at all". Reserved Phase 8/9 board artwork
  // (docs/tabletop-layout-contract.md) still doesn't exist yet.
  it('every <img> rendered is purely decorative (alt="")', () => {
    useGameMock.mockReturnValue(gameHook());
    const { container } = renderTabletop();
    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThan(0); // the opponent-strip portrait
    for (const img of images) {
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("renders the completed-game state the same way -- decorative-only artwork, nothing required", () => {
    useGameMock.mockReturnValue(gameHook({ view: view({ status: "completed" }) }));
    const { container } = renderTabletop();
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("alt")).toBe("");
    }
    expect(screen.getByRole("heading", { level: 1, name: "Game over" })).toBeInTheDocument();
  });
});
