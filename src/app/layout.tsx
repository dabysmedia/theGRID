import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { BottomNav } from "@/components/BottomNav"
import { Providers } from "@/components/Providers"
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "theGRID",
  description: "Tactical health & fitness command system",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "theGRID",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1e2029",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full min-h-dvh antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nabla&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-dvh flex-col bg-background text-foreground relative overflow-x-hidden">
        <div className="page-bg" aria-hidden />

        {/* Subtle scan-line overlay */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[100]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(1 0 0 / 1%) 2px, oklch(1 0 0 / 1%) 4px)",
            opacity: 0.12,
          }}
        />

        <div className="relative z-0 flex min-h-dvh flex-1 flex-col">
          <Providers>
            <div className="flex min-h-dvh flex-1 flex-col">
              <main
                className="
              mx-auto flex w-full max-w-full flex-1 flex-col
              ps-[max(0.75rem,env(safe-area-inset-left,0px))] pe-[max(0.75rem,env(safe-area-inset-right,0px))]
              pt-[calc(env(safe-area-inset-top,0px)+2rem)] pb-[calc(6rem+env(safe-area-inset-bottom,0px))]
              sm:ps-4 sm:pe-4 md:ps-6 md:pe-6
              md:max-w-2xl lg:max-w-3xl xl:max-w-5xl
              lg:px-8 xl:px-10
              animate-fade-in
            "
              >
                {children}
              </main>

              <BottomNav />
            </div>
          </Providers>
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
