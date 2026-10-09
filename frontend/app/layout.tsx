import type { Metadata } from "next";
import type { ReactNode } from "react";
// Cloudscape global styles are imported exactly once, here. The installed Cloudscape build ships
// Visual Refresh as its only theme (ALWAYS_VISUAL_REFRESH), so no `awsui-visual-refresh` body class
// is required.
import "@cloudscape-design/global-styles/index.css";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "Fiftythree",
  description: "A functional simulation of the AWS Route 53 console. It does not serve DNS.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
