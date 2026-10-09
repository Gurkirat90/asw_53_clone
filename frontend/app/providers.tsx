"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { setUnauthenticatedHandler } from "@/lib/api/client";
import { isRetryableError } from "@/lib/api/errors";
import { currentPathWithQuery } from "@/lib/auth/AuthProvider";
import { loginUrl } from "@/lib/auth/next";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retry only transient failures (network/5xx), at most twice; never 4xx.
        retry: (failureCount, error) => isRetryableError(error) && failureCount < 2,
        refetchOnWindowFocus: false,
        staleTime: 10_000,
      },
      mutations: { retry: false },
    },
  });
}

/** Central 401 handling: an expired session anywhere clears data and goes to /login once. */
function UnauthenticatedHandler({ queryClient }: { queryClient: QueryClient }) {
  const router = useRouter();
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      const next = currentPathWithQuery();
      queryClient.clear();
      router.replace(loginUrl(next));
    });
    return () => setUnauthenticatedHandler(null);
  }, [queryClient, router]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <UnauthenticatedHandler queryClient={queryClient} />
      {children}
    </QueryClientProvider>
  );
}
