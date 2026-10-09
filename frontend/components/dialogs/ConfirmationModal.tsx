"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useState, type ReactNode } from "react";

export interface ConfirmationModalProps {
  visible: boolean;
  header: string;
  /** The consequence text: what will be affected. */
  children: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "normal";
  /** When set (e.g. "delete"), the user must type it exactly before confirming. */
  requireTypedText?: string;
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * Confirmation dialog for destructive actions. Cancel is the safe default; an error keeps the
 * dialog open. The Modal stays mounted so Cloudscape can move focus into the dialog on open and
 * return it to the invoking control on close.
 */
export function ConfirmationModal({
  visible,
  header,
  children,
  confirmLabel,
  confirmVariant = "primary",
  requireTypedText,
  loading = false,
  error,
  onConfirm,
  onDismiss,
}: ConfirmationModalProps) {
  const [typed, setTyped] = useState("");
  const [wasVisible, setWasVisible] = useState(visible);
  // Reset the typed confirmation each time the dialog opens (state adjusted during render).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setTyped("");
  }
  const confirmed = !requireTypedText || typed === requireTypedText;

  const submit = () => {
    if (confirmed && !loading) onConfirm();
  };

  return (
    <Modal
      visible={visible}
      header={header}
      onDismiss={() => {
        if (!loading) onDismiss();
      }}
      closeAriaLabel="Close dialog"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant={confirmVariant}
              onClick={submit}
              disabled={!confirmed}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box variant="span">{children}</Box>
        {requireTypedText ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <FormField label={`To confirm deletion, type "${requireTypedText}" in the field.`}>
              <Input
                value={typed}
                onChange={({ detail }) => setTyped(detail.value)}
                placeholder={requireTypedText}
                ariaRequired
                disabled={loading}
              />
            </FormField>
          </form>
        ) : null}
        {error ? (
          <Alert type="error" header="The action could not be completed">
            {error}
          </Alert>
        ) : null}
      </SpaceBetween>
    </Modal>
  );
}
