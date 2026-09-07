import type { Metadata } from "next";
import { LanguageProvider } from "@/app/language-provider";
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
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
