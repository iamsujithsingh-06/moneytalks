import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  DeviceInfoInput,
} from "@moneytalks/validation";

export type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  DeviceInfoInput,
} from "@moneytalks/validation";

export type RegisterRequest = RegisterInput;
export type LoginRequest = LoginInput;
export type RefreshRequest = RefreshInput;
export type LogoutRequest = LogoutInput;
export type DeviceInfo = DeviceInfoInput;

export interface UserPublic {
  id: string;
  email: string;
  name: string | null;
  status: string;
  emailVerified: boolean;
  defaultCurrency: string;
  createdAt: string;
}

export interface RegisterResponse {
  userId: string;
  emailVerified: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: UserPublic;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}
