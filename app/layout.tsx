import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { getEffectiveMode, getRealDataSummary } from "@/lib/dataAccess";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Exposure-Aware Navigation",
  description: "Get where you're going while avoiding the most polluted routes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "E-Navigate",
  },
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

// viewportFit: "cover" is required for env(safe-area-inset-*) to resolve to
// anything other than 0 — without it, the notch/home-indicator padding in
// globals.css is silently inert.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale/userScalable lock: disabling pinch-zoom is an
  // accessibility anti-pattern (WCAG 1.4.4) — a well-laid-out page
  // shouldn't need to forbid zooming to look right.
  viewportFit: "cover",
  themeColor: "#0e6e63",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const mode = getEffectiveMode();
  const realSummary = mode === "real" ? getRealDataSummary() : null;

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppShell mode={mode} realSummary={realSummary}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
