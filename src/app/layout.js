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
      { url: "/corre-aqui-icon.svg", type: "image/svg+xml" },
      { url: "/logo-corre-aqui.png.png", type: "image/png" },
    ],
    shortcut: "/corre-aqui-icon.svg",
    apple: "/logo-corre-aqui.png.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
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
