"use client";

// TEMPORARY: replaced in PROMPT 05 (hosted zone table, create/edit/delete flows).
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";

import { usePageChrome } from "@/components/console-shell/PageChrome";

export default function HostedZonesPage() {
  usePageChrome({ breadcrumbs: [{ text: "Hosted zones", href: "/hosted-zones" }], contentType: "table" });
  return (
    <ContentLayout header={<Header variant="h1">Hosted zones</Header>}>
      <Container>
        <Box variant="p">The hosted zone table is implemented in PROMPT 05.</Box>
      </Container>
    </ContentLayout>
  );
}
