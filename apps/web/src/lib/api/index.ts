import { ApiClient } from "./client.js";
import type { ApiResources } from "./resources.js";
import { attachResources } from "./resources.js";

/** Singleton API client with typed resource clients attached. */
export const apiClient = new ApiClient();
export const api: ApiResources = attachResources(apiClient);

export { ApiClient } from "./client.js";
export { ApiError } from "./http.js";
export type { AuthApi, LoginInput, RegisterInput } from "./client.js";
export type { RequestOptions, QueryValue, ResponseEnvelope, ApiErrorDetail } from "./http.js";
export type { ApiResources } from "./resources.js";
export { API_BASE_URL } from "./client.js";
