import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { getEffectiveMode, getRealDataSummary } from "@/lib/dataAccess";
import { PROJECT_TITLE } from "@/lib/constants";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `ReproTwin — ${PROJECT_TITLE}`,
  description:
    "AI-powered digital twin for personalised air pollution exposure management among urban motorcycle riders. Research prototype — demo data by default, real Malaysian data optional.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const mode = getEffectiveMode();
  const realSummary = mode === "real" ? getRealDataSummary() : null;

  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <DemoBanner mode={mode} realSummary={realSummary} />
        <NavBar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
