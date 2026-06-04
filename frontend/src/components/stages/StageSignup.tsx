import { useEffect, useState } from "react";
import {
  api, type CurrentSessionResponse, type Rank,
} from "../../api";
import { SignupQueueModal } from "../SignupQueueModal";

/**
 * 报名中状态
 * - 未报名 → 报名表单
 * - 已报名(正式) → 我的状态卡 + 取消
 * - 已报名(候补) → 候补提示卡 + 取消
 * - 共用: "查看报名队列" 入口(弹窗)
 */
export function StageSignup({
  data, onChange, onClickUser,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
  onClickUser: (openId: string) => void;
}) {
  const { session, signups, mySignup, me, venue } = data;
  const [showQueue, setShowQueue] = useState(false);

  // 拉段位(队列弹窗用)
  const [ranks, setRanks] = useState<Record<string, Rank>>({});
  useEffect(() => {
    const ids = signups.map((s) => s.larkOpenId);
    if (ids.length === 0) return;
    api.bulkRanks(ids).then((r) => setRanks(r.ranks)).catch(() => {});
  }, [signups]);

  const formal = signups.filter((s) => !s.isWaitlist);
  const waitlist = signups.filter((s) => s.isWaitlist);

  return (
    <>
      {/* 顶部场地信息 + 简要状态 */}
      <div className="card venue-card">
        {venue.name && (
          <>
            <div className="venue-name">🏟 {venue.name}</div>
            {venue.address && <div className="venue-addr">{venue.address}</div>}
          </>
        )}
      </div>

      {mySignup ? (
        mySignup.isWaitlist
          ? <MyWaitlistCard data={data} onChange={onChange} />
          : <MyFormalCard data={data} onChange={onChange} />
      ) : (
        <NewSignupForm data={data} onChange={onChange} />
      )}

      {/* 报名队列入口 */}
      <button className="btn-secondary" onClick={() => setShowQueue(true)}>
        📝 查看报名队列 ({formal.length}/{session.maxSlots}
        {waitlist.length > 0 && <> +{waitlist.length} 候补</>}
        )
      </button>

      {showQueue && (
        <SignupQueueModal
          signups={signups}
          maxSlots={session.maxSlots}
          myOpenId={me?.openId ?? null}
          ranks={ranks}
          onClose={() => setShowQueue(false)}
          onClickUser={(id) => { setShowQueue(false); onClickUser(id); }}
        />
      )}
    </>
  );
}

/* ---------- 已报正式 ---------- */
function MyFormalCard({
  data, onChange,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
}) {
  const { session, mySignup } = data;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCancel = async () => {
    if (!confirm("确定取消报名吗?")) return;
    setSubmitting(true); setError(null);
    try {
      await api.cancel(session.id);
      onChange();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="card my-status-card">
      {error && <div className="error-banner">{error}</div>}
      <div className="status-icon">✓</div>
      <div className="status-title">你已报名</div>
      <div className="status-sub">
        #{mySignup!.position} 正式名单
        {mySignup!.preferredCourtType && (
          <> · 偏好 {mySignup!.preferredCourtType}</>
        )}
      </div>
      <button className="btn-danger" disabled={submitting} onClick={onCancel}
        style={{ marginTop: 12 }}>
        {submitting ? "处理中…" : "取消报名"}
      </button>
    </div>
  );
}

/* ---------- 已报候补 ---------- */
function MyWaitlistCard({
  data, onChange,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
}) {
  const { session, mySignup, signups } = data;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 我前面还有几个候补
  const myWaitlistIdx = signups
    .filter((s) => s.isWaitlist)
    .findIndex((s) => s.larkOpenId === mySignup!.larkOpenId);
  const aheadCount = Math.max(0, myWaitlistIdx);

  const onCancel = async () => {
    if (!confirm("确定取消报名吗?")) return;
    setSubmitting(true); setError(null);
    try {
      await api.cancel(session.id);
      onChange();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="card my-status-card waitlist">
      {error && <div className="error-banner">{error}</div>}
      <div className="status-icon">⏳</div>
      <div className="status-title">你在候补</div>
      <div className="status-sub">
        候补 #{aheadCount + 1}
        {aheadCount > 0 ? <> · 前面还有 {aheadCount} 人</> : <> · 你是第一候补</>}
      </div>
      <div className="hint" style={{ margin: "8px 0 12px" }}>
        🔔 有人取消后会将你前进一位,成功入选则会通知你
      </div>
      <button className="btn-danger" disabled={submitting} onClick={onCancel}>
        {submitting ? "处理中…" : "取消候补"}
      </button>
    </div>
  );
}

/* ---------- 未报名 → 报名表单 ---------- */
function NewSignupForm({
  data, onChange,
}: {
  data: CurrentSessionResponse;
  onChange: () => void;
}) {
  const { session, myPref, courts } = data;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const courtTypes = uniq(courts.map((c) => c.court_type));
  const [pickedCourt, setPickedCourt] = useState<"竞技" | "休闲">(
    (myPref?.lastCourtType as any) ?? (courtTypes[0] as any) ?? "竞技",
  );
  const [pickedGender, setPickedGender] = useState<"男" | "女" | "">(
    (myPref?.gender as any) ?? "",
  );

  const onSignUp = async () => {
    if (!pickedGender) {
      setError("请选择性别"); return;
    }
    setSubmitting(true); setError(null);
    try {
      await api.signUp(session.id, {
        preferredCourtType: pickedCourt,
        gender: pickedGender,
      });
      onChange();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      <div className="form-row">
        <label className="form-label">场地偏好</label>
        <div className="seg">
          {courtTypes.map((t) => (
            <button key={t}
              className={"seg-item" + (pickedCourt === t ? " active" : "")}
              onClick={() => setPickedCourt(t)}
            >
              {t === "竞技" ? "🔥 竞技场" : "☕ 休闲场"}
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label className="form-label">性别(用于轮转算法)</label>
        <div className="seg">
          {(["男", "女"] as const).map((g) => (
            <button key={g}
              className={"seg-item" + (pickedGender === g ? " active" : "")}
              onClick={() => setPickedGender(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <button className="btn-primary" disabled={submitting} onClick={onSignUp}>
        {submitting ? "处理中…" : "🚀 立即报名"}
      </button>
    </div>
  );
}

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
