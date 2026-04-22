import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Inference Tool",
  description:
    "Operationalizes the 6-step LLM-inference framework for quantitative textual research in management studies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <body className="h-full antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
