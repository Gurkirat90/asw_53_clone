"use client";

import AppLayout from "@cloudscape-design/components/app-layout";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Icon from "@cloudscape-design/components/icon";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import SplitPanel from "@cloudscape-design/components/split-panel";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { NotificationsFlashbar, useNotifications } from "@/components/feedback/NotificationsProvider";
import { logout } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useFollowHandler } from "@/lib/hooks/useFollowHandler";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

import { activeNavHref, NAV_HEADER, NAV_ITEMS } from "./navigation";
import { useShellChrome } from "./PageChrome";
import { useSplitPanelState } from "./SplitPanelSlot";

const SIGN_OUT_ITEM = "sign-out";

/** Not a control: Route 53 is a global service, so there is no region to choose. */
function GlobalRegionIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#d1d5db", fontSize: 14 }}
        title="Route 53 is a global service; there is no region to select."
      >
        <Icon name="globe" variant="normal" />
        Global
      </span>
    </div>
  );
}

function TopBar() {
  const user = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useNotifications();
  // On narrow screens TopNavigation folds the search slot behind a search icon, which would turn
  // this plain label into a misleading control, so it is shown on wider screens only.
  const wide = useMediaQuery("(min-width: 688px)");

  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login?signed_out=1");
    },
    onError: () => {
      notify({
        id: "sign-out-failed",
        type: "error",
        content: "Sign-out could not be confirmed. Try again.",
      });
    },
  });

  return (
    <TopNavigation
      identity={{ title: "Route 53 Clone", href: "/hosted-zones", onFollow: () => router.push("/hosted-zones") }}
      search={wide ? <GlobalRegionIndicator /> : undefined}
      utilities={[
        {
          type: "menu-dropdown",
          text: user.display_name,
          description: "Demo account",
          iconName: "user-profile",
          items: [{ id: SIGN_OUT_ITEM, text: signOut.isPending ? "Signing out..." : "Sign out", disabled: signOut.isPending }],
          onItemClick: ({ detail }) => {
            if (detail.id === SIGN_OUT_ITEM && !signOut.isPending) signOut.mutate();
          },
        },
      ]}
      i18nStrings={{ overflowMenuTriggerText: "More", overflowMenuTitleText: "All" }}
    />
  );
}

/** The single authenticated console shell: dark top bar, side navigation, breadcrumbs, Flashbar. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onFollow = useFollowHandler();
  const { breadcrumbs, contentType } = useShellChrome();
  const splitPanel = useSplitPanelState();

  return (
    <>
      <div id="console-top-nav" style={{ position: "sticky", top: 0, zIndex: 1002 }}>
        <TopBar />
      </div>
      <AppLayout
        headerSelector="#console-top-nav"
        contentType={contentType}
        toolsHide
        navigation={
          <SideNavigation
            header={NAV_HEADER}
            items={NAV_ITEMS}
            activeHref={activeNavHref(pathname)}
            onFollow={onFollow}
          />
        }
        breadcrumbs={
          <BreadcrumbGroup items={breadcrumbs} onFollow={onFollow} ariaLabel="Breadcrumbs" />
        }
        notifications={<NotificationsFlashbar />}
        splitPanel={
          splitPanel ? (
            <SplitPanel
              header={splitPanel.header}
              hidePreferencesButton
              closeBehavior="hide"
              i18nStrings={{
                closeButtonAriaLabel: "Close details panel",
                openButtonAriaLabel: "Open details panel",
                resizeHandleAriaLabel: "Resize details panel",
              }}
            >
              {splitPanel.content}
            </SplitPanel>
          ) : undefined
        }
        splitPanelOpen={splitPanel?.open ?? false}
        onSplitPanelToggle={({ detail }) => splitPanel?.onToggle(detail.open)}
        ariaLabels={{
          navigation: "Route 53 navigation",
          navigationClose: "Close navigation",
          navigationToggle: "Open navigation",
          notifications: "Notifications",
        }}
        content={children}
      />
    </>
  );
}
