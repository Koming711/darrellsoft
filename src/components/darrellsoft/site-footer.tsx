import Link from "next/link";
import { DarrellLogo } from "@/components/darrellsoft/logo";
import { Button } from "@/components/ui/button";

/** Footer global Darrellsoft — menempel di bawah layar bila konten pendek (mt-auto). */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row">
        <nav aria-label="Navigasi footer" className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-11 px-5 sm:h-8 sm:px-3">
            <Link href="/">Beranda</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-11 px-5 sm:h-8 sm:px-3">
            <Link href="/pilih-paket">Paket Langganan</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-11 px-5 sm:h-8 sm:px-3">
            <Link href="/login">Masuk</Link>
          </Button>
        </nav>
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Darrell Soft — Aplikasi Bisnis Percetakan</p>
      </div>
    </footer>
  );
}
