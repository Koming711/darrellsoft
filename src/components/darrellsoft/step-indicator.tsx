import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Daftar", "Pilih Paket", "Pembayaran", "Verifikasi", "Selesai"] as const;

/**
 * Indikator langkah alur pendaftaran/langganan.
 * step: 1..5
 */
export function StepIndicator({ step, className }: { step: number; className?: string }) {
  return (
    <nav aria-label="Langkah pendaftaran" className={cn("w-full", className)}>
      <ol className="flex items-center w-full">
        {STEPS.map((label, i) => {
          const idx = i + 1;
          const done = idx < step;
          const active = idx === step;
          return (
            <li key={label} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
                <span
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold border transition-colors",
                    done && "bg-primary text-primary-foreground border-primary",
                    active && "bg-primary text-primary-foreground border-primary ring-4 ring-primary/15",
                    !done && !active && "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {done ? <Check size={14} strokeWidth={3} /> : idx}
                </span>
                <span
                  className={cn(
                    "text-[10px] sm:text-xs font-medium whitespace-nowrap",
                    active ? "text-foreground font-semibold" : done ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    "mx-1 sm:mx-2 h-0.5 flex-1 rounded-full min-w-4",
                    done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
