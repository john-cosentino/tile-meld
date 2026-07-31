import { useMemo, useState } from "react";
import { useParams, Link } from "react-router";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { INITIAL_MELD_THRESHOLD, PRODUCT_NAME } from "@tile-meld/shared";
import { useGame } from "../tabletop/useGame.js";
import { useDraftState } from "../tabletop/useDraftState.js";
import type { Destination } from "../tabletop/draftState.js";
import type { TileFace } from "../tabletop/Tile.js";
import { Rack } from "../tabletop/Rack.js";
import { Table } from "../tabletop/Table.js";
import { RematchPanel } from "../tabletop/RematchPanel.js";
import { TabletopStatus } from "../tabletop/TabletopStatus.js";
import { OpponentStrip } from "../tabletop/OpponentStrip.js";
import { TabletopMasthead } from "../tabletop/TabletopMasthead.js";
import { ActionIcon } from "../tabletop/ActionIcon.js";
import { ChromeIcon } from "../tabletop/ChromeIcon.js";
import mascotTipIconSrc from "../assets/tabletop-production/sidebar/mascot-tip-icon.png";
import {
  hintForSet,
  runningInitialMeldTotal,
  validateProposedTurn,
} from "../tabletop/hintEngine.js";
import { ChatPanel } from "../chat/ChatPanel.js";

function parseZoneId(id: string): Destination | undefined {
  if (id === "rack") return { zone: "rack" };
  if (id === "new-set") return { zone: "new-set" };
  if (id.startsWith("set:")) return { zone: "set", setId: id.slice(4) };
  return undefined;
}

export function TabletopPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const game = useGame(gameId!);
  const { view } = game;
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [confirmingResign, setConfirmingResign] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  // Collapsed by default on every viewport (visual-composition pass: chat
  // must not compete with the game for attention -- it now lives in the
  // compact info rail, not the primary column) -- a one-tap toggle still
  // fully expands it. `hidden` (not conditional rendering) below keeps
  // ChatPanel mounted so collapsing never loses chat state.
  const [chatOpen, setChatOpen] = useState(false);

  // Without an activation distance, dnd-kit's default PointerSensor treats
  // *any* pointerdown+pointerup -- even a plain click with zero movement --
  // as a completed drag, which both swallows the click event (breaking
  // click/tap selection, a hard accessibility requirement per §10.2/10.3)
  // and fires onDragEnd with `over` resolving to whatever droppable the
  // pointer never left, silently reordering the rack. A small distance
  // threshold lets a real click and a real drag coexist on the same tile.
  //
  // No KeyboardSensor: Tile is already a native <button onClick>, so Enter
  // and Space activate it (select/deselect) for free via the DOM's default
  // button behavior -- the click/tap-and-keyboard path Tile.tsx documents
  // as additive to drag-and-drop. dnd-kit's KeyboardSensor claims Enter and
  // Space as its own drag-start/drop keys and calls preventDefault() on
  // them (its default keyboardCodes), which silently swallowed the
  // button's native activation before a keyboard user's press ever reached
  // onClick -- confirmed live: aria-pressed never toggled on a real Enter
  // keypress. Nothing exercises dnd-kit's arrow-key-driven keyboard drag
  // (the click-to-select/click-to-place path is the documented keyboard
  // alternative), so removing it only restores the button's own behavior.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const resolve = useMemo((): ((tileId: string) => TileFace) => {
    const map = new Map<string, TileFace>();
    if (view) {
      for (const tile of view.self.rack) map.set(tile.tileId, tile as TileFace);
      for (const set of view.table) for (const tile of set) map.set(tile.tileId, tile as TileFace);
    }
    return (tileId: string) => map.get(tileId) ?? { kind: "joker", tileId };
  }, [view]);

  const canonicalRackIds = useMemo(() => view?.self.rack.map((t) => t.tileId) ?? [], [view]);
  const canonicalTableIds = useMemo(
    () => view?.table.map((set) => set.map((t) => t.tileId)) ?? [],
    [view],
  );

  const { draft, moveTile, reorderInSet, reorderRack, reset, undo, canUndo } = useDraftState(
    canonicalRackIds,
    canonicalTableIds,
    view?.version ?? -1,
  );

  const proposedTable = useMemo(
    () => draft.sets.map((s) => s.tileIds.map((id) => resolve(id))),
    [draft.sets, resolve],
  );
  const canonicalTable = useMemo(() => (view ? view.table : []), [view]);

  const turnValidation = useMemo(() => {
    if (!view) return undefined;
    return validateProposedTurn(
      view.self.rack,
      view.self.hasInitialMeld,
      view.self.seatIndex,
      view.opponents.length + 1,
      canonicalTable,
      proposedTable,
    );
  }, [view, canonicalTable, proposedTable]);

  const meldTotal = useMemo(
    () => runningInitialMeldTotal(canonicalTable, proposedTable),
    [canonicalTable, proposedTable],
  );

  if (game.notFound) {
    return (
      <div className="stack">
        <h1 className="visually-hidden">{PRODUCT_NAME}</h1>
        <p>This game doesn't exist, or you're not seated in it.</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="stack">
        <h1 className="visually-hidden">{PRODUCT_NAME}</h1>
        <p>Loading table…</p>
      </div>
    );
  }

  const isMyTurn = view.status === "active" && view.self.seatIndex === view.activeSeat;
  const activeOpponent = view.opponents.find((o) => o.seatIndex === view.activeSeat);
  const computerIsPlaying =
    view.status === "active" && !isMyTurn && activeOpponent?.isComputer === true;
  const draftChanged =
    draft.rack.join(",") !== canonicalRackIds.join(",") ||
    draft.sets.length !== canonicalTableIds.length;

  function onDragEnd(event: DragEndEvent): void {
    const overId = event.over?.id;
    if (!overId) return;
    const destination = parseZoneId(String(overId));
    if (destination) moveTile(String(event.active.id), destination);
  }

  function onSelectTile(tileId: string): void {
    setSelectedTileId((prev) => (prev === tileId ? null : tileId));
  }

  function onActivateZone(destination: Destination): void {
    if (!selectedTileId) return;
    moveTile(selectedTileId, destination);
    setSelectedTileId(null);
  }

  function setValidity(setId: string): {
    validity: "valid" | "invalid" | "neutral";
    label: string;
  } {
    const set = draft.sets.find((s) => s.id === setId);
    if (!set) return { validity: "neutral", label: "" };
    return hintForSet(set.tileIds.map((id) => resolve(id)));
  }

  async function handleCommit(): Promise<void> {
    setActionError(undefined);
    try {
      const ack = await game.commit(draft.sets.map((s) => s.tileIds));
      if (!ack) {
        setActionError("Not your turn.");
        return;
      }
      if (ack.event.type === "invalid_commit") {
        setActionError(
          `That arrangement isn't valid -- 3 penalty tiles were drawn and your turn ended.`,
        );
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not commit.");
    }
  }

  async function handleDraw(): Promise<void> {
    setActionError(undefined);
    try {
      await game.draw();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not draw.");
    }
  }

  async function handlePass(): Promise<void> {
    setActionError(undefined);
    try {
      await game.pass();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not pass.");
    }
  }

  async function handleResign(): Promise<void> {
    setActionError(undefined);
    try {
      await game.resign();
      setConfirmingResign(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not resign.");
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="tabletop-shell stack">
        <TabletopMasthead />

        {game.banner && (
          <div className="error-banner" role="alert">
            {game.banner} <button onClick={game.dismissBanner}>Dismiss</button>
          </div>
        )}
        {game.warningToast && (
          <div className="warning-banner" role="status">
            <span aria-hidden="true">⏰</span> {game.warningToast}{" "}
            <button onClick={game.dismissWarningToast}>Dismiss</button>
          </div>
        )}

        {view.status === "completed" && (
          <div className="card card--accent-gold stack" role="status">
            <RematchPanel roomId={view.roomId} gameId={gameId!} />
            <Link to="/">
              <button>Back to your rooms</button>
            </Link>
          </div>
        )}

        <div className="tabletop-arcade">
          <div className="tabletop-primary">
            <TabletopStatus
              view={view}
              connectionState={game.connectionState}
              isMyTurn={isMyTurn}
              computerIsPlaying={computerIsPlaying}
            />

            {/* No separate aria-label here -- Table.tsx already renders its
                own "Table" <h2>, and duplicating that name on this wrapper
                would just create two identically-named landmarks nested
                inside each other. data-testid is a stable, a11y-tree-inert
                hook for tests that need to scope queries to "inside the
                board" specifically (Phase 8: docs/tabletop-layout-contract.md). */}
            <div className="tabletop-board stack" data-testid="tabletop-board">
              <span className="muted tabletop-pool-count">Pool: {view.poolCount} tiles</span>
              <Table
                sets={draft.sets}
                resolve={resolve}
                selectedTileId={selectedTileId}
                onSelectTile={onSelectTile}
                onActivateZone={onActivateZone}
                onReorder={(setId, tileId, direction) => reorderInSet(setId, tileId, direction)}
                setValidity={setValidity}
              />
            </div>

            {/* Same reasoning as tabletop-board -- Rack.tsx's own heading
                and its DropZone's aria-label="Your rack" are already the
                stable accessible names here; data-testid is test-only. */}
            <div className="tabletop-rack" data-testid="tabletop-rack">
              <Rack
                tileIds={draft.rack}
                resolve={resolve}
                selectedTileId={selectedTileId}
                onSelectTile={onSelectTile}
                onActivateZone={() => onActivateZone({ zone: "rack" })}
                onReorder={reorderRack}
              />
            </div>
          </div>

          {/* One deliberate arcade control bar spanning the full width below
              both rails (matches the approved desktop concept's bottom bar).
              Two visually distinct clusters, positioned together as one
              region (not `space-between`, which read as "detached" -- see
              .tabletop-actions in global.css): a muted utility cluster
              (Undo/Reset/Resign -- grouped so Resign never reads as
              stranded, but still spaced from Commit to avoid accidental
              activation) and the dominant primary cluster (Draw/Pass/
              Commit, Commit substantially larger and brighter -- see
              .plate-gold--commit in global.css). */}
          <div className="tabletop-actions" role="group" aria-label="Game actions">
            <div className="tabletop-actions-secondary" role="group" aria-label="Turn utilities">
              <button className="action-utility" disabled={!canUndo} onClick={undo}>
                Undo
              </button>
              <button className="action-utility" disabled={!draftChanged} onClick={reset}>
                Reset turn
              </button>
              {!confirmingResign ? (
                <button
                  className="action-utility action-utility--danger"
                  onClick={() => setConfirmingResign(true)}
                >
                  Resign
                </button>
              ) : (
                <span className="row">
                  <span>Resign for good?</span>
                  <button
                    className="action-utility action-utility--danger"
                    onClick={() => void handleResign()}
                  >
                    Confirm resign
                  </button>
                  <button className="action-utility" onClick={() => setConfirmingResign(false)}>
                    Cancel
                  </button>
                </span>
              )}
            </div>
            <div className="tabletop-actions-primary">
              <button
                className="plate-cyan"
                disabled={!isMyTurn || view.poolCount === 0}
                onClick={() => void handleDraw()}
              >
                <ActionIcon icon="draw" />
                Draw tile
              </button>
              <button
                className="plate-purple"
                disabled={!isMyTurn || view.poolCount > 0}
                onClick={() => void handlePass()}
              >
                <ActionIcon icon="pass" />
                Pass
              </button>
              <button
                className="plate-gold plate-gold--commit"
                disabled={!isMyTurn || draft.sets.length === 0}
                onClick={() => void handleCommit()}
              >
                <ActionIcon icon="commit" className="action-icon action-icon--commit" />
                Commit turn
              </button>
            </div>
          </div>

          {/* .tabletop-rail wraps the competitor rail + compact info rail
              (meld progress/hints/chat) as one unit. It's `display:contents`
              on every breakpoint except phone-landscape (global.css), so
              desktop/portrait each place OpponentStrip and the info rail
              independently via their own grid-area exactly as before --
              this wrapper only exists so landscape can turn them into one
              tight-fitting column instead of two items stretched to match
              the board's much taller row (the dead-space problem this
              review flagged). Placed after actions in the DOM (not
              alongside OpponentStrip's old position before the board) so
              the chat toggle -- the only focusable control in this
              wrapper, since competitor cards are decorative text/images
              only -- keeps its place at the END of tab order, after the
              actual game controls; this has zero effect on visual/grid
              position at any breakpoint. */}
          <div className="tabletop-rail">
            <OpponentStrip
              self={view.self}
              opponents={view.opponents}
              activeSeat={view.activeSeat}
              gameStatus={view.status}
            />

            <div className="tabletop-info-rail">
              <div className="tabletop-feedback">
                {actionError && (
                  <div className="error-banner" role="alert">
                    {actionError}
                  </div>
                )}
                {!view.self.hasInitialMeld && view.status === "active" && (
                  <p className="muted">
                    Initial meld progress: {meldTotal} / {INITIAL_MELD_THRESHOLD}
                  </p>
                )}
                {turnValidation && !turnValidation.valid && draftChanged && (
                  <p className="muted" role="status">
                    Hint: this arrangement wouldn't be accepted yet (
                    {turnValidation.reason.replaceAll("_", " ")}).
                  </p>
                )}
                {isMyTurn && (
                  <div className="tabletop-tip">
                    <img
                      src={mascotTipIconSrc}
                      alt=""
                      aria-hidden="true"
                      className="tabletop-mascot-icon"
                    />
                    <p className="muted">
                      Committing an arrangement the server rejects costs a 3-tile penalty and ends
                      your turn -- check the hints above before committing.
                    </p>
                  </div>
                )}
              </div>

              <div className="tabletop-chat" data-testid="tabletop-chat">
                <button
                  type="button"
                  className="tabletop-chat-toggle"
                  aria-expanded={chatOpen}
                  aria-controls="tabletop-chat-panel"
                  onClick={() => setChatOpen((v) => !v)}
                >
                  {chatOpen ? "Hide chat" : "Show chat"}
                </button>
                <div id="tabletop-chat-panel" hidden={!chatOpen}>
                  <ChatPanel gameId={gameId!} readOnly={view.status === "completed"} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="tabletop-footer" aria-hidden="true">
          <ChromeIcon icon="lightning" />
          <span>{PRODUCT_NAME}</span>
          <ChromeIcon icon="stats" />
        </div>
      </div>
    </DndContext>
  );
}
