import { usePushSubscription } from "./usePushSubscription.js";

/** Player-wide (not per-game) push-notification toggle -- lives in the
 * layout header since a subscription isn't scoped to any one room/game. */
export function NotificationsControl() {
  const { state, error, subscribe, unsubscribe } = usePushSubscription();

  if (state === "checking" || state === "unsupported" || state === "unavailable") return null;

  return (
    <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
      <div className="row">
        {state === "subscribed" && (
          <button onClick={() => void unsubscribe()}>🔔 Notifications on</button>
        )}
        {state === "default" && (
          <button onClick={() => void subscribe()}>🔕 Enable notifications</button>
        )}
        {state === "denied" && (
          <span className="muted">🔕 Notifications blocked in this browser</span>
        )}
      </div>
      {state === "default" && (
        <span
          className="muted"
          style={{ fontSize: "0.75rem", maxWidth: "16rem", textAlign: "right" }}
        >
          On iPhone/iPad: add this app to your Home Screen first (Share → Add to Home Screen) --
          Safari tabs can't receive background notifications.
        </span>
      )}
      {error && (
        <span className="muted" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
