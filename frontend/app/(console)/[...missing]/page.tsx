import { notFound } from "next/navigation";

// Unknown console URLs render (console)/not-found.tsx inside the shell.
export default function MissingConsolePage() {
  notFound();
}
