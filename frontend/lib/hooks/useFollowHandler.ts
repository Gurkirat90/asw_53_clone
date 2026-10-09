"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface FollowEvent {
  preventDefault: () => void;
  detail: { href?: string; external?: boolean };
}

/** Turns Cloudscape onFollow events (links, nav, breadcrumbs) into Next client navigation. */
export function useFollowHandler() {
  const router = useRouter();
  return useCallback(
    (event: FollowEvent) => {
      const href = event.detail.href;
      if (!href || event.detail.external) return;
      event.preventDefault();
      router.push(href);
    },
    [router],
  );
}
