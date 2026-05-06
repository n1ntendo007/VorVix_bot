import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VorVix_bot",
  description: "Telegram bot logic panel"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="bg-grid" />
        {children}
      </body>
    </html>
  );
}
