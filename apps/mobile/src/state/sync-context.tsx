import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { syncEngine, type SyncSnapshot } from "../lib/offline/index.js";
import type { SyncEntity } from "@moneytalks/types";

interface SyncContextValue {
  snapshot: SyncSnapshot;
  triggerSync: () => void;
  resolveKeepMine: (entity: SyncEntity, clientId: string) => void;
  resolveKeepTheirs: (entity: SyncEntity, clientId: string) => void;
  clearIssues: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(() => syncEngine.getSnapshot());

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(setSnapshot);
    void syncEngine.start();
    void syncEngine.refreshStatic();
    return () => {
      unsubscribe();
      void syncEngine.stop();
    };
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({
      snapshot,
      triggerSync: () => void syncEngine.sync("manual"),
      resolveKeepMine: (entity, clientId) => void syncEngine.resolveKeepMine(entity, clientId),
      resolveKeepTheirs: (entity, clientId) =>
        void syncEngine.resolveKeepTheirs(entity, clientId),
      clearIssues: () => void syncEngine.clearIssues(),
    }),
    [snapshot],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
