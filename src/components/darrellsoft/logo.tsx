import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

/** Logo + wordmark Darrellsoft. */
export function DarrellLogo({
  className,
  size = "md",
  light = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  light?: boolean;
}) {
  const boxSize = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const iconSize = size === "sm" ? 15 : size === "lg" ? 24 : 19;
  const textSize = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";

  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-lg shadow-sm",
          boxSize,
          light ? "bg-white/15 text-white" : "bg-primary text-primary-foreground"
        )}
      >
        <Printer size={iconSize} strokeWidth={2.2} />
      </span>
      <span className={cn("font-bold tracking-tight", textSize, light ? "text-white" : "text-foreground")}>
        Darrell<span className={light ? "text-teal-200" : "text-primary"}>soft</span>
      </span>
    </span>
  );
}
