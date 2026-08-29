import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  confirmDraft,
  ingestReceipt,
  ignoreDraft,
  rejectDraft,
  type OcrCaptureInput,
  type OcrDraftEdits,
} from "../lib/ocr/ocr-ingest.js";
import {
  listPendingDrafts,
  type OcrDraftRecord,
} from "../lib/ocr/ocr-store.js";
import { syncEngine } from "../lib/offline/index.js";

interface OcrContextValue {
  /** Pending (awaiting review) receipt drafts. */
  pending: OcrDraftRecord[];
  /** Count of unconfirmed receipt drafts still awaiting review. */
  capturedCount: number;
  refresh: () => Promise<void>;
  ingest: (input: OcrCaptureInput) => Promise<boolean>;
  confirm: (record: OcrDraftRecord, edits?: OcrDraftEdits) => Promise<boolean>;
  reject: (id: string) => Promise<void>;
  ignore: (id: string) => Promise<void>;
  busy: boolean;
}

const OcrContext = createContext<OcrContextValue | null>(null);

export function useOcr(): OcrContextValue {
  const ctx = useContext(OcrContext);
  if (!ctx) throw new Error("useOcr must be used within OcrProvider");
  return ctx;
}

export function OcrProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<OcrDraftRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await listPendingDrafts());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ingest = useCallback(
    async (input: OcrCaptureInput) => {
      const result = await ingestReceipt(input);
      await refresh();
      return result.captured;
    },
    [refresh],
  );

  const confirm = useCallback(
    async (record: OcrDraftRecord, edits?: OcrDraftEdits) => {
      setBusy(true);
      try {
        const res = await confirmDraft(record, edits);
        if (!res) return false;
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

  const value = useMemo<OcrContextValue>(
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

  return <OcrContext.Provider value={value}>{children}</OcrContext.Provider>;
}
