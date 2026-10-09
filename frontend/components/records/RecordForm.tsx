"use client";

import AttributeEditor from "@cloudscape-design/components/attribute-editor";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Toggle from "@cloudscape-design/components/toggle";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { ConfirmationModal } from "@/components/dialogs/ConfirmationModal";
import { useNotifications } from "@/components/feedback/NotificationsProvider";
import { zoneHref } from "@/components/hosted-zones/zoneText";
import { ApiError } from "@/lib/api/client";
import { fieldErrorsFromApiError, userMessage } from "@/lib/api/errors";
import { createRecord, updateRecord } from "@/lib/api/records";
import type { DnsRecord, RecordType } from "@/lib/api/types";
import { invalidateAfterRecordChange } from "@/lib/hooks/useHostedZones";
import {
  canonicalizeRecordName,
  CAA_TAGS,
  COMMENT_MAX_LENGTH,
  emptyValueRow,
  validateRecordForm,
  type RecordFormValues,
  type ValueRow,
} from "@/lib/validation/dns";

import { rowHasContent } from "./recordFormValues";
import { recordLabel, RECORD_TYPE_DESCRIPTIONS, RECORD_TYPE_ORDER, SYSTEM_RECORD_REASON } from "./recordText";

const TYPE_OPTIONS: SelectProps.Option[] = RECORD_TYPE_ORDER.map((type) => ({
  value: type,
  label: type,
  description: RECORD_TYPE_DESCRIPTIONS[type],
}));
const TAG_OPTIONS: SelectProps.Option[] = CAA_TAGS.map((tag) => ({ value: tag, label: tag }));
const TTL_PRESETS = [
  { label: "1m", seconds: 60 },
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86400 },
];
const LIST_PLACEHOLDERS: Partial<Record<RecordType, string>> = {
  A: "192.0.2.10",
  AAAA: "2001:db8::10",
  NS: "ns1.example.net",
  PTR: "host.example.net",
  TXT: "v=spf1 include:example.net -all",
};

export interface RecordFormProps {
  zoneId: string;
  zoneName: string;
  initial: RecordFormValues;
  /** Present when editing: the form PATCHes this record instead of creating one. */
  record?: DnsRecord;
}

/** Shared create/edit form: type-specific value editors, client validation, server error mapping. */
export function RecordForm({ zoneId, zoneName, initial, record }: RecordFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  const editing = record !== undefined;

  const [form, setForm] = useState<RecordFormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<RecordType | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Live validation after the first submit; server errors stay until the user edits again.
  const clientErrors = useMemo(
    () => (submitted ? validateRecordForm(form, zoneName).fieldErrors : {}),
    [submitted, form, zoneName],
  );
  const errors = { ...clientErrors, ...serverErrors };
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  useEffect(() => {
    if (focusRequest === 0) return;
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    invalid?.focus();
  }, [focusRequest]);

  const update = (patch: Partial<RecordFormValues>) => {
    setForm((current) => ({ ...current, ...patch }));
    setServerErrors({});
  };
  const updateRow = (index: number, patch: Partial<ValueRow>) => {
    setForm((current) => ({
      ...current,
      values: current.values.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
    setServerErrors({});
  };

  const preview = canonicalizeRecordName(form.name.trim() === "" ? "@" : form.name, zoneName);

  const mutation = useMutation({
    mutationFn: (payload: NonNullable<ReturnType<typeof validateRecordForm>["payload"]>) =>
      editing ? updateRecord(zoneId, record.id, payload) : createRecord(zoneId, payload),
    onSuccess: (saved) => {
      notify({
        type: "success",
        header: "Success",
        content: `Record ${recordLabel(saved)} ${editing ? "updated" : "created"}.`,
      });
      void invalidateAfterRecordChange(queryClient, zoneId);
      router.push(zoneHref(zoneId));
    },
    onError: (error) => {
      submitting.current = false;
      if (error instanceof ApiError && error.code === "RECORD_CONFLICT") {
        setFormError(error.message);
        setServerErrors({ name: error.message });
      } else if (error instanceof ApiError && error.code === "SYSTEM_RECORD_PROTECTED") {
        setFormError(SYSTEM_RECORD_REASON);
      } else {
        const fields = fieldErrorsFromApiError(error);
        if (Object.keys(fields).length > 0) {
          setServerErrors(fields);
          setFormError("The record has errors. Fix the highlighted fields and try again.");
        } else {
          setFormError(userMessage(error));
        }
      }
      setFocusRequest((n) => n + 1);
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || mutation.isPending) return;
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});
    const result = validateRecordForm(form, zoneName);
    if (!result.payload) {
      setFocusRequest((n) => n + 1);
      return;
    }
    submitting.current = true;
    mutation.mutate(result.payload);
  };

  const changeType = (type: RecordType) => {
    if (type === form.type) return;
    if (form.values.some((row) => rowHasContent(form.type, row))) setPendingType(type);
    else update({ type, values: [emptyValueRow(type)] });
  };

  const rowError = (index: number, key: keyof ValueRow, first: boolean) =>
    errors[`values.${index}.${key}`] ?? (first ? errors[`values.${index}`] : undefined);

  const disabled = mutation.isPending;
  const removable = { isItemRemovable: () => form.values.length > 1 };
  const editorCommon = {
    items: form.values,
    addButtonText: "Add value",
    removeButtonText: "Remove",
    onAddButtonClick: () => update({ values: [...form.values, emptyValueRow(form.type)] }),
    onRemoveButtonClick: ({ detail }: { detail: { itemIndex: number } }) =>
      update({ values: form.values.filter((_row, i) => i !== detail.itemIndex) }),
    disableAddButton: disabled || form.values.length >= 100,
    ...removable,
  };

  const numberControl = (key: keyof ValueRow, label: string) => ({
    label,
    control: (row: ValueRow, index: number) => (
      <Input
        type="number"
        inputMode="numeric"
        value={row[key] ?? ""}
        onChange={({ detail }) => updateRow(index, { [key]: detail.value })}
        ariaLabel={`${label} ${index + 1}`}
        disabled={disabled}
      />
    ),
    errorText: (_row: ValueRow, index: number) => rowError(index, key, key === "priority" || key === "flags"),
  });
  const textControl = (key: keyof ValueRow, label: string, placeholder: string, first = false) => ({
    label,
    control: (row: ValueRow, index: number) => (
      <Input
        value={row[key] ?? ""}
        placeholder={placeholder}
        onChange={({ detail }) => updateRow(index, { [key]: detail.value })}
        ariaLabel={`${label} ${index + 1}`}
        disabled={disabled}
      />
    ),
    errorText: (_row: ValueRow, index: number) => rowError(index, key, first),
  });

  let valueEditor;
  if (form.type === "CNAME") {
    valueEditor = (
      <Input
        value={form.values[0]?.value ?? ""}
        placeholder="app.example.net"
        onChange={({ detail }) => update({ values: [{ value: detail.value }] })}
        ariaLabel="Value"
        disabled={disabled}
      />
    );
  } else if (form.type === "MX") {
    valueEditor = (
      <AttributeEditor<ValueRow>
        {...editorCommon}
        definition={[numberControl("priority", "Priority"), textControl("exchange", "Mail server", "mail.example.net")]}
      />
    );
  } else if (form.type === "SRV") {
    valueEditor = (
      <AttributeEditor<ValueRow>
        {...editorCommon}
        definition={[
          numberControl("priority", "Priority"),
          numberControl("weight", "Weight"),
          numberControl("port", "Port"),
          textControl("target", "Target", "service.example.net"),
        ]}
      />
    );
  } else if (form.type === "CAA") {
    valueEditor = (
      <AttributeEditor<ValueRow>
        {...editorCommon}
        definition={[
          numberControl("flags", "Flags"),
          {
            label: "Tag",
            control: (row, index) => (
              <Select
                selectedOption={TAG_OPTIONS.find((option) => option.value === row.tag) ?? null}
                options={TAG_OPTIONS}
                onChange={({ detail }) => updateRow(index, { tag: detail.selectedOption.value ?? "" })}
                ariaLabel={`Tag ${index + 1}`}
                disabled={disabled}
              />
            ),
            errorText: (_row, index) => rowError(index, "tag", false),
          },
          textControl("value", "Value", "letsencrypt.org"),
        ]}
      />
    );
  } else {
    valueEditor = (
      <AttributeEditor<ValueRow>
        {...editorCommon}
        // Single-column editor: the surrounding "Value" FormField is the visible label; each input
        // keeps its own accessible name ("Value 1", "Value 2", ...).
        definition={[{ ...textControl("value", "Value", LIST_PLACEHOLDERS[form.type] ?? "", true), label: undefined }]}
      />
    );
  }

  const valueErrorForField =
    errors.values ?? (form.type === "CNAME" ? (errors["values.0.value"] ?? errors["values.0"]) : undefined);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <Form
        header={
          <Header variant="h1" description="Quick create record: enter the record details. Changes are stored in this application only.">
            {editing ? "Edit record" : "Create record"}
          </Header>
        }
        errorText={formError}
        errorIconAriaLabel="Error"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              formAction="none"
              variant="link"
              disabled={disabled}
              onClick={() => (dirty ? setConfirmDiscard(true) : router.push(zoneHref(zoneId)))}
            >
              Cancel
            </Button>
            <Button variant="primary" formAction="submit" loading={disabled} disabled={disabled}>
              {editing ? "Save" : "Create records"}
            </Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Record</Header>}>
          <SpaceBetween size="l">
            <FormField
              label="Record name"
              description="Keep blank to create a record for the root domain."
              errorText={errors.name}
              constraintText={
                preview.ok ? `Full record name: ${preview.normalized}` : "Full record name: -"
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    value={form.name}
                    placeholder="subdomain"
                    onChange={({ detail }) => update({ name: detail.value })}
                    ariaLabel="Record name"
                    disabled={disabled}
                    autoFocus={!editing}
                  />
                </div>
                <Box color="text-body-secondary" fontSize="body-m">
                  <span style={{ whiteSpace: "nowrap" }}>.{zoneName}</span>
                </Box>
              </div>
            </FormField>

            <FormField label="Record type" errorText={errors.record_type}>
              <div data-testid="record-type-select">
              <Select
                selectedOption={TYPE_OPTIONS.find((option) => option.value === form.type) ?? null}
                options={TYPE_OPTIONS}
                onChange={({ detail }) => changeType(detail.selectedOption.value as RecordType)}
                ariaLabel="Record type"
                disabled={disabled}
              />
              </div>
            </FormField>

            <FormField label="Alias" description="Alias records are not supported in Fiftythree.">
              <Toggle checked={false} disabled onChange={() => undefined} ariaLabel="Alias">
                Alias
              </Toggle>
            </FormField>

            <FormField
              label="Value"
              description={
                form.type === "TXT"
                  ? "Enter text without surrounding quotes; quotes are added automatically."
                  : form.type === "SRV"
                    ? 'Target may be "." to indicate that the service is not available.'
                    : undefined
              }
              errorText={valueErrorForField}
              stretch
            >
              {valueEditor}
            </FormField>

            <FormField
              label="TTL (seconds)"
              constraintText="Recommended values: 60 to 172800 (two days)"
              errorText={errors.ttl_seconds}
              secondaryControl={
                <SpaceBetween direction="horizontal" size="xs">
                  {TTL_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      formAction="none"
                      disabled={disabled}
                      ariaLabel={`Set TTL to ${preset.seconds} seconds`}
                      onClick={() => update({ ttl: String(preset.seconds) })}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </SpaceBetween>
              }
            >
              <Input
                type="number"
                inputMode="numeric"
                value={form.ttl}
                onChange={({ detail }) => update({ ttl: detail.value })}
                ariaLabel="TTL (seconds)"
                disabled={disabled}
              />
            </FormField>

            <FormField label="Routing policy" description="Other routing policies are not available in Fiftythree.">
              <Select
                selectedOption={{ value: "SIMPLE", label: "Simple routing" }}
                options={[{ value: "SIMPLE", label: "Simple routing" }]}
                onChange={() => undefined}
                disabled
                ariaLabel="Routing policy"
              />
            </FormField>

            <FormField
              label={
                <span>
                  Comment <i>- optional</i>
                </span>
              }
              constraintText={`${form.comment.length.toLocaleString("en-US")}/${COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters`}
              errorText={errors.comment}
            >
              <Textarea
                value={form.comment}
                onChange={({ detail }) => update({ comment: detail.value })}
                ariaLabel="Comment"
                disabled={disabled}
              />
            </FormField>
          </SpaceBetween>
        </Container>
      </Form>

      <ConfirmationModal
        visible={pendingType !== null}
        header="Change record type?"
        confirmLabel="Change type"
        onConfirm={() => {
          if (pendingType) update({ type: pendingType, values: [emptyValueRow(pendingType)] });
          setPendingType(null);
        }}
        onDismiss={() => setPendingType(null)}
      >
        The values you entered will be cleared.
      </ConfirmationModal>
      <ConfirmationModal
        visible={confirmDiscard}
        header="Discard changes?"
        confirmLabel="Discard"
        onConfirm={() => router.push(zoneHref(zoneId))}
        onDismiss={() => setConfirmDiscard(false)}
      >
        Your changes to this record haven&apos;t been saved and will be lost.
      </ConfirmationModal>
    </form>
  );
}
