import { Link } from "react-router-dom";
import { Money } from "../ui/Money.js";
import {
  formatFullDateTime,
  formatPartyName,
  formatSourceLabel,
  formatTransactionLine,
  signedMinorAmount,
} from "../../lib/format.js";
import type { TransactionPublic } from "@moneytalks/types";

/**
 * Shared transaction row used by both the Transactions list and the Home
 * recent-transactions section. The party name is the primary title with the
 * signed amount prominent on the same line; the direction line, date • time
 * and Auto/Manual • payment-method metadata follow below. The whole row is
 * tappable and navigates to the transaction details route.
 */
export function TransactionRow({ txn }: { txn: TransactionPublic }) {
  const income = txn.type === "income" || txn.type === "refund";

  return (
    <Link
      to={`/transactions/${encodeURIComponent(txn.clientId)}`}
      className="block px-4 py-3 transition-colors hover:bg-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {formatPartyName(txn)}
        </p>
        <Money
          amountMinor={signedMinorAmount(txn.type, txn.direction, txn.amountMinor)}
          currency={txn.currency}
          signed
          size="md"
          tone={income ? "positive" : "negative"}
        />
      </div>
      <p className="mt-0.5 truncate text-xs text-text-muted">{formatTransactionLine(txn)}</p>
      <p className="mt-0.5 text-xs text-text-muted">
        {formatFullDateTime(txn.transactionDate, txn.updatedAt)}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">{formatSourceLabel(txn)}</p>
    </Link>
  );
}
