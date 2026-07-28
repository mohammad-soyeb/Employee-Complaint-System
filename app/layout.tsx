import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Employee Complaint Management System",
  description: "Secure HR employee complaint and letter management.",
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
