import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import type { LeaderboardEntry } from "../api";

/**
 * 排行榜 + 海报生成
 * 改为嵌入式组件,可放在任何浮层里
 * data 由父组件传入(可以是按 session 的也可以是按 court 的)
 */
export function LeaderboardPosterEmbed({
  title, subtitle, dateLabel, entries,
}: {
  title: string;
  subtitle: string;
  dateLabel: string;
  entries: LeaderboardEntry[];
}) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const generate = async () => {
    if (!posterRef.current) return;
    setDownloading(true);
    setError(null);
    try {
      const canvas = await html2canvas(posterRef.current, {
        backgroundColor: "#1A1B3A",
        scale: 2,
        useCORS: true,
        logging: false,
        // 不依赖外部字体的回退
        onclone: (doc) => {
          const node = doc.querySelector(".poster") as HTMLElement | null;
          if (node) {
            node.style.fontFamily =
              "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";
          }
        },
      });
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/png"));
      if (!blob) throw new Error("生成图片失败");
      const url = URL.createObjectURL(blob);

      // 优先尝试直接下载(桌面)
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `klookbadminton_${dateLabel}.png`;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(url);
        }, 1500);
      } catch (e) {
        // 退到预览模式(手机长按保存)
        setPreviewUrl(url);
      }
      // 总是 fall through 到预览, 让用户能看到生成出来的效果
      setPreviewUrl(url);
    } catch (err: any) {
      setError(err?.message ?? "下载失败");
    } finally {
      setDownloading(false);
    }
  };

  if (entries.length === 0) {
    return (
      <div className="empty" style={{ padding: 20 }}>
        <div className="empty-icon">🤷</div>
        没有比赛数据
      </div>
    );
  }

  return (
    <>
      <div className="poster-wrapper">
        <div ref={posterRef} className="poster">
          <div className="poster-bg-glow" />
          <div className="poster-header">
            <div className="poster-emoji">🏸</div>
            <div className="poster-title">{title}</div>
            <div className="poster-subtitle">{subtitle}</div>
            <div className="poster-date">{dateLabel}</div>
          </div>

          {entries.length >= 3 && (
            <div className="poster-top3">
              <PodiumCard entry={entries[1]} place={2} />
              <PodiumCard entry={entries[0]} place={1} large />
              <PodiumCard entry={entries[2]} place={3} />
            </div>
          )}

          <div className="poster-rest">
            {entries.slice(entries.length >= 3 ? 3 : 0).map((e) => (
              <div className="poster-row" key={e.name + e.rank}>
                <span className="poster-rank">{e.rank}</span>
                <div className="avatar sm">{initials(e.name)}</div>
                <span className="poster-name">{e.name}</span>
                <span className="poster-stat">
                  <strong>{e.wins}</strong>
                  <span> 胜</span>
                </span>
                <span className={"poster-diff " + (e.scoreDiff >= 0 ? "pos" : "neg")}>
                  {e.scoreDiff >= 0 ? "+" : ""}{e.scoreDiff}
                </span>
              </div>
            ))}
          </div>

          <div className="poster-footer">
            Klook Badminton · {entries.length} 人参赛
          </div>
        </div>
      </div>

      <button className="btn-primary" disabled={downloading} onClick={generate}>
        {downloading ? "生成中…" : "📸 生成排行榜海报"}
      </button>

      {error && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}

      {previewUrl && (
        <div className="poster-preview">
          <div className="hint" style={{ textAlign: "center", marginBottom: 6 }}>
            📥 已生成 — 桌面端会自动下载;手机端长按下方图片保存到相册
          </div>
          <img src={previewUrl} alt="排行榜海报" style={{ width: "100%", borderRadius: 12 }} />
        </div>
      )}

      <div className="hint" style={{ textAlign: "center", marginTop: 8 }}>
        排序:胜场 → 净胜分 → 总得分
      </div>
    </>
  );
}

function PodiumCard({
  entry, place, large,
}: {
  entry: LeaderboardEntry;
  place: number;
  large?: boolean;
}) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className={"podium-card " + (large ? "podium-large" : "")}>
      <div className="podium-medal">{medals[place - 1]}</div>
      <div className={"avatar " + (large ? "lg" : "md")}>{initials(entry.name)}</div>
      <div className="podium-name">{entry.name}</div>
      <div className="podium-wl">
        <strong>{entry.wins}</strong>胜
        <span className="podium-sep">·</span>
        <span className={entry.scoreDiff >= 0 ? "pos" : "neg"}>
          {entry.scoreDiff >= 0 ? "+" : ""}{entry.scoreDiff}
        </span>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}
