import type {
  CreateTransactionInput,
  TransactionListQueryData,
  UpdateTransactionInput,
} from "@moneytalks/validation";

export type {
  CreateTransactionData,
  CreateTransactionInput,
  TransactionListQueryData,
  TransactionListQueryInput,
  TransactionParams,
  UpdateTransactionData,
  UpdateTransactionInput,
} from "@moneytalks/validation";

export type TransactionCreateRequest = CreateTransactionInput;
export type TransactionUpdateRequest = UpdateTransactionInput;
export type TransactionListQuery = TransactionListQueryData;

export interface TransactionPublic {
  id: string;
  userId: string;
  clientId: string;
  type: string;
  direction: string;
  source: string;
  status: string;
  amountMinor: number;
  currency: string;
  transactionDate: string;
  merchant: string | null;
  counterparty: string | null;
  note: string | null;
  tags: string[];
  categoryId: string | null;
  paymentMethodId: string | null;
  accountRef: string | null;
  confidence: number | null;
  autoDetected: boolean;
  duplicateOf: string | null;
  duplicateGroup: string | null;
  editedCount: number;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

export interface TransactionListResult {
  items: TransactionPublic[];
  nextCursor: string | null;
  total: number;
}
