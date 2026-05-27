import { Geist, Geist_Mono } from "next/font/google";
import PWARegister from "@/components/PWARegister";
import HideNextDevIndicatorMobile from "@/components/HideNextDevIndicatorMobile";
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
  applicationName: "Corre Aqui",
  title: "Corre Aqui",
  description: "Corre Aqui - encontre alguém perto para resolver hoje",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Corre Aqui",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/corre-aqui-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/corre-aqui-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/corre-aqui-icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b73ff",
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
        <PWARegister />
        <HideNextDevIndicatorMobile />
        {children}
        <div id="modal-root" />
      </body>
    </html>
  );
}
