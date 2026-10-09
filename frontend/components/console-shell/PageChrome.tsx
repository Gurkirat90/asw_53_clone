"use client";

import type { AppLayoutProps } from "@cloudscape-design/components/app-layout";
import type { BreadcrumbGroupProps } from "@cloudscape-design/components/breadcrumb-group";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const ROOT_BREADCRUMB: BreadcrumbGroupProps.Item = { text: "Route 53", href: "/dashboard" };

export interface PageChrome {
  breadcrumbs: BreadcrumbGroupProps.Item[];
  contentType: AppLayoutProps.ContentType;
}

interface PageChromeContextValue extends PageChrome {
  setChrome: (chrome: PageChrome) => void;
}

const PageChromeContext = createContext<PageChromeContextValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<PageChrome>({ breadcrumbs: [], contentType: "default" });
  const value = useMemo(() => ({ ...chrome, setChrome }), [chrome]);
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

/** Shell state for the shell to render: breadcrumbs (with the Route 53 root) and content type. */
export function useShellChrome(): PageChrome {
  const context = useContext(PageChromeContext);
  if (!context) throw new Error("useShellChrome must be used inside PageChromeProvider");
  return { breadcrumbs: context.breadcrumbs, contentType: context.contentType };
}

/**
 * Called by each console page to set its breadcrumbs (the "Route 53" root crumb is added
 * automatically) and AppLayout content type ("table", "form", or "default").
 */
export function usePageChrome({
  breadcrumbs,
  contentType = "default",
}: {
  breadcrumbs: BreadcrumbGroupProps.Item[];
  contentType?: AppLayoutProps.ContentType;
}): void {
  const context = useContext(PageChromeContext);
  if (!context) throw new Error("usePageChrome must be used inside PageChromeProvider");
  const { setChrome } = context;
  const key = JSON.stringify(breadcrumbs);
  useEffect(() => {
    setChrome({ breadcrumbs: [ROOT_BREADCRUMB, ...(JSON.parse(key) as BreadcrumbGroupProps.Item[])], contentType });
  }, [key, contentType, setChrome]);
}
