// TEMPORARY: replaced by redirect logic in PROMPT 04
"use client";

import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";

export default function HomePage() {
  return (
    <ContentLayout header={<Header variant="h1">Route 53 Clone</Header>}>
      <Container header={<Header variant="h2">Foundation ready</Header>}>
        <Box variant="p">
          The repository foundation is in place. This simulation does not serve or publish DNS.
        </Box>
      </Container>
    </ContentLayout>
  );
}
