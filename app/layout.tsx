import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "工作日誌",
  description: "記錄每日工作，週五一鍵產出週報",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh">
        <ToastProvider>
          <Suspense
            fallback={<div className="h-14 border-b border-line bg-surface" />}
          >
            <AppHeader />
          </Suspense>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
