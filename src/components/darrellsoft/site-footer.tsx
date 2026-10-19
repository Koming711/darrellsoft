import Link from "next/link";
import { DarrellLogo } from "@/components/darrellsoft/logo";

/** Footer global Darrellsoft — menempel di bawah layar bila konten pendek (mt-auto). */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-foreground transition-colors">
            Beranda
          </Link>
          <Link href="/pilih-paket" className="hover:text-foreground transition-colors">
            Paket Langganan
          </Link>
          <Link href="/login" className="hover:text-foreground transition-colors">
            Masuk
          </Link>
        </div>
        <p>© {new Date().getFullYear()} Darrell Soft — Aplikasi Bisnis Percetakan</p>
      </div>
    </footer>
  );
}
