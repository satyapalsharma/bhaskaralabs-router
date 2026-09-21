import type { Metadata } from "next";
import { headers } from "next/headers";
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/lib/auth";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

const serif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-src-serif",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Bhaskara Labs — frontier intelligence, priced per unit of it",
    template: "%s — Bhaskara Labs",
  },
  description:
    "Our own theta model and GLM-5.3, served to coding agents behind two endpoints — with the routing, the cache accounting and the cost ledger all disclosed. From the land that gave zero to the world.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="flex min-h-dvh flex-col antialiased">
        <SiteNav signedIn={!!session?.user} />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
