import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation";

export const NAV_HEADER: SideNavigationProps.Header = { text: "Route 53", href: "/dashboard" };

export const NAV_ITEMS: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: "/dashboard" },
  { type: "link", text: "Hosted zones", href: "/hosted-zones" },
  { type: "link", text: "Health checks", href: "/health-checks" },
  { type: "link", text: "Profiles", href: "/profiles" },
  {
    type: "section",
    text: "Traffic flow",
    items: [{ type: "link", text: "Traffic policies", href: "/traffic-policies" }],
  },
  {
    type: "section",
    text: "Resolver",
    items: [{ type: "link", text: "Resolver", href: "/resolver" }],
  },
];

function collectHrefs(items: readonly SideNavigationProps.Item[]): string[] {
  return items.flatMap((item) => {
    if (item.type === "link") return [item.href];
    if (item.type === "section" || item.type === "expandable-link-group" || item.type === "section-group") {
      return collectHrefs(item.items);
    }
    return [];
  });
}

const NAV_HREFS = collectHrefs(NAV_ITEMS);

/** The nav href to highlight for a path; nested paths (/hosted-zones/Z123/...) match their section. */
export function activeNavHref(pathname: string): string | undefined {
  return NAV_HREFS.filter((href) => pathname === href || pathname.startsWith(`${href}/`)).sort(
    (a, b) => b.length - a.length,
  )[0];
}
