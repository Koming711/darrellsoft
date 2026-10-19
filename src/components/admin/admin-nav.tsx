"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { DarrellLogo } from "@/components/darrellsoft/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { clearAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/administrasi/pembayaran", label: "Pembayaran" },
  { href: "/administrasi/paket", label: "Paket" },
  { href: "/administrasi/pengaturan-pembayaran", label: "Pengaturan" },
] as const;

/** Topbar panel administrasi: logo, judul, menu tab, tombol keluar. */
export function AdminNav() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  function handleLogout() {
    setLoggingOut(true);
    // Proyek ini tidak punya API logout — cukup bersihkan sesi lokal,
    // lalu hard navigation agar state memori & cookie sesi benar-benar segar.
    clearAuthUser();
    window.location.assign("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-4">
        <Link
          href="/administrasi/pembayaran"
          className="shrink-0 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Beranda administrasi Darrellsoft"
        >
          <DarrellLogo size="sm" />
        </Link>
        <span className="hidden shrink-0 text-sm font-semibold tracking-tight sm:inline">
          Administrasi
        </span>
        <span className="hidden h-5 w-px shrink-0 bg-border sm:block" />

        {/* Menu: scroll horizontal di layar kecil */}
        <nav className="scrollbar-thin -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1">
          {ADMIN_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] shrink-0 gap-2"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          <span className="hidden sm:inline">Keluar</span>
        </Button>
      </div>
    </header>
  );
}

/**
 * Kerangka halaman administrasi: header + main terpusat + footer mini.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <AdminNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Darrellsoft — Panel Administrasi
        </div>
      </footer>
    </div>
  );
}

/**
 * Guard halaman admin: kartu spinner saat memuat sesi, kartu login bila belum
 * masuk, kartu penolakan bila bukan admin/superadmin. Children hanya dirender
 * untuk administrator.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useSession();

  if (loading) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent
          className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6"
          role="status"
          aria-label="Memuat"
        >
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memeriksa sesi…</p>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md border-amber-200">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <ShieldAlert className="size-10 text-amber-500" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Silakan login sebagai admin</h2>
            <p className="text-sm text-muted-foreground">
              Halaman ini memerlukan akses administrator Darrellsoft.
            </p>
          </div>
          <Button asChild className="min-h-[44px]">
            <Link href="/login">Menu Halaman Login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-md border-destructive/30">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <ShieldAlert className="size-10 text-destructive" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Akses ditolak</h2>
            <p className="text-sm text-muted-foreground">
              Halaman ini khusus administrator.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
