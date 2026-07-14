import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// A single shared aria-live region (§10.3: "aria-live announcements for
// turn start, deadline warning, timeout, penalty, validation errors, and
// game over"). Screen-reader users get these without needing to be
// visually focused on the tabletop. Repeating the same message twice in a
// row wouldn't otherwise re-announce (many screen readers only announce on
// text change) -- appending a zero-width counter sidesteps that.

type AnnouncerContextValue = {
  readonly announce: (message: string) => void;
};

const AnnouncerContext = createContext<AnnouncerContextValue | undefined>(undefined);

export function AnnouncerProvider({ children }: { readonly children: ReactNode }) {
  const [message, setMessage] = useState("");
  const counter = useRef(0);

  const announce = useCallback((text: string) => {
    counter.current += 1;
    setMessage(`${text}${"​".repeat(counter.current % 2)}`);
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <div role="status" aria-live="polite" className="visually-hidden">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerContextValue {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) throw new Error("useAnnouncer must be used within an AnnouncerProvider");
  return ctx;
}
