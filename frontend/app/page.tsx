import { redirect } from "next/navigation";

// "/" always goes to the console home. Signed-out visitors are sent on to /login by the proxy
// (no session cookie) or by the console AuthGate (cookie present but session invalid).
export default function RootPage() {
  redirect("/hosted-zones");
}
