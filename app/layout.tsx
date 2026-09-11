import type { Metadata } from "next";
import { LanguageProvider } from "@/app/language-provider";
import { AnalyticsTracker } from "@/app/analytics-tracker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whats Pulled",
  description: "Track rare trading cards, breaker hits, claims, and available cards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <LanguageProvider>
          {children}
          <AnalyticsTracker />
        </LanguageProvider>
      </body>
    </html>
  );
}
