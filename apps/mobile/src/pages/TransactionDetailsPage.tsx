import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useLedger } from "../state/ledger-context.js";
import { useSync } from "../state/sync-context.js";
import { Money } from "../components/ui/Money.js";
import { Badge } from "../components/ui/Badge.js";
import { PageLoader } from "../components/ui/feedback.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { ArrowUpIcon, ChevronLeftIcon } from "../components/ui/icons.js";
import {
  formatFullDateTime,
  formatPartyName,
  formatSourceLabel,
  formatTime,
  formatTransactionLine,
  isAutoTransaction,
  signedMinorAmount,
} from "../lib/format.js";
import {
  transactionSyncStatus,
  transactionSyncStatusLabel,
  transactionSyncStatusTone,
  type TransactionSyncStatus,
} from "../lib/ledger/sync-status.js";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-sm text-text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function TransactionDetailsPage() {
  const { transactionId } = useParams();
  const { transactions, loading, refresh } = useLedger();
  const { snapshot } = useSync();
  const [syncStatus, setSyncStatus] = useState<TransactionSyncStatus>("synced");

  const txn = useMemo(
    () => transactions.find((t) => t.clientId === decodeURIComponent(transactionId ?? "")),
    [transactions, transactionId],
  );

  useEffect(() => {
    setSyncStatus("synced");
    if (!txn) return;
    void transactionSyncStatus(txn.clientId).then(setSyncStatus);
  }, [txn]);

  if (loading && !txn) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-8">
        <PageLoader label="Loading transaction…" />
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-8">
        <div className="flex items-center justify-between pb-4 pt-2">
          <h1 className="text-2xl font-bold text-text-primary">Transaction</h1>
        </div>
        <EmptyState
          icon={<ArrowUpIcon size={26} />}
          title="Transaction not found"
          description="It may have been removed or cleared from this device."
          action={
            <Link className="text-sm font-medium text-primary" to="/transactions">
              Back to transactions
            </Link>
          }
        />
      </div>
    );
  }

  const income = txn.type === "income" || txn.type === "refund";
  const directionLabel = income ? "Money received" : "Money sent";
  const party = formatPartyName(txn);
  const auto = isAutoTransaction(txn);
  const note = nullableText(txn.note);
  const reference = nullableText(txn.accountRef);
  const merchant = nullableText(txn.merchant);
  const counterparty = nullableText(txn.counterparty);
  const categoryId = nullableText(txn.categoryId);
  const paymentMethodId = nullableText(txn.paymentMethodId);
  const trustLabel = auto ? "Auto-detected" : "Manual entry";
  const detectionDetail =
    txn.confidence != null && txn.confidence > 0
      ? `${trustLabel} · ${Math.round(txn.confidence * 100)}% confidence`
      : trustLabel;

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="flex items-center gap-1 pb-2 pt-2">
        <Link
          to="/transactions"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-text-secondary transition-colors hover:bg-raised hover:text-text-primary"
        >
          <ChevronLeftIcon size={18} />
          Back
        </Link>
        <span className="text-sm font-medium text-text-muted">Transaction details</span>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge tone={income ? "positive" : "negative"}>{directionLabel}</Badge>
            {auto ? <Badge tone="primary">Auto</Badge> : <Badge tone="secondary">Manual</Badge>}
          </div>
          <Badge tone={transactionSyncStatusTone[syncStatus]}>
            {transactionSyncStatusLabel[syncStatus]}
          </Badge>
        </div>

        <p className="mt-4 text-lg font-semibold text-text-primary">{party}</p>
        <p className="mt-0.5 text-sm text-text-muted">{formatTransactionLine(txn)}</p>

        <Money
          amountMinor={signedMinorAmount(txn.type, txn.direction, txn.amountMinor)}
          currency={txn.currency}
          signed
          size="lg"
          tone={income ? "positive" : "negative"}
          className="mt-4"
        />
      </section>

      <section className="mt-4 rounded-xl border border-border bg-surface px-4 py-1">
        <dl className="divide-y divide-border">
          <Row label="Date">{formatFullDateTime(txn.transactionDate, txn.updatedAt)}</Row>
          <Row label="Time">{formatTime(txn.updatedAt).toUpperCase() || "—"}</Row>
          <Row label="Source">{formatSourceLabel(txn) || "—"}</Row>
          <Row label="Detection">{detectionDetail}</Row>
          {merchant ? <Row label="Merchant">{merchant}</Row> : null}
          {counterparty ? <Row label="Counterparty">{counterparty}</Row> : null}
          {note ? <Row label="Note">{note}</Row> : null}
          {categoryId ? <Row label="Category">{categoryId}</Row> : null}
          {paymentMethodId ? <Row label="Payment method">{paymentMethodId}</Row> : null}
          {reference ? <Row label="Reference">{reference}</Row> : null}
          <Row label="Type">{txn.type || "—"}</Row>
          {txn.tags && txn.tags.length > 0 ? (
            <Row label="Tags">{txn.tags.join(", ")}</Row>
          ) : null}
        </dl>
      </section>

      {snapshot.status === "failed" || snapshot.status === "conflict" || snapshot.status === "offline" ? (
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 w-full rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:border-primary hover:text-primary"
        >
          Refresh sync status
        </button>
      ) : null}
    </div>
  );
}
