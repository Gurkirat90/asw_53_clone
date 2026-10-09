"use client";

import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/console-shell/ConsoleShell";
import { PageChromeProvider } from "@/components/console-shell/PageChrome";
import { NotificationsProvider } from "@/components/feedback/NotificationsProvider";
import { AuthGate } from "@/lib/auth/AuthProvider";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <NotificationsProvider>
        <PageChromeProvider>
          <ConsoleShell>{children}</ConsoleShell>
        </PageChromeProvider>
      </NotificationsProvider>
    </AuthGate>
  );
}
