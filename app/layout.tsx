import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentira Air",
  description: "Sentira Air 스마트 환기 시스템",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-slate-950 text-white">
        {children}
      </body>
    </html>
  );
}