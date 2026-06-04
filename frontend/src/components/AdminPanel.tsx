import { useEffect, useState } from "react";
import {
  api, type AdminConfig, type CurrentSessionResponse, type UserPref,
} from "../api";
import { OpsTab } from "./OpsTab";

type Tab = "members" | "config" | "ops";

export function AdminPanel({
  data, onChange,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>("members");

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex" }}>
          <button
            className={"tab " + (tab === "members" ? "active" : "")}
            onClick={() => setTab("members")}
          >🔧 分组</button>
          <button
            className={"tab " + (tab === "config" ? "active" : "")}
            onClick={() => setTab("config")}
          >⚙️ 配置</button>
          <button
            className={"tab " + (tab === "ops" ? "active" : "")}
            onClick={() => setTab("ops")}
          >🛠 运维</button>
        </div>
      </div>

      {tab === "members" && <MembersTab data={data} onChange={onChange} />}
      {tab === "config" && <ConfigTab data={data} onChange={onChange} />}
      {tab === "ops" && <OpsTab />}
    </>
  );
}

// ============ 分组管理 Tab ============

function MembersTab({
  data, onChange,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
}) {
  const { session, courts, assignments } = data;
  const [adding, setAdding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onReassign = async () => {
    if (!confirm("将清空当前分组并重新生成,确定?")) return;
    try { await api.admin.reassign(session.id); onChange(); }
    catch (err: any) { setError(err.message); }
  };

  const onRegenRotation = async () => {
    if (!confirm("将清空当前轮转表并重新生成,确定?")) return;
    try { await api.admin.regenerateRotation(session.id); onChange(); }
    catch (err: any) { setError(err.message); }
  };

  const onMove = async (assignmentId: number, newCourtId: number) => {
    try { await api.admin.moveAssignment(assignmentId, newCourtId); onChange(); }
    catch (err: any) { setError(err.message); }
  };

  const onDelete = async (assignmentId: number) => {
    if (!confirm("确定删除该成员?")) return;
    try { await api.admin.deleteAssignment(assignmentId); onChange(); }
    catch (err: any) { setError(err.message); }
  };

  const grouped = new Map<number, typeof assignments>();
  if (assignments) {
    for (const a of assignments) {
      const arr = grouped.get(a.courtId) ?? [];
      arr.push(a);
      grouped.set(a.courtId, arr);
    }
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={onReassign} style={{ flex: 1 }}>
            🎲 重新分组
          </button>
          <button className="btn-secondary" onClick={onRegenRotation} style={{ flex: 1 }}>
            🔄 重生成轮转
          </button>
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          截止后可手动调整;重新分组会清掉手动修改
        </div>
      </div>

      {!assignments && (
        <div className="card">
          <div className="empty">截止前无法调整分组</div>
        </div>
      )}

      {assignments && courts.map((c) => {
        const members = (grouped.get(c.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div className="card" key={c.id}>
            <div className="court-header">
              <span className={`badge ${c.court_type === "竞技" ? "badge-accent" : "badge-primary"}`}>
                {c.court_type === "竞技" ? "🔥 竞技" : "☕ 休闲"}
              </span>
              <h3>{c.name}</h3>
              <span className="court-meta">{members.length}/{c.max_players}</span>
              <button className="btn-link" onClick={() => setAdding(c.id)}>+ 添加</button>
            </div>

            {members.length === 0 ? (
              <div className="empty" style={{ padding: 14 }}>—</div>
            ) : (
              <ul className="signup-list">
                {members.map((m, idx) => (
                  <li key={m.id} className="signup-item">
                    <span className="position">{idx + 1}</span>
                    <div className="avatar">{initials(m.userName)}</div>
                    <span className="name">
                      {m.userName}
                      {m.isManual && <span className="meta">(手动)</span>}
                      {m.gender && <span className="meta">{m.gender}</span>}
                    </span>
                    <select
                      value={m.courtId}
                      onChange={(e) => onMove(m.id, Number(e.target.value))}
                      style={{ fontSize: 12, padding: "6px 8px" }}
                    >
                      {courts.map((cc) => (
                        <option key={cc.id} value={cc.id}>{cc.name}</option>
                      ))}
                    </select>
                    <button
                      className="btn-link"
                      style={{ color: "var(--danger)" }}
                      onClick={() => onDelete(m.id)}
                    >删除</button>
                  </li>
                ))}
              </ul>
            )}

            {adding === c.id && (
              <AddMemberForm
                courtId={c.id}
                onDone={() => { setAdding(null); onChange(); }}
                onCancel={() => setAdding(null)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function AddMemberForm({
  courtId, onDone, onCancel,
}: {
  courtId: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"history" | "manual">("history");
  const [history, setHistory] = useState<UserPref[]>([]);
  const [filter, setFilter] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualGender, setManualGender] = useState<"男" | "女" | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.getHistoryUsers().then((r) => setHistory(r.users));
  }, []);

  const filtered = history.filter((u) =>
    u.userName.toLowerCase().includes(filter.toLowerCase()),
  );

  const addFromHistory = async (openId: string) => {
    setSubmitting(true);
    try {
      await api.admin.addToCourtFromHistory(courtId, openId);
      onDone();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const addManual = async () => {
    if (!manualName.trim()) { setError("请输入姓名"); return; }
    setSubmitting(true);
    try {
      await api.admin.addToCourtManual(
        courtId, manualName.trim(), manualGender || undefined,
      );
      onDone();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{
      marginTop: 14, padding: 14,
      background: "var(--bg-overlay)",
      borderRadius: "var(--radius)",
      border: "1px solid var(--border)",
    }}>
      {error && <div className="error-banner">{error}</div>}
      <div className="seg" style={{ marginBottom: 12 }}>
        <button
          className={"seg-item " + (mode === "history" ? "active" : "")}
          onClick={() => setMode("history")}
        >从历史挑选</button>
        <button
          className={"seg-item " + (mode === "manual" ? "active" : "")}
          onClick={() => setMode("manual")}
        >手动录入</button>
      </div>

      {mode === "history" && (
        <>
          <input
            placeholder="🔍 搜索姓名…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-input"
            style={{ marginBottom: 10 }}
          />
          <div style={{ maxHeight: 220, overflow: "auto" }}>
            {filtered.length === 0
              ? <div className="empty" style={{ padding: 14 }}>无匹配</div>
              : filtered.map((u) => (
                <div key={u.larkOpenId}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 4px",
                    borderBottom: "1px solid var(--border)",
                  }}>
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                    {initials(u.userName)}
                  </div>
                  <span style={{ flex: 1, fontWeight: 700 }}>
                    {u.userName}
                    {u.gender && <span className="meta">{u.gender}</span>}
                  </span>
                  <button
                    className="btn-link" disabled={submitting}
                    onClick={() => addFromHistory(u.larkOpenId)}
                  >+ 加入</button>
                </div>
              ))}
          </div>
        </>
      )}

      {mode === "manual" && (
        <>
          <input
            placeholder="姓名"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            className="text-input"
            style={{ marginBottom: 10 }}
          />
          <div className="seg" style={{ marginBottom: 10 }}>
            {(["男", "女"] as const).map((g) => (
              <button key={g}
                className={"seg-item " + (manualGender === g ? "active" : "")}
                onClick={() => setManualGender(g)}>{g}</button>
            ))}
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            可不选性别,但会影响轮转算法
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-secondary" disabled={submitting} onClick={onCancel}>
          取消
        </button>
        {mode === "manual" && (
          <button className="btn-primary" disabled={submitting} onClick={addManual}
            style={{ flex: 1 }}>
            {submitting ? "添加中…" : "确认添加"}
          </button>
        )}
      </div>
    </div>
  );
}

// ============ 系统配置 Tab ============

function ConfigTab({
  data: _data, onChange,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
}) {
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.admin.getConfig().then(setCfg);
  }, []);

  if (!cfg) return <div className="card"><div className="empty">加载配置…</div></div>;

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 2000);
  };

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {/* 场地模板 */}
      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">🏟️</span>场地配置
        </h3>
        <div className="hint" style={{ marginBottom: 12 }}>
          下周生效;改完点「重建本周场地」可立即应用到本周
        </div>
        {(cfg.courtsTemplate ?? []).map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className="text-input" style={{ flex: 1 }}
              placeholder="名称" value={c.name}
              onChange={(e) => {
                const v = [...(cfg.courtsTemplate ?? [])];
                v[i] = { ...v[i], name: e.target.value };
                setCfg({ ...cfg, courtsTemplate: v });
              }}
            />
            <select
              value={c.court_type}
              onChange={(e) => {
                const v = [...(cfg.courtsTemplate ?? [])];
                v[i] = { ...v[i], court_type: e.target.value as any };
                setCfg({ ...cfg, courtsTemplate: v });
              }}
            >
              <option value="竞技">竞技</option>
              <option value="休闲">休闲</option>
            </select>
            <input
              className="text-input" type="number" min={2} max={20}
              style={{ width: 60, textAlign: "center" }}
              value={c.max_players}
              onChange={(e) => {
                const v = [...(cfg.courtsTemplate ?? [])];
                v[i] = { ...v[i], max_players: Number(e.target.value) };
                setCfg({ ...cfg, courtsTemplate: v });
              }}
            />
            <button
              className="btn-icon" style={{ color: "var(--danger)" }}
              onClick={() => {
                const v = (cfg.courtsTemplate ?? []).filter((_, j) => j !== i);
                setCfg({ ...cfg, courtsTemplate: v });
              }}
            >🗑</button>
          </div>
        ))}
        <button
          className="btn-link"
          onClick={() => setCfg({
            ...cfg,
            courtsTemplate: [
              ...(cfg.courtsTemplate ?? []),
              { name: "新场地", court_type: "休闲", max_players: 8 },
            ],
          })}
        >+ 增加场地</button>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            className="btn-primary" disabled={saving}
            onClick={async () => {
              setSaving(true); setError(null);
              try {
                await api.admin.setCourtsTemplate(cfg.courtsTemplate!);
                flash("✓ 已保存");
              } catch (err: any) { setError(err.message); }
              finally { setSaving(false); }
            }}
            style={{ flex: 1 }}
          >保存</button>
          <button
            className="btn-secondary"
            onClick={async () => {
              if (!confirm("将清空本周已有的分组和比赛,确定?")) return;
              try {
                await api.admin.recreateCourts(_data.session.id);
                onChange(); flash("✓ 本周场地已重建");
              } catch (err: any) { setError(err.message); }
            }}
          >重建本周</button>
        </div>
      </div>

      {/* 时间表 */}
      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">⏰</span>时间配置
        </h3>
        <div className="hint" style={{ marginBottom: 12 }}>下周生效</div>
        {cfg.schedule && (
          <>
            <ScheduleRow label="报名开始(星期)" value={cfg.schedule.signup_open_dow}
              onChange={(v) => setCfg({ ...cfg, schedule: { ...cfg.schedule!, signup_open_dow: v } })}
              options={dowOptions}
            />
            <ScheduleNumber label="报名开始(时)" value={cfg.schedule.signup_open_hour} min={0} max={23}
              onChange={(v) => setCfg({ ...cfg, schedule: { ...cfg.schedule!, signup_open_hour: v } })}
            />
            <ScheduleNumber label="报名开始(分)" value={cfg.schedule.signup_open_minute} min={0} max={59}
              onChange={(v) => setCfg({ ...cfg, schedule: { ...cfg.schedule!, signup_open_minute: v } })}
            />
            <ScheduleRow label="活动日(星期)" value={cfg.schedule.event_dow}
              onChange={(v) => setCfg({ ...cfg, schedule: { ...cfg.schedule!, event_dow: v } })}
              options={dowOptions}
            />
            <ScheduleNumber label="活动开始(时)" value={cfg.schedule.event_start_hour} min={0} max={23}
              onChange={(v) => setCfg({ ...cfg, schedule: { ...cfg.schedule!, event_start_hour: v } })}
            />
            <ScheduleNumber label="活动结束(时)" value={cfg.schedule.event_end_hour} min={0} max={23}
              onChange={(v) => setCfg({ ...cfg, schedule: { ...cfg.schedule!, event_end_hour: v } })}
            />
            <ScheduleNumber label="提前截止(小时)" value={cfg.schedule.signup_close_hours_before_event} min={0} max={48}
              onChange={(v) => setCfg({ ...cfg, schedule: { ...cfg.schedule!, signup_close_hours_before_event: v } })}
            />
          </>
        )}
        <button
          className="btn-primary" disabled={saving}
          onClick={async () => {
            setSaving(true); setError(null);
            try {
              await api.admin.setSchedule(cfg.schedule!);
              flash("✓ 已保存");
            } catch (err: any) { setError(err.message); }
            finally { setSaving(false); }
          }}
          style={{ marginTop: 12 }}
        >保存</button>
      </div>

      {/* admin open_id */}
      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">🔑</span>管理员 Open ID
        </h3>
        <div className="hint" style={{ marginBottom: 12 }}>
          以 <code>ou_</code> 开头的飞书 user open_id。
          新管理员先让对方登录一次,再从 signups 表或日志中取他的 open_id。
        </div>
        {(cfg.adminOpenIds ?? []).map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className="text-input"
              style={{ flex: 1, fontFamily: "Outfit, monospace", fontSize: 12 }}
              value={e}
              placeholder="ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              onChange={(ev) => {
                const v = [...(cfg.adminOpenIds ?? [])];
                v[i] = ev.target.value.trim();
                setCfg({ ...cfg, adminOpenIds: v });
              }}
            />
            <button
              className="btn-icon" style={{ color: "var(--danger)" }}
              onClick={() => setCfg({
                ...cfg, adminOpenIds: (cfg.adminOpenIds ?? []).filter((_, j) => j !== i),
              })}
            >🗑</button>
          </div>
        ))}
        <button className="btn-link"
          onClick={() => setCfg({
            ...cfg, adminOpenIds: [...(cfg.adminOpenIds ?? []), ""],
          })}
        >+ 增加</button>
        <button
          className="btn-primary" disabled={saving}
          onClick={async () => {
            const list = (cfg.adminOpenIds ?? []).map((s) => s.trim()).filter(Boolean);
            if (list.length === 0) { setError("至少保留 1 个管理员"); return; }
            for (const id of list) {
              if (!id.startsWith("ou_")) {
                setError(`open_id 格式非法:${id}`); return;
              }
            }
            setSaving(true); setError(null);
            try {
              await api.admin.setAdminOpenIds(list);
              flash("✓ 已保存");
            } catch (err: any) { setError(err.message); }
            finally { setSaving(false); }
          }}
          style={{ marginTop: 12 }}
        >保存</button>
      </div>

      {/* 单场分数上限 */}
      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">🎯</span>单场分数上限
        </h3>
        <div className="hint" style={{ marginBottom: 8 }}>
          任一队达到此分数时,该轮判为结束,下一轮自动进入 LIVE
        </div>
        <div className="seg" style={{ marginBottom: 8 }}>
          {[7, 11, 15, 21].map((n) => (
            <button
              key={n}
              className={"seg-item" + (cfg.scoreCap === n ? " active" : "")}
              onClick={() => setCfg({ ...cfg, scoreCap: n })}
            >
              {n} 分制
            </button>
          ))}
        </div>
        <button
          className="btn-primary" disabled={saving}
          onClick={async () => {
            setSaving(true); setError(null);
            try {
              await api.admin.setScoreCap(cfg.scoreCap);
              flash("✓ 已保存");
            } catch (err: any) { setError(err.message); }
            finally { setSaving(false); }
          }}
        >保存</button>
      </div>

      {/* 球场信息 */}
      <div className="card">
        <h3 className="card-title">
          <span className="card-title-icon">🏟</span>球场信息
        </h3>
        <div className="hint" style={{ marginBottom: 8 }}>
          会在「场次预告」和「报名 / 分组 / 比赛」状态顶部展示
        </div>
        <div className="form-row">
          <label className="form-label">球场名称</label>
          <input className="text-input" type="text"
            value={cfg.venue?.name ?? ""}
            placeholder="例:朝阳体育中心 1 号馆"
            onChange={(e) => setCfg({
              ...cfg, venue: { ...(cfg.venue ?? { name: "", address: "" }), name: e.target.value },
            })}
          />
        </div>
        <div className="form-row">
          <label className="form-label">地址</label>
          <input className="text-input" type="text"
            value={cfg.venue?.address ?? ""}
            placeholder="例:朝阳区xx路 88 号 B 馆"
            onChange={(e) => setCfg({
              ...cfg, venue: { ...(cfg.venue ?? { name: "", address: "" }), address: e.target.value },
            })}
          />
        </div>
        <button
          className="btn-primary" disabled={saving}
          onClick={async () => {
            setSaving(true); setError(null);
            try {
              await api.admin.setVenue(cfg.venue?.name ?? "", cfg.venue?.address ?? "");
              flash("✓ 已保存");
            } catch (err: any) { setError(err.message); }
            finally { setSaving(false); }
          }}
        >保存</button>
      </div>
    </>
  );
}

const dowOptions: [number, string][] = [
  [1, "周一"], [2, "周二"], [3, "周三"], [4, "周四"],
  [5, "周五"], [6, "周六"], [0, "周日"],
];

function ScheduleRow({
  label, value, onChange, options,
}: {
  label: string; value: number;
  onChange: (v: number) => void;
  options: [number, string][];
}) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function ScheduleNumber({
  label, value, onChange, min, max,
}: {
  label: string; value: number;
  onChange: (v: number) => void;
  min: number; max: number;
}) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <input className="text-input" style={{ width: 80, textAlign: "center" }}
        type="number" min={min} max={max}
        value={value} onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}
