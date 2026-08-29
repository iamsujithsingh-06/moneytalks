import { ApiClient } from "./client.js";

/** Singleton API client (auth + refresh handled internally). */
export const apiClient = new ApiClient();

export { ApiClient } from "./client.js";
export { ApiError } from "./http.js";
export type { AuthApi, LoginInput, RegisterInput } from "./client.js";
export type { RequestOptions, QueryValue, ResponseEnvelope, ApiErrorDetail } from "./http.js";
export { API_BASE_URL } from "./client.js";
