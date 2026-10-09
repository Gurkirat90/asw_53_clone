"use client";

import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

import { usePageChrome } from "@/components/console-shell/PageChrome";
import { useFollowHandler } from "@/lib/hooks/useFollowHandler";

/** Placeholder for console areas that are outside Fiftythree's functional scope. */
export function ComingSoonPage({ title, href }: { title: string; href: string }) {
  usePageChrome({ breadcrumbs: [{ text: title, href }], contentType: "default" });
  const onFollow = useFollowHandler();
  return (
    <ContentLayout header={<Header variant="h1">{title}</Header>}>
      <Container>
        <SpaceBetween size="s">
          <StatusIndicator type="pending">Coming soon</StatusIndicator>
          <Box variant="p">{title} is outside the functional scope of Fiftythree.</Box>
          <Link href="/hosted-zones" onFollow={onFollow}>
            Go to Hosted zones
          </Link>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
