"use client";

import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";

import { usePageChrome } from "@/components/console-shell/PageChrome";
import { NotFoundState } from "@/components/feedback/states";

export default function ConsoleNotFound() {
  usePageChrome({ breadcrumbs: [{ text: "Page not found", href: "#" }] });
  return (
    <ContentLayout header={<Header variant="h1">Page not found</Header>}>
      <NotFoundState resourceName="Page" backHref="/hosted-zones" backText="Go to Hosted zones" />
    </ContentLayout>
  );
}
