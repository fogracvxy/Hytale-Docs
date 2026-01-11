import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { CookieConsent } from "@/components/cookie-consent";
import { AdblockDetector } from "@/components/ads";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  const descriptions: Record<string, string> = {
    fr: "Documentation communautaire pour Hytale. Guides de gameplay, modding, serveurs et reference API.",
    en: "Community documentation for Hytale. Gameplay, modding, servers and API reference guides.",
  };

  return {
    metadataBase: new URL("https://hytaledocs.com"),
    title: {
      default: "HytaleDocs",
      template: "%s | HytaleDocs",
    },
    description: descriptions[locale] || descriptions.fr,
    keywords: [
      "Hytale",
      "documentation",
      "modding",
      "wiki",
      "guide",
      "gameplay",
      "serveur",
      "API",
    ],
    authors: [{ name: "Hytale Community" }],
    icons: {
      icon: [
        { url: "/icon.png", type: "image/png" },
        { url: "/logo-h.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [{ url: "/apple-icon.png", type: "image/png" }],
      shortcut: "/logo-h.png",
    },
    openGraph: {
      title: "HytaleDocs",
      description: descriptions[locale] || descriptions.fr,
      type: "website",
      locale: locale === "fr" ? "fr_FR" : "en_US",
      images: [
        {
          url: "/logo-h.png",
          width: 512,
          height: 512,
          alt: "HytaleDocs",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: "HytaleDocs",
      description: descriptions[locale] || descriptions.fr,
      images: ["/logo-h.png"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate that the incoming locale is valid
  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Providing all messages to the client
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Google AdSense */}
        <meta name="google-adsense-account" content="ca-pub-4389631952462736" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4389631952462736"
          crossOrigin="anonymous"
        />
        {/* Umami Analytics */}
        <Script
          defer
          src="https://umami.3de-scs.tech/script.js"
          data-website-id="749f7e31-1125-4e87-bf50-b10dce51adce"
          strategy="lazyOnload"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          storageKey="hytaledocs-theme"
        >
          <NextIntlClientProvider messages={messages}>
            {children}
            <CookieConsent />
            <AdblockDetector />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
