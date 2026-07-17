import { Geist, Geist_Mono } from "next/font/google";
import PWARegister from "@/components/PWARegister";
import HideNextDevIndicatorMobile from "@/components/HideNextDevIndicatorMobile";
import { TutorialProvider } from "@/components/tutorial/TutorialProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://corre-aqui.app";
const appDescription = "Corre Aqui conecta clientes, corres e profissionais locais para resolver pedidos, servicos e conversas com mais seguranca.";

export const metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Corre Aqui",
  title: {
    default: "Corre Aqui",
    template: "%s | Corre Aqui",
  },
  description: appDescription,
  manifest: "/manifest.webmanifest",
  keywords: [
    "Corre Aqui",
    "servicos locais",
    "corres",
    "profissionais",
    "pedidos",
    "chat",
  ],
  authors: [{ name: "Corre Aqui" }],
  creator: "Corre Aqui",
  publisher: "Corre Aqui",
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
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "Corre Aqui",
    title: "Corre Aqui",
    description: appDescription,
    images: [
      {
        url: "/corre-aqui-icon-512.png",
        width: 512,
        height: 512,
        alt: "Corre Aqui",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Corre Aqui",
    description: appDescription,
    images: ["/corre-aqui-icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
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
        <TutorialProvider>
          {children}
        </TutorialProvider>
        <div id="modal-root" />
      </body>
    </html>
  );
}
