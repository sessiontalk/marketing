import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SessionTalk Marketing",
  description: "Email marketing and CRM for SessionTalk",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
