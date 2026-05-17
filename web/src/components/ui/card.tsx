import { cn } from "@/lib/utils";

/**
 * Themed card primitive. Themes can restyle every card without touching
 * call sites by setting CSS vars under the `card` component-style bucket:
 *
 *   componentStyles:
 *     card:
 *       clipPath: "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)"
 *       border: "1px solid var(--color-ring)"
 *       background: "linear-gradient(180deg, var(--color-card) 0%, transparent 100%)"
 *       boxShadow: "0 0 0 1px var(--color-ring) inset, 0 0 24px -8px var(--warm-glow)"
 *
 * All properties are optional — vars that aren't set compute to their
 * CSS initial value, so the default shadcn-y card keeps looking normal
 * for themes that don't override anything.
 */
const CARD_STYLE: React.CSSProperties = {
  clipPath: "var(--component-card-clip-path)",
  borderImage: "var(--component-card-border-image)",
  background: "var(--component-card-background)",
  boxShadow: "var(--component-card-box-shadow)",
};

export function Card({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/75 text-card-foreground w-full shadow-sm",
        className,
      )}
      style={{ ...CARD_STYLE, ...style }}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-4 border-b border-border/70", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-[-0.01em] normal-case", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs leading-5 text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
