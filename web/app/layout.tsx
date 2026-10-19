import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";
import FirebaseAnalytics from "@/components/FirebaseAnalytics";
import { getSiteUrlObject } from "@/lib/siteUrl";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSans = Noto_Sans_KR({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const notoSerif = Noto_Serif_KR({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

export const metadata: Metadata = {
  metadataBase: getSiteUrlObject(),
  title: {
    default: "합격판 - 편입 전략 커뮤니티",
    template: "%s | 합격판",
  },
  description: "대학별 편입 모집요강·일정·최신뉴스와 AI 상담, 편입 수험생 커뮤니티",
  keywords: ["편입", "편입 커트라인", "편입 합격예측", "편입 커뮤니티", "합격판"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "합격판",
    title: "합격판 - 편입 전략 커뮤니티",
    description: "대학별 편입 모집요강·일정·최신뉴스와 AI 상담, 편입 수험생 커뮤니티",
    url: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${notoSans.variable} ${notoSerif.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <FirebaseAnalytics />
      </body>
    </html>
  );
}
