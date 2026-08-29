import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SmsMessage } from "@moneytalks/sms";
import {
  confirmDraft,
  ingestSms,
  rejectDraft,
  ignoreDraft,
  type SmsDraftEdits,
} from "../lib/sms/ingest.js";
import {
  listPendingDrafts,
  type SmsDraftRecord,
} from "../lib/sms/sms-store.js";
import { syncEngine } from "../lib/offline/index.js";

interface SmsContextValue {
  /** Pending (awaiting review) transaction drafts. */
  pending: SmsDraftRecord[];
  /** Any unconfirmed pending drafts remain captured but not yet synced. */
  capturedCount: number;
  refresh: () => Promise<void>;
  ingest: (message: SmsMessage) => Promise<boolean>;
  confirm: (record: SmsDraftRecord, edits?: SmsDraftEdits) => Promise<boolean>;
  reject: (id: string) => Promise<void>;
  ignore: (id: string) => Promise<void>;
  busy: boolean;
}

const SmsContext = createContext<SmsContextValue | null>(null);

export function useSms(): SmsContextValue {
  const ctx = useContext(SmsContext);
  if (!ctx) throw new Error("useSms must be used within SmsProvider");
  return ctx;
}

export function SmsProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<SmsDraftRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await listPendingDrafts());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ingest = useCallback(
    async (message: SmsMessage) => {
      const result = await ingestSms(message);
      await refresh();
      return result.captured;
    },
    [refresh],
  );

  const confirm = useCallback(
    async (record: SmsDraftRecord, edits?: SmsDraftEdits) => {
      setBusy(true);
      try {
        const res = await confirmDraft(record, edits);
        if (!res) return false;
        // Push the new transaction to the server immediately.
        void syncEngine.sync("manual");
        await refresh();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const reject = useCallback(
    async (id: string) => {
      await rejectDraft(id);
      await refresh();
    },
    [refresh],
  );

  const ignore = useCallback(
    async (id: string) => {
      await ignoreDraft(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<SmsContextValue>(
    () => ({
      pending,
      capturedCount: pending.length,
      refresh,
      ingest,
      confirm,
      reject,
      ignore,
      busy,
    }),
    [pending, busy, refresh, ingest, confirm, reject, ignore],
  );

  return <SmsContext.Provider value={value}>{children}</SmsContext.Provider>;
}
