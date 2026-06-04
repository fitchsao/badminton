import { useEffect, useState } from "react";
import { api } from "../api";

interface OpsData {
  recentSessions: { id: number; signup_open_at: string; event_start_at: string;
    lark_message_id: string | null; created_at: string }[];
  audit: { id: number; actor_open_id: string; actor_name: string;
    action: string; target: string | null; created_at: string }[];
  serverNow: string;
}

export function OpsTab() {
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.admin.opsStatus().then(setData).catch((e) => setError(e.message));
  };

  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setSuccess(m); setTimeout(() => setSuccess(null), 2500); };

  const trigger = async () => {
    if (!confirm("立即触发本周报名(若已触发将跳过)?")) return;
    setBusy(true); setError(null);
    try {
      await api.admin.triggerSignup();
      flash("✓ 已触发");
      load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">🛠</span>运维操作
        </h3>
        <button className="btn-primary" disabled={busy} onClick={trigger}>
          🚀 立即触发本周报名
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          幂等;若本周已发过卡片不会重复发
        </div>
      </div>

      {data && (
        <>
          <div className="card">
            <h3 className="card-title">
              <span className="card-title-icon">📅</span>最近 Session
            </h3>
            <div className="hint" style={{ marginBottom: 8 }}>
              服务器时间: {new Date(data.serverNow).toLocaleString("zh-CN")}
            </div>
            {data.recentSessions.length === 0
              ? <div className="empty">无</div>
              : data.recentSessions.map((s) => (
                <div className="row" key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="label">#{s.id}</span>
                  <span className="value" style={{ fontSize: 12 }}>
                    创建 {new Date(s.created_at).toLocaleString("zh-CN")}<br />
                    活动 {new Date(s.event_start_at).toLocaleString("zh-CN")}<br />
                    卡片 {s.lark_message_id ? "✓" : "✗"}
                  </span>
                </div>
              ))}
          </div>

          <div className="card">
            <h3 className="card-title">
              <span className="card-title-icon">📋</span>最近 Admin 操作
            </h3>
            {data.audit.length === 0
              ? <div className="empty">暂无</div>
              : <ul className="audit-list">
                {data.audit.map((a) => (
                  <li key={a.id}>
                    <div className="audit-time">
                      {new Date(a.created_at).toLocaleString("zh-CN", { hour12: false })}
                    </div>
                    <div>
                      <strong>{a.actor_name}</strong>{" "}
                      <span className="badge badge-muted">{a.action}</span>
                    </div>
                  </li>
                ))}
              </ul>}
          </div>
        </>
      )}
    </>
  );
}
