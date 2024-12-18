import "~/styles/globals.css";

import { Inter } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { ThemeProvider } from "~/components/theme-provider";
import { SiteHeader } from "~/components/site-header";
import CssVars from "~/components/css-vars";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata = {
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
          "min-h-screen bg-base font-sans antialiased",
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
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </ThemeProvider>
        </CssVars>
      </body>
    </html>
  );
}
