import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  clearStoredDemo,
  hasStoredDemo,
  resumeDemoSession,
  type DemoHistoryEntry,
  type DemoPosition,
  type DemoSession,
} from "@/lib/demoSession";

interface DemoContextValue {
  /** True while a demo session is active — the whole app is read-only. */
  isDemo: boolean;
  /** Still resolving a stored token on first paint. */
  resolving: boolean;
  label: string;
  expiresAt: number | null;
  portfolio: DemoPosition[];
  history: DemoHistoryEntry[];
  adopt: (session: DemoSession) => void;
  exit: () => void;
}

const DemoContext = createContext<DemoContextValue>({
  isDemo: false,
  resolving: false,
  label: "Demo Workspace",
  expiresAt: null,
  portfolio: [],
  history: [],
  adopt: () => {},
  exit: () => {},
});

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [resolving, setResolving] = useState(hasStoredDemo());
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const exit = useCallback(() => {
    clearStoredDemo();
    setSession(null);
  }, []);

  const adopt = useCallback((next: DemoSession) => {
    setSession(next);
    setResolving(false);
  }, []);

  useEffect(() => {
    if (!hasStoredDemo()) return;
    let alive = true;
    resumeDemoSession().then((s) => {
      if (!alive) return;
      setSession(s);
      setResolving(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Hard expiry: the session ends itself the moment the token lapses.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!session) return;
    const ms = session.expiresAt - Date.now();
    if (ms <= 0) {
      exit();
      return;
    }
    timer.current = setTimeout(exit, ms);
    return () => clearTimeout(timer.current);
  }, [session, exit]);

  const value = useMemo<DemoContextValue>(
    () => ({
      isDemo: !!session,
      resolving,
      label: session?.label ?? "Demo Workspace",
      expiresAt: session?.expiresAt ?? null,
      portfolio: session?.portfolio ?? [],
      history: session?.history ?? [],
      adopt,
      exit,
    }),
    [session, resolving, adopt, exit]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  return useContext(DemoContext);
}

/**
 * Guard for any mutating action. Returns true when the interaction should be
 * blocked because the workspace is in demo (read-only) mode.
 */
export function useReadOnlyGuard() {
  const { isDemo } = useDemo();
  return isDemo;
}