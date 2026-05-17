import { cn } from "@/lib/utils";

export function TeamesLogo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-gradient-to-br from-white to-blue-50 shadow-sm",
        className,
      )}
    >
      <img
        src="/brand/teames-mark-512.png"
        alt=""
        className="h-[108%] w-[108%] object-contain"
        draggable={false}
      />
    </span>
  );
}

export function TeamesWordmark({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <TeamesLogo />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold tracking-[-0.01em] text-midground">
          Teames
        </div>
        {!compact && (
          <div className="truncate text-xs normal-case text-muted-foreground">
            Team + Hermes for business agents
          </div>
        )}
      </div>
    </div>
  );
}
