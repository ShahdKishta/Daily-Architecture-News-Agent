import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Architecture News Agent",
  description:
    "An autonomous daily agent that researches architecture and sustainability news, summarizes it, and delivers it to you.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
