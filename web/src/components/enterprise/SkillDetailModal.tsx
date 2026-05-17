import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, X } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SkillDetail, SkillInfo } from "@/lib/api";

type SkillDetailModalProps = {
  skill: SkillInfo | null;
  detail?: SkillDetail;
  loading?: boolean;
  onClose: () => void;
};

function skillFiles(skill?: Pick<SkillInfo, "files"> | null): Array<{ label: string; bytes?: number }> {
  return (skill?.files || []).map((file) =>
    typeof file === "string"
      ? { label: file }
      : { label: file.path || "file", bytes: file.bytes },
  );
}

export function SkillDetailModal({
  skill,
  detail,
  loading = false,
  onClose,
}: SkillDetailModalProps) {
  useEffect(() => {
    if (!skill) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, skill]);

  if (!skill) return null;

  const source = detail?.source || skill.source || "builtin";
  const files = skillFiles(detail || skill);
  const content = detail?.content || skill.description || "";
  const titleId = `skill-detail-${skill.name}`;

  const modal = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={source === "agent_custom" || source === "custom" ? "success" : "outline"}>
                {source === "agent_custom" ? "Business" : source === "custom" ? "Custom" : "Built-in"}
              </Badge>
              <span className="font-courier text-xs normal-case text-muted-foreground">
                {detail?.category || skill.category || "general"}
              </span>
            </div>
            <h2 id={titleId} className="truncate text-xl font-semibold normal-case text-midground">
              {skill.name}
            </h2>
            {(detail?.description || skill.description) && (
              <p className="mt-1 line-clamp-2 text-sm normal-case text-muted-foreground">
                {detail?.description || skill.description}
              </p>
            )}
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Close skill details">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 font-courier text-sm normal-case text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading skill content
            </div>
          ) : (
            <div className="grid min-h-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="min-w-0 space-y-3 rounded-lg border border-border bg-background/45 p-3 font-courier text-xs normal-case text-muted-foreground">
                {detail?.path && (
                  <div className="min-w-0">
                    <div className="mb-1 text-midground">Path</div>
                    <div className="break-all">{detail.path}</div>
                  </div>
                )}
                {detail?.skill_dir && (
                  <div className="min-w-0">
                    <div className="mb-1 text-midground">Directory</div>
                    <div className="break-all">{detail.skill_dir}</div>
                  </div>
                )}
                {files.length > 0 && (
                  <div>
                    <div className="mb-1 text-midground">Files</div>
                    <div className="space-y-1">
                      {files.map((file) => (
                        <div key={`${file.label}-${file.bytes || 0}`} className="flex min-w-0 items-start gap-2">
                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="break-all">
                            {file.label}
                            {file.bytes ? ` (${file.bytes} bytes)` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail?.linked_files &&
                  Object.entries(detail.linked_files).map(([group, names]) => (
                    <div key={group}>
                      <div className="mb-1 text-midground">{group}</div>
                      <div className="space-y-1">
                        {names.map((name) => (
                          <div key={name} className="break-all">
                            {name}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </aside>

              <section className="min-w-0 rounded-lg border border-border bg-background/70 p-4">
                {content ? (
                  <div className="min-w-0 overflow-x-auto break-words">
                    <Markdown content={content} />
                  </div>
                ) : (
                  <div className="font-courier text-sm normal-case text-muted-foreground">
                    No content available.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
