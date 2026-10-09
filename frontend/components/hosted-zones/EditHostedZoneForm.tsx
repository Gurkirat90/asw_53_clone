"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Textarea from "@cloudscape-design/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { usePageChrome } from "@/components/console-shell/PageChrome";
import { ErrorState, NotFoundState } from "@/components/feedback/states";
import { useNotifications } from "@/components/feedback/NotificationsProvider";
import { ApiError } from "@/lib/api/client";
import { fieldErrorsFromApiError, userMessage } from "@/lib/api/errors";
import { updateZone } from "@/lib/api/hostedZones";
import { queryKeys } from "@/lib/api/queryKeys";
import type { HostedZoneDetail } from "@/lib/api/types";
import { useZone } from "@/lib/hooks/useHostedZones";
import { COMMENT_MAX_LENGTH, validateComment } from "@/lib/validation/dns";

import { ZONE_TYPE_LABELS, zoneHref } from "./zoneText";

export function EditHostedZonePage({ zoneId }: { zoneId: string }) {
  const zone = useZone(zoneId);
  const name = zone.data?.name ?? zoneId;
  usePageChrome({
    breadcrumbs: [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: name, href: zoneHref(zoneId) },
      { text: "Edit", href: `${zoneHref(zoneId)}/edit` },
    ],
    contentType: "form",
  });

  // A 404 wins over cached data (the zone may have been deleted since it was cached).
  if (zone.error instanceof ApiError && zone.error.status === 404) {
    return <NotFoundState resourceName="Hosted zone" backHref="/hosted-zones" backText="Back to hosted zones" />;
  }
  if (zone.data) return <EditHostedZoneForm key={zone.data.zone_id} zone={zone.data} />;
  if (zone.isError) {
    return <ErrorState title="Unable to load the hosted zone" message={userMessage(zone.error)} onRetry={() => void zone.refetch()} />;
  }
  return (
    <Box textAlign="center" padding="xxl">
      <Spinner size="large" />
    </Box>
  );
}

function EditHostedZoneForm({ zone }: { zone: HostedZoneDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const [comment, setComment] = useState(zone.comment ?? "");
  const [commentError, setCommentError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const submitting = useRef(false);

  const commentResult = validateComment(comment);
  const changed = commentResult.ok ? commentResult.normalized !== zone.comment : comment !== (zone.comment ?? "");

  const mutation = useMutation({
    mutationFn: (value: string | null) => updateZone(zone.zone_id, { comment: value }),
    onSuccess: (updated) => {
      notify({ type: "success", header: "Success", content: `Hosted zone ${updated.name} updated.` });
      queryClient.setQueryData(queryKeys.zones.detail(updated.zone_id), updated);
      void queryClient.invalidateQueries({ queryKey: ["zones"] });
      router.push(zoneHref(updated.zone_id));
    },
    onError: (error) => {
      submitting.current = false;
      const fields = fieldErrorsFromApiError(error);
      if (fields.comment) setCommentError(fields.comment);
      else setFormError(userMessage(error));
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || mutation.isPending || !changed) return;
    setFormError(null);
    const result = validateComment(comment);
    if (!result.ok) {
      setCommentError(result.message);
      return;
    }
    setCommentError(undefined);
    submitting.current = true;
    mutation.mutate(result.normalized);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Form
        header={<Header variant="h1">Edit hosted zone</Header>}
        errorText={formError}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={() => router.push(zoneHref(zone.zone_id))} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={mutation.isPending} disabled={!changed || mutation.isPending}>
              Save changes
            </Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
          <SpaceBetween size="l">
            <KeyValuePairs
              columns={3}
              items={[
                { label: "Domain name", value: zone.name },
                { label: "Type", value: ZONE_TYPE_LABELS[zone.zone_type] },
                { label: "Hosted zone ID", value: zone.zone_id },
              ]}
            />
            <Alert type="info" statusIconAriaLabel="Info">
              Domain name and type cannot be changed after the hosted zone is created.
            </Alert>
            <FormField
              label={
                <span>
                  Description <i>- optional</i>
                </span>
              }
              constraintText={`${comment.length.toLocaleString("en-US")}/${COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters`}
              errorText={commentError}
            >
              <Textarea
                value={comment}
                onChange={({ detail }) => setComment(detail.value)}
                disabled={mutation.isPending}
                ariaLabel="Description"
                autoFocus
              />
            </FormField>
          </SpaceBetween>
        </Container>
      </Form>
    </form>
  );
}
