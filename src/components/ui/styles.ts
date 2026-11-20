// Shared class names so every button and field looks the same.

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110",
  secondary: "border border-line bg-raised text-ink hover:bg-surface",
  ghost: "text-muted hover:bg-surface hover:text-ink",
  danger: "bg-danger text-bg hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function btn(variant: Variant = "primary", size: Size = "md") {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-muted/70 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";
