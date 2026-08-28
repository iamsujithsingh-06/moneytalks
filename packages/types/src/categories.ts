import type {
  CreateCategoryInput,
  CategoryDeleteInput,
  CreatePaymentMethodInput,
  UpdateCategoryInput,
  UpdatePaymentMethodInput,
} from "@moneytalks/validation";

export type {
  CreateCategoryData,
  CreateCategoryInput,
  CategoryDeleteInput,
  CategoryListQuery,
  CategoryParams,
  UpdateCategoryData,
  UpdateCategoryInput,
} from "@moneytalks/validation";

export type {
  CreatePaymentMethodData,
  CreatePaymentMethodInput,
  PaymentMethodListQuery,
  PaymentMethodParams,
  UpdatePaymentMethodData,
  UpdatePaymentMethodInput,
} from "@moneytalks/validation";

export type CategoryCreateRequest = CreateCategoryInput;
export type CategoryUpdateRequest = UpdateCategoryInput;
export type CategoryDeleteRequest = CategoryDeleteInput;

export type PaymentMethodCreateRequest = CreatePaymentMethodInput;
export type PaymentMethodUpdateRequest = UpdatePaymentMethodInput;

export interface CategoryPublic {
  id: string;
  userId: string;
  clientId: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  isPreset: boolean;
  isDefault: boolean;
  status: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

export interface PaymentMethodPublic {
  id: string;
  userId: string;
  clientId: string;
  name: string;
  kind: string;
  provider: string | null;
  maskedNumber: string | null;
  accountRef: string | null;
  isDefault: boolean;
  status: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  rev: number;
}
