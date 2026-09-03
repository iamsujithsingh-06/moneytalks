import { useEffect, useState } from "react";
import { useSmsCapture } from "../state/capture-context.js";
import { useSync } from "../state/sync-context.js";
import { useLedger } from "../state/ledger-context.js";
import { Badge } from "../components/ui/Badge.js";
import { Button } from "../components/ui/Button.js";
import { Field, Input } from "../components/ui/form.js";
import { syncStatusLabel } from "../lib/ledger/sync-label.js";
import {
  getInitialBalanceMinor,
  setInitialBalanceMinor,
} from "../lib/ledger/settings.js";
import {
  AlertIcon,
  MessageIcon,
  RefreshIcon,
  ShieldIcon,
  WalletIcon,
} from "../components/ui/icons.js";
import type { CapturePermissionState } from "../lib/sms/capture/index.js";

const PERMISSION_LABEL: Record<CapturePermissionState, string> = {
  granted: "Access granted",
  denied: "Access denied",
  prompt: "Permission needed",
  revoked: "Access revoked",
  unsupported: "Not available",
};

const PERMISSION_TONE: Record<
  CapturePermissionState,
  "positive" | "negative" | "warning" | "neutral"
> = {
  granted: "positive",
  denied: "negative",
  prompt: "warning",
  revoked: "negative",
  unsupported: "neutral",
};

export function SettingsPage() {
  const {
    enabled,
    setEnabled,
    native,
    state,
    requestNativePermission,
    refreshPermissions,
  } = useSmsCapture();
  const { snapshot, triggerSync } = useSync();
  const { data, refresh } = useLedger();
  const [busy, setBusy] = useState(false);
  const [initialBalance, setInitialBalance] = useState("");
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [balanceSaved, setBalanceSaved] = useState(false);

  useEffect(() => {
    getInitialBalanceMinor().then((minor) => {
      setInitialBalance(minor > 0 ? (minor / 100).toFixed(2) : "");
      setBalanceLoaded(true);
    });
  }, []);

  const permission: CapturePermissionState = native
    ? (state.permissions[native.id] ?? "prompt")
    : "unsupported";
  const pendingCount = data?.pendingSyncCount ?? snapshot.pendingCount;

  function amountToMinor(raw: string): number {
    const cleaned = raw.trim().replace(/[₹,\s]/g, "");
    if (cleaned === "") return 0;
    const value = Number(cleaned);
    return Math.round(value * 100);
  }

  async function handleSaveBalance() {
    const minor = amountToMinor(initialBalance);
    if (Number.isNaN(minor) || minor < 0) {
      setBalanceError("Enter a valid starting balance (0 or more).");
      return;
    }
    setBusy(true);
    setBalanceError(null);
    setBalanceSaved(false);
    try {
      await setInitialBalanceMinor(minor);
      setBalanceSaved(true);
      await refresh();
      void triggerSync();
    } catch (e) {
      setBalanceError(e instanceof Error ? e.message : "Could not save your balance.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="pb-4 pt-2">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">Control how MoneyTalks captures your money.</p>
      </header>

      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary">
              <WalletIcon size={18} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">Initial balance</p>
              <p className="text-sm text-text-muted">
                Your starting balance before tracked income and expenses. Your total balance is
                Initial Balance + Income − Expenses.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field label="Current balance" htmlFor="initial-balance">
                    <Input
                      id="initial-balance"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={initialBalance}
                      disabled={!balanceLoaded}
                      onChange={(e) => {
                        setInitialBalance(e.target.value);
                        setBalanceError(null);
                        setBalanceSaved(false);
                      }}
                    />
                  </Field>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void handleSaveBalance()}
                  loading={busy}
                  disabled={!balanceLoaded}
                >
                  Save balance
                </Button>
              </div>
              {balanceError ? (
                <p role="alert" className="mt-2 text-xs text-negative">
                  {balanceError}
                </p>
              ) : null}
              {balanceSaved ? (
                <p className="mt-2 text-xs text-positive">Balance saved and synced.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <MessageIcon size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Automatic transaction tracking
                </p>
                <p className="text-sm text-text-muted">
                  Detect and parse bank/UPI SMS so transactions appear for review automatically.
                </p>
              </div>
            </div>
            <ToggleCheckbox
              checked={enabled}
              onChange={(v) => setEnabled(v)}
              label={enabled ? "On" : "Off"}
            />
          </div>

          {enabled ? (
            <div className="mt-4 space-y-3 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">SMS permission</p>
                  <p className="text-sm text-text-muted">{PERMISSION_LABEL[permission]}</p>
                </div>
                {permission !== "granted" && permission !== "unsupported" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await requestNativePermission();
                        await refreshPermissions();
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Allow
                  </Button>
                ) : (
                  <Badge tone={PERMISSION_TONE[permission]}>{PERMISSION_LABEL[permission]}</Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
              <AlertIcon size={14} /> You can still paste an SMS or add a transaction manually.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                <RefreshIcon size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-text-primary">Sync</p>
                <p className="text-sm text-text-muted">
                  {pendingCount > 0
                    ? `${pendingCount} pending change${pendingCount > 1 ? "s" : ""}`
                    : "Everything is up to date."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={pendingCount > 0 ? "warning" : "positive"}>
                {syncStatusLabel(snapshot.status)}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => triggerSync()}>
                Sync now
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary">
              <ShieldIcon size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text-primary">Privacy</p>
              <p className="mt-1 text-sm text-text-muted">
                MoneyTalks reads SMS to detect your bank and UPI transactions. Raw message bodies
                stay on your device; only the parsed transaction is stored and synced — and only
                after you confirm it. OTP and security messages are never treated as transactions.
              </p>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            className="mt-4 w-full"
            onClick={() => setEnabled(false)}
            disabled={!enabled}
          >
            Turn off automatic tracking
          </Button>
        </section>
      </div>
    </div>
  );
}

function ToggleCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-raised border border-border-strong",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#0b0b12] transition-all",
          checked ? "left-6" : "left-1 bg-text-muted",
        ].join(" ")}
      />
    </button>
  );
}
