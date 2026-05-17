import { Typography } from "@nous-research/ui";
import { useSidebarStatus } from "@/hooks/useSidebarStatus";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export function SidebarFooter() {
  const status = useSidebarStatus();
  const { t } = useI18n();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-2",
        "px-5 py-2.5",
        "border-t border-current/10",
      )}
    >
      <Typography
        mondwest
        className="font-mono-ui text-[0.7rem] tabular-nums tracking-[0.1em] text-muted-foreground/70"
      >
        {status?.version != null ? `v${status.version}` : "—"}
      </Typography>

      <a
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "text-[0.65rem] font-medium tracking-[-0.005em] text-muted-foreground",
          "transition-opacity hover:opacity-90",
          "focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/40",
        )}
      >
        {t.app.footer.org}
      </a>
    </div>
  );
}
