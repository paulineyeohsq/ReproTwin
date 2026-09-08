import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_STYLES: Record<Variant, string> = {
  // Solid Deep Espresso with cream text — the palette's primary CTA
  // treatment. Deliberately not `--brand` (Terracotta), which this
  // palette reserves for accents/highlights, not primary actions.
  primary: "bg-[var(--ink)] text-[var(--background)] hover:bg-[var(--ink-dark)]",
  secondary: "bg-[var(--ink)]/90 text-[var(--background)] hover:bg-[var(--ink)]",
  outline: "border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
  ghost: "text-[var(--foreground-secondary)] hover:bg-[var(--surface-muted)]",
  danger: "bg-[var(--error)] text-white hover:opacity-90",
};

const SIZE_STYLES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  // Mobile-first primary actions need a real >=44px touch target, not just
  // a bigger font — used for Start Ride / End Ride / permission CTAs etc.
  lg: "min-h-[52px] px-5 text-base",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className
      )}
      {...props}
    />
  );
}
