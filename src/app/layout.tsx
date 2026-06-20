import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solhakathon",
  description: "Team base Next.js app (Vercel-ready).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
