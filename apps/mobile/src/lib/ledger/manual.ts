import type { TransactionPublic } from "@moneytalks/types";
import { offlineStore } from "../offline/index.js";

/**
 * Manual (non-SMS) transaction entry for the SAME offline ledger that SMS/OCR
 * captures write to. Cash purchases and bills are the primary cases.
 */

export type ManualTransactionKind = "expense" | "income" | "refund";

export interface ManualTransactionInput {
  kind: ManualTransactionKind;
  amountMinor: number;
  currency?: string;
  transactionDate?: string;
  merchant?: string | null;
  note?: string | null;
}

export interface ManualTransactionError {
  field: "kind" | "amountMinor" | "transactionDate" | "merchant" | "form";
  message: string;
}

const KIND_TYPES: Record<ManualTransactionKind, string> = {
  expense: "expense",
  income: "income",
  refund: "refund",
};

/**
 * Validate + normalize a manual entry. Returns a normalized value whose fields
 * map directly onto the shared transaction create schema.
 */
export function validateManualInput(
  input: ManualTransactionInput,
):
  | {
      ok: true;
      value: Pick<Required<ManualTransactionInput>, "kind" | "amountMinor" | "currency" | "transactionDate"> & {
        merchant: string | null;
        note: string | null;
      };
    }
  | { ok: false; error: ManualTransactionError } {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return {
      ok: false,
      error: {
        field: "amountMinor",
        message: "Enter a valid amount greater than zero.",
      },
    };
  }
  const date = input.transactionDate ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      ok: false,
      error: { field: "transactionDate", message: "Use a valid date (YYYY-MM-DD)." },
    };
  }
  return {
    ok: true,
    value: {
      kind: input.kind,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "INR",
      transactionDate: date,
      merchant: input.merchant?.trim() || null,
      note: input.note?.trim() || null,
    },
  };
}

/**
 * Persist a manual entry into the offline `transactions` ledger. Returns the
 * created transaction (with clientId) so callers can trigger a sync.
 *
 * `direction` is intentionally NOT set here: the shared create schema forbids
 * an explicit direction except for transfer/adjustment, and the server derives
 * it from `type`. Local reads fall back to a type-derived direction.
 */
export async function createManualTransaction(
  input: ManualTransactionInput,
): Promise<{ doc: TransactionPublic; clientId: string }> {
  const validated = validateManualInput(input);
  if (!validated.ok) {
    throw new ManualTransactionValidationError(validated.error);
  }
  const { kind, amountMinor, currency, transactionDate, merchant, note } = validated.value;

  const payload: Record<string, unknown> = {
    type: KIND_TYPES[kind],
    source: "manual",
    status: "confirmed",
    amountMinor,
    currency,
    transactionDate,
    merchant,
    counterparty: null,
    note,
    tags: [],
    categoryId: null,
    paymentMethodId: null,
    accountRef: null,
    confidence: null,
    autoDetected: false,
    editedCount: 0,
  };

  const { doc, clientId } = await offlineStore.create("transactions", payload);
  return { doc: doc as unknown as TransactionPublic, clientId };
}

export class ManualTransactionValidationError extends Error {
  constructor(readonly validationError: ManualTransactionError) {
    super(validationError.message);
    this.name = "ManualTransactionValidationError";
  }
}
