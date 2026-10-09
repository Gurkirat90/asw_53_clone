"use client";

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { login, me } from "@/lib/api/auth";
import { ApiError, resetUnauthenticatedGuard } from "@/lib/api/client";
import { fieldErrorsFromApiError, userMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/queryKeys";
import { safeNextPath } from "@/lib/auth/next";

const AUTH_FAILED_MESSAGE = "Sign-in failed. Check your credentials.";

// Optional, set per deployment (build time) so reviewers can sign in. Never hardcoded: the demo
// password is a deployment setting chosen to be shareable, not a secret.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";
const HAS_DEMO_CREDENTIALS = DEMO_EMAIL !== "" && DEMO_PASSWORD !== "";

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const next = safeNextPath(searchParams.get("next"));
  const signedOut = searchParams.get("signed_out") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Showing the login page re-arms the central 401 redirect.
  useEffect(() => {
    resetUnauthenticatedGuard();
  }, []);

  // Already signed in (validated by the server, not by cookie presence)? Skip the form.
  const session = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: ({ signal }) => me(signal),
    retry: false,
  });
  useEffect(() => {
    if (session.data) router.replace(next);
  }, [session.data, next, router]);

  const signIn = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: async (user) => {
      queryClient.setQueryData(queryKeys.auth.me, user);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      router.replace(next);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "AUTHENTICATION_FAILED") {
        setFormError(AUTH_FAILED_MESSAGE);
        return;
      }
      const fields = fieldErrorsFromApiError(error);
      if (fields.email || fields.password) {
        setFieldErrors({ email: fields.email, password: fields.password });
        return;
      }
      setFormError(userMessage(error));
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (signIn.isPending) return;
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = "Enter your email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;
    signIn.mutate();
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        background: "#f2f3f3",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <SpaceBetween size="l">
          <Box textAlign="center" variant="h1" fontSize="heading-xl">
            Fiftythree
          </Box>
          <Container header={<Header variant="h2">Sign in</Header>}>
            <form onSubmit={onSubmit} noValidate>
              <Form
                actions={
                  <Button
                    variant="primary"
                    formAction="submit"
                    loading={signIn.isPending}
                    disabled={signIn.isPending}
                  >
                    Sign in
                  </Button>
                }
              >
                <SpaceBetween size="m">
                  {signedOut ? (
                    <Alert type="success" statusIconAriaLabel="Success">
                      You have signed out.
                    </Alert>
                  ) : null}
                  {formError ? (
                    <Alert type="error" statusIconAriaLabel="Error">
                      {formError}
                    </Alert>
                  ) : null}
                  <FormField label="Email address" errorText={fieldErrors.email}>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      value={email}
                      onChange={({ detail }) => setEmail(detail.value)}
                      autoFocus
                      disabled={signIn.isPending}
                    />
                  </FormField>
                  <FormField label="Password" errorText={fieldErrors.password}>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={({ detail }) => setPassword(detail.value)}
                      disabled={signIn.isPending}
                    />
                  </FormField>
                  {HAS_DEMO_CREDENTIALS ? (
                    <Alert
                      type="info"
                      statusIconAriaLabel="Info"
                      header="Demo credentials"
                      action={
                        <Button
                          formAction="none"
                          onClick={() => {
                            setEmail(DEMO_EMAIL);
                            setPassword(DEMO_PASSWORD);
                            setFieldErrors({});
                          }}
                          disabled={signIn.isPending}
                        >
                          Use demo credentials
                        </Button>
                      }
                    >
                      <div>
                        Email: <strong>{DEMO_EMAIL}</strong>
                      </div>
                      <div>
                        Password: <strong>{DEMO_PASSWORD}</strong>
                      </div>
                      <Box variant="small" color="text-body-secondary" margin={{ top: "xs" }}>
                        Demo console. No AWS account is used and changes stay in this
                        application&apos;s database.
                      </Box>
                    </Alert>
                  ) : (
                    <Alert type="info" statusIconAriaLabel="Info">
                      Demo console. Sign in with the demo credentials from the README. No AWS account
                      is used and changes stay in this application&apos;s database.
                    </Alert>
                  )}
                </SpaceBetween>
              </Form>
            </form>
          </Container>
        </SpaceBetween>
      </div>
    </main>
  );
}
