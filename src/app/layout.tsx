import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/auth-context";
import { LanguageProvider } from "@/contexts/language-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { NextThemesProvider } from "@/components/providers/next-themes-provider";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { SplashScreen } from "@/components/splash-screen";
import { InstallPrompt } from "@/components/install-prompt";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { NavigationProgressBar } from "@/components/navigation-progress";
import { DocumentLanguageSync } from "@/components/document-language-sync";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Darrell Soft - Kalkulator Hitung Cetakan",
  description: "Aplikasi kalkulator hitung cetakan profesional",
  icons: {
    icon: "/favicon-32x32.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Darrell Soft",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Inline script to capture beforeinstallprompt event BEFORE React hydrates.
            This is critical because the event can fire before any React component mounts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__deferredInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.__deferredInstallPrompt = e;
                // Dispatch custom event so React components know the prompt is ready
                window.dispatchEvent(new Event('installpromptready'));
              });
            `,
          }}
        />
      </head>
      <body
        className={`${poppins.variable} font-sans antialiased bg-background text-foreground`}
        style={{ fontFamily: 'var(--font-poppins), Arial, Helvetica, sans-serif' }}
      >
        <AuthProvider>
          <LanguageProvider>
            <DocumentLanguageSync />
            <NextThemesProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              <ThemeProvider>
                <NavigationProgressBar />
                <SplashScreen>
                  {children}
                </SplashScreen>
              </ThemeProvider>
              <Toaster />
              <SonnerToaster />
            </NextThemesProvider>
            <InstallPrompt />
            <WhatsNewDialog />
          </LanguageProvider>
        </AuthProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
