"use client";

import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { ReactNode } from "react";

import { useFollowHandler } from "@/lib/hooks/useFollowHandler";

/** Table empty slot for a collection that has no items yet. */
export function TableEmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <Box textAlign="center" color="inherit">
      <SpaceBetween size="xxs">
        <Box variant="strong" color="inherit">
          {title}
        </Box>
        <Box variant="p" color="inherit">
          {subtitle}
        </Box>
      </SpaceBetween>
      {action ? <Box margin={{ top: "s" }}>{action}</Box> : null}
    </Box>
  );
}

/** Table empty slot when search/filters exclude every item. */
export function TableNoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <Box textAlign="center" color="inherit">
      <SpaceBetween size="xxs">
        <Box variant="strong" color="inherit">
          No matches
        </Box>
        <Box variant="p" color="inherit">
          We can&apos;t find a match.
        </Box>
      </SpaceBetween>
      <Box margin={{ top: "s" }}>
        <Button onClick={onClear}>Clear filters</Button>
      </Box>
    </Box>
  );
}

/** A failed load with a working Retry action. */
export function ErrorState({
  title = "Unable to load data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Box textAlign="center" padding={{ vertical: "l" }}>
      <SpaceBetween size="s" alignItems="center">
        <StatusIndicator type="error">{title}</StatusIndicator>
        <Box variant="p">{message}</Box>
        <Button onClick={onRetry} iconName="refresh">
          Retry
        </Button>
      </SpaceBetween>
    </Box>
  );
}

/** A missing (or not-owned) resource, with a way back. */
export function NotFoundState({
  resourceName,
  backHref,
  backText,
}: {
  resourceName: string;
  backHref: string;
  backText?: string;
}) {
  const onFollow = useFollowHandler();
  return (
    <Container>
      <Box textAlign="center" padding={{ vertical: "l" }}>
        <SpaceBetween size="s" alignItems="center">
          <Box variant="h2">{resourceName} not found</Box>
          <Box variant="p">It may have been deleted, or the link may be incorrect.</Box>
          <Link href={backHref} onFollow={onFollow}>
            {backText ?? "Go back"}
          </Link>
        </SpaceBetween>
      </Box>
    </Container>
  );
}

/** Full-height centered spinner while the session is being checked. */
export function FullPageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Spinner size="large" />
    </div>
  );
}
