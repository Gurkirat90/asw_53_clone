"use client";

import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/console-shell/ConsoleShell";
import { PageChromeProvider } from "@/components/console-shell/PageChrome";
import { SplitPanelProvider } from "@/components/console-shell/SplitPanelSlot";
import { NotificationsProvider } from "@/components/feedback/NotificationsProvider";
import { AuthGate } from "@/lib/auth/AuthProvider";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <NotificationsProvider>
        <PageChromeProvider>
          <SplitPanelProvider>
            <ConsoleShell>{children}</ConsoleShell>
          </SplitPanelProvider>
        </PageChromeProvider>
      </NotificationsProvider>
    </AuthGate>
  );
}
