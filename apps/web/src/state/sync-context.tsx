import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SyncEntity } from "@moneytalks/types";
import { syncEngine, type SyncSnapshot } from "../lib/offline/index.js";

interface SyncContextValue {
  snapshot: SyncSnapshot;
  triggerSync: () => Promise<void>;
  resolveKeepMine: (entity: SyncEntity, clientId: string) => Promise<void>;
  resolveKeepTheirs: (entity: SyncEntity, clientId: string) => Promise<void>;
  clearIssues: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    (listener) => {
      const unsubscribe = syncEngine.subscribe(listener);
      return unsubscribe;
    },
    () => syncEngine.getSnapshot(),
  );

  useEffect(() => {
    void syncEngine.start();
    return () => {
      void syncEngine.stop();
    };
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({
      snapshot,
      triggerSync: () => syncEngine.sync("manual"),
      resolveKeepMine: (entity, clientId) => syncEngine.resolveKeepMine(entity, clientId),
      resolveKeepTheirs: (entity, clientId) => syncEngine.resolveKeepTheirs(entity, clientId),
      clearIssues: () => syncEngine.clearIssues(),
    }),
    [snapshot],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
