// 共用工具

export function fmt(iso: string | Date, full = false): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: tz,
    month: full ? "long" : "numeric",
    day: "numeric",
    weekday: full ? "short" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function fmtTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}
