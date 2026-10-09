import { apiRequest } from "./client";
import type { UserSummary } from "./types";

export function login(email: string, password: string): Promise<UserSummary> {
  return apiRequest<UserSummary>("/auth/login", { method: "POST", body: { email, password } });
}

export function logout(): Promise<void> {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function me(signal?: AbortSignal): Promise<UserSummary> {
  return apiRequest<UserSummary>("/auth/me", { signal });
}
