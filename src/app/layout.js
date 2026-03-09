import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Corre Aqui",
  description: "Corre Aqui – resolva rápido com IA",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
          antialiased
          relative
          z-[1]
          text-gray-100
        `}
      >
        {children}

        {/* ✅ ROOT FIXO PARA MODAIS (Portal) */}
        <div id="modal-root" />
      </body>
    </html>
  );
}
