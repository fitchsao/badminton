import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * 「📅 提醒我下周报名」 按钮
 * 已订阅则显示 ✓ 状态,再点取消
 */
export function SubscribeButton() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [targetWeekStart, setTargetWeekStart] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.subscription.status()
      .then((r) => { setSubscribed(r.subscribed); setTargetWeekStart(r.targetWeekStart); })
      .catch(() => setSubscribed(false));
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (subscribed) {
        await api.subscription.unsubscribe();
        setSubscribed(false);
      } else {
        await api.subscription.subscribe();
        setSubscribed(true);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (subscribed === null) return null;

  return (
    <button
      className={subscribed ? "btn-secondary" : "btn-primary"}
      disabled={busy} onClick={toggle}
      style={{ width: "100%" }}
    >
      {busy ? "处理中…"
        : subscribed
          ? `✓ 已预约 ${targetWeekStart} 报名提醒(点击取消)`
          : `📅 提醒我下周报名 (${targetWeekStart})`}
    </button>
  );
}
