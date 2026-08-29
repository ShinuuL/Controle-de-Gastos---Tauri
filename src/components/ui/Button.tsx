import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    // Ação de peso igual ao primário mas que não é a principal da tela. Sólida
    // de propósito: como "ghost" ela sumia no fundo e não parecia clicável.
    secondary:
      "border border-control-border bg-surface text-foreground hover:bg-background",
    ghost: "text-muted-foreground hover:bg-surface hover:text-foreground",
    danger:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
