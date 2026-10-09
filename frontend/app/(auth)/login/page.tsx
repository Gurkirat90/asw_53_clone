import { Suspense } from "react";

import { FullPageSpinner } from "@/components/feedback/states";

import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  // useSearchParams (for ?next=) requires a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LoginForm />
    </Suspense>
  );
}
