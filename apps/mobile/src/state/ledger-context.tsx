import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  computeDashboardFromLedger,
  loadLedger,
  type DashboardData,
} from "../lib/ledger/dashboard.js";
import {
  createManualTransaction,
  ManualTransactionValidationError,
  type ManualTransactionInput,
} from "../lib/ledger/manual.js";
import { syncEngine } from "../lib/offline/index.js";
import type { TransactionPublic } from "@moneytalks/types";

interface LedgerContextValue {
  data: DashboardData | null;
  transactions: TransactionPublic[];
  loading: boolean;
  refresh: () => Promise<void>;
  addManual: (
    input: ManualTransactionInput,
  ) => Promise<
    | { ok: true; clientId: string }
    | { ok: false; error: ManualTransactionValidationError }
  >;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used within LedgerProvider");
  return ctx;
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<TransactionPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshedAt = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++refreshedAt.current;
    setLoading(true);
    try {
      const [ledger, computed] = await Promise.all([
        loadLedger(),
        computeDashboardFromLedger(),
      ]);
      // Only apply the freshest refresh result.
      if (run === refreshedAt.current) {
        setTransactions(ledger);
        setData(computed);
      }
    } finally {
      if (run === refreshedAt.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Re-read whenever the sync engine's snapshot changes (e.g. after a
    // confirm/sync transition) so the dashboard reflects new captures.
    const unsubscribe = syncEngine.subscribe(() => {
      void refresh();
    });
    return unsubscribe;
  }, [refresh]);

  const addManual = useCallback(
    async (input: ManualTransactionInput) => {
      try {
        const { clientId } = await createManualTransaction(input);
        await refresh();
        void syncEngine.sync("manual");
        return { ok: true as const, clientId };
      } catch (e) {
        if (e instanceof ManualTransactionValidationError) {
          return { ok: false as const, error: e };
        }
        throw e;
      }
    },
    [refresh],
  );

  const value = useMemo<LedgerContextValue>(
    () => ({ data, transactions, loading, refresh, addManual }),
    [data, transactions, loading, refresh, addManual],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}
