import { useEffect, useState } from "react";

/**
 * 倒计时显示
 * - 距离 > 1 天: DD 天 HH:MM
 * - 距离 < 1 天: HH:MM:SS
 * - 已过: 显示 "已过"
 */
export function CountdownText({
  targetIso, prefix = "",
}: {
  targetIso: string;
  prefix?: string;
}) {
  const target = new Date(targetIso).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const diffMs = target - now;
    if (diffMs <= 0) return;
    // <1 天用 1 秒更新,>1 天用 30 秒更新
    const interval = diffMs < 86400_000 ? 1000 : 30_000;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [target, now]);

  const ms = target - now;
  if (ms <= 0) return <span className="countdown countdown-done">{prefix}已开始</span>;

  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days >= 1) {
    return (
      <span className="countdown">
        {prefix}
        <strong>{days}</strong> 天 <strong>{pad(hours)}</strong>:<strong>{pad(mins)}</strong>
      </span>
    );
  }
  return (
    <span className="countdown countdown-urgent">
      {prefix}
      <strong>{pad(hours)}</strong>:<strong>{pad(mins)}</strong>:<strong>{pad(secs)}</strong>
    </span>
  );
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}
