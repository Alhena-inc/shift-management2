import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const notoSansJP = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "介護管理システム",
  description: "居宅介護・重度訪問介護事業向け管理システム",
  keywords: ["介護", "管理システム", "居宅介護", "重度訪問介護", "ヘルパー管理"],
  authors: [{ name: "Care Management System" }],
  viewport: "width=device-width, initial-scale=1",
  openGraph: {
    title: "介護管理システム",
    description: "居宅介護・重度訪問介護事業向け管理システム",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}