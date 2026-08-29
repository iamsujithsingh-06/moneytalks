import { ShieldIcon } from "../components/ui/icons.js";

export function HomePage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="pb-4 pt-2">
        <h1 className="text-2xl font-bold text-text-primary">Home</h1>
        <p className="mt-1 text-sm text-text-muted">Your money, on the go.</p>
      </header>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShieldIcon size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">SMS-based capturing</p>
            <p className="mt-1 text-sm text-text-muted">
              Open <span className="font-medium text-text-secondary">Review</span> to approve
              transactions parsed from your messages. Everything stays on-device until you
              confirm.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
