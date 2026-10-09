"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { ErrorState, FullPageSpinner } from "@/components/feedback/states";
import { me } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/queryKeys";
import type { UserSummary } from "@/lib/api/types";
import { loginUrl } from "@/lib/auth/next";

const AuthContext = createContext<UserSummary | null>(null);

export function currentPathWithQuery(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Client-side session gate for console routes. GET /auth/me is the source of truth: a cookie's
 * presence alone never counts as signed in. 401 -> /login?next=...; network/5xx -> Retry.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: ({ signal }) => me(signal),
  });

  const unauthenticated = session.error instanceof ApiError && session.error.status === 401;

  useEffect(() => {
    if (unauthenticated) {
      const next = currentPathWithQuery();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      router.replace(loginUrl(next));
    }
  }, [unauthenticated, queryClient, router]);

  if (session.data) {
    return <AuthContext.Provider value={session.data}>{children}</AuthContext.Provider>;
  }
  if (session.isError && !unauthenticated) {
    return (
      <div style={{ padding: "48px 16px" }}>
        <ErrorState
          title="Unable to check your session"
          message={userMessage(session.error)}
          onRetry={() => void session.refetch()}
        />
      </div>
    );
  }
  return <FullPageSpinner label="Checking your session" />;
}

/** The signed-in user. Only valid inside AuthGate. */
export function useAuth(): UserSummary {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useAuth must be used inside AuthGate");
  return user;
}
