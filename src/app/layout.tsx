import "~/styles/globals.css";

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { cn } from "~/lib/utils";

import CssVars from "~/components/css-vars";
import { SiteHeader } from "~/components/site-header";
import { ThemeProvider } from "~/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "MCC Gadgets",
    template: "%s | MCC Gadgets",
  },
  description: "Tools for the Minecraft Commands community",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans text-text antialiased",
          inter.variable,
        )}
      >
        <CssVars>
          <ThemeProvider
            attribute="class"
            themes={["latte", "frappe", "macchiato", "mocha"]}
            value={{
              light: "latte",
              dark: "mocha",
              latte: "latte",
              frappe: "frappe",
              macchiato: "macchiato",
              mocha: "mocha",
            }}
            disableTransitionOnChange
          >
            <SiteHeader />
            {children}
          </ThemeProvider>
        </CssVars>
      </body>
    </html>
  );
}
