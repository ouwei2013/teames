import type { Translations } from "@/i18n/types";

const BUILTIN: Record<string, keyof Translations["app"]["nav"]> = {
  "/chat": "chat",
  "/sessions": "sessions",
  "/analytics": "analytics",
  "/logs": "logs",
  "/cron": "cron",
  "/skills": "skills",
  "/config": "config",
  "/env": "keys",
  "/docs": "documentation",
};

const CUSTOM_TITLES: Record<string, string> = {
  "/admin-chat": "Chat",
  "/enterprise": "Enterprise",
  "/enterprise-builder": "Builder",
  "/local": "Local",
  "/local/chat": "Chat",
  "/local/requests": "Requests",
  "/local/skills": "Skills",
  "/local/tools": "Tools",
  "/local/cron": "Cron",
  "/local/connection": "Remote",
};

export function resolvePageTitle(
  pathname: string,
  t: Translations,
  pluginTabs: { path: string; label: string }[],
): string {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/") {
    return t.app.nav.sessions;
  }
  const plugin = pluginTabs.find((p) => p.path === normalized);
  if (plugin) {
    return plugin.label;
  }
  if (CUSTOM_TITLES[normalized]) {
    return CUSTOM_TITLES[normalized];
  }
  const key = BUILTIN[normalized];
  if (key) {
    return t.app.nav[key];
  }
  return t.app.webUi;
}
