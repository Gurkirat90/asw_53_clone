"use client";

import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Tiles from "@cloudscape-design/components/tiles";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { usePageChrome } from "@/components/console-shell/PageChrome";
import { ConfirmationModal } from "@/components/dialogs/ConfirmationModal";
import { useNotifications } from "@/components/feedback/NotificationsProvider";
import { fieldErrorsFromApiError, userMessage } from "@/lib/api/errors";
import { createZone } from "@/lib/api/hostedZones";
import type { ZoneType } from "@/lib/api/types";
import { COMMENT_MAX_LENGTH, validateComment, validateZoneName } from "@/lib/validation/dns";

import { zoneHref } from "./zoneText";

interface FieldErrors {
  name?: string;
  comment?: string;
  zone_type?: string;
}

function validate(name: string, comment: string): FieldErrors {
  const errors: FieldErrors = {};
  const nameResult = validateZoneName(name);
  if (!nameResult.ok) errors.name = nameResult.message;
  const commentResult = validateComment(comment);
  if (!commentResult.ok) errors.comment = commentResult.message;
  return errors;
}

export function CreateHostedZoneForm() {
  usePageChrome({
    breadcrumbs: [
      { text: "Hosted zones", href: "/hosted-zones" },
      { text: "Create hosted zone", href: "/hosted-zones/new" },
    ],
    contentType: "form",
  });
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useNotifications();

  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [zoneType, setZoneType] = useState<ZoneType>("PUBLIC");
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const submitting = useRef(false);

  const dirty = name !== "" || comment !== "" || zoneType !== "PUBLIC";

  const mutation = useMutation({
    mutationFn: createZone,
    onSuccess: (zone) => {
      notify({ type: "success", header: "Success", content: `Hosted zone ${zone.name} created.` });
      void queryClient.invalidateQueries({ queryKey: ["zones"] });
      router.push(zoneHref(zone.zone_id));
    },
    onError: (error) => {
      submitting.current = false;
      const fields = fieldErrorsFromApiError(error);
      if (fields.name || fields.comment || fields.zone_type) {
        setErrors({ name: fields.name, comment: fields.comment, zone_type: fields.zone_type });
      } else {
        setFormError(userMessage(error));
      }
    },
  });

  const revalidate = () => {
    if (submitted) setErrors(validate(name, comment));
  };

  const onSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (submitting.current || mutation.isPending) return;
    setSubmitted(true);
    setFormError(null);
    const found = validate(name, comment);
    setErrors(found);
    if (found.name || found.comment) return;
    const nameResult = validateZoneName(name);
    const commentResult = validateComment(comment);
    if (!nameResult.ok || !commentResult.ok) return;
    submitting.current = true;
    mutation.mutate({ name: nameResult.normalized, zone_type: zoneType, comment: commentResult.normalized });
  };

  const cancel = () => {
    if (dirty) setConfirmDiscard(true);
    else router.push("/hosted-zones");
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Form
        header={<Header variant="h1">Create hosted zone</Header>}
        errorText={formError}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" variant="link" onClick={cancel} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={mutation.isPending} disabled={mutation.isPending}>
              Create hosted zone
            </Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
          <SpaceBetween size="l">
            <FormField
              label="Domain name"
              description="This is the name of the domain that you want to route traffic for."
              constraintText="Valid characters: a-z, 0-9, - (hyphen). Labels separated by periods."
              errorText={errors.name}
            >
              <Input
                value={name}
                placeholder="example.com"
                onChange={({ detail }) => setName(detail.value)}
                onBlur={revalidate}
                ariaRequired
                autoFocus
                disabled={mutation.isPending}
              />
            </FormField>
            <FormField
              label={
                <span>
                  Description <i>- optional</i>
                </span>
              }
              constraintText={`${comment.length.toLocaleString("en-US")}/${COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters`}
              errorText={errors.comment}
            >
              <Textarea
                value={comment}
                onChange={({ detail }) => setComment(detail.value)}
                onBlur={revalidate}
                disabled={mutation.isPending}
                ariaLabel="Description"
              />
            </FormField>
            <FormField label="Type" errorText={errors.zone_type}>
              <Tiles
                value={zoneType}
                onChange={({ detail }) => setZoneType(detail.value as ZoneType)}
                items={[
                  {
                    value: "PUBLIC",
                    label: "Public hosted zone",
                    description: "A public hosted zone determines how traffic is routed on the internet.",
                    disabled: mutation.isPending,
                  },
                  {
                    value: "PRIVATE",
                    label: "Private hosted zone",
                    description: "A private hosted zone determines how traffic is routed within an Amazon VPC.",
                    disabled: mutation.isPending,
                  },
                ]}
                ariaLabel="Type"
              />
            </FormField>
            {zoneType === "PRIVATE" ? (
              <Alert type="info" statusIconAriaLabel="Info">
                VPC association is simulated in Fiftythree. No VPC is created or associated.
              </Alert>
            ) : null}
          </SpaceBetween>
        </Container>
      </Form>
      <ConfirmationModal
        visible={confirmDiscard}
        header="Discard changes?"
        confirmLabel="Discard"
        onConfirm={() => router.push("/hosted-zones")}
        onDismiss={() => setConfirmDiscard(false)}
      >
        The hosted zone hasn&apos;t been created. Your input will be lost.
      </ConfirmationModal>
    </form>
  );
}
