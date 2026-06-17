import { useEffect, useState, useCallback } from "react";
import { api, type CurrentSessionResponse } from "./api";
import { ActivityPage } from "./pages/ActivityPage";
import { PersonalPage } from "./pages/PersonalPage";
import { AdminPanel } from "./components/AdminPanel";
import { UserPreviewModal } from "./components/UserPreviewModal";

type BottomTab = "activity" | "personal";

export function App() {
  const [data, setData] = useState<CurrentSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [tab, setTab] = useState<BottomTab>("activity");
  // 点头像 → 简约 modal
  const [previewUser, setPreviewUser] = useState<string | null>(null);
  // 未登录 → 显示登录提示(确认后再跳转飞书授权,而非自动跳)
  const [needLogin, setNeedLogin] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.getCurrentSession();
      // 未登录(无飞书登录态)→ 提示登录,确认后再跳授权
      if (!d.me) {
        setNeedLogin(true);
        return;
      }
      setData(d);
    } catch (err: any) {
      if (err.status === 401) {
        setNeedLogin(true);
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (needLogin) {
    return <LoginPrompt />;
  }

  if (loading) {
    return (
      <div className="app">
        <Header me={null} adminToggle={null} adminActive={false} />
        <div className="card"><div className="empty">加载中…</div></div>
      </div>
    );
  }

  const me = data?.me ?? null;
  const isAdmin = me?.isAdmin ?? false;

  return (
    <div className="app has-bottom-bar">
      <Header
        me={me}
        adminToggle={isAdmin ? () => setShowAdmin(!showAdmin) : null}
        adminActive={showAdmin}
      />
      {error && <div className="error-banner">{error}</div>}

      <div className="page-body fade-up" key={showAdmin ? "admin" : tab}>
        {showAdmin && data ? (
          <AdminPanel data={data} onChange={load} />
        ) : tab === "activity" ? (
          <ActivityPage
            data={data}
            onReload={load}
            onClickUser={setPreviewUser}
          />
        ) : (
          <PersonalPage
            openId={me?.openId ?? null}
            onClickUser={setPreviewUser}
          />
        )}
      </div>

      {/* 底部 tab bar - 在 admin 模式下隐藏 */}
      {!showAdmin && (
        <BottomTabBar tab={tab} onChange={setTab} />
      )}

      {/* 点头像/名字简约弹窗 */}
      {previewUser && (
        <UserPreviewModal
          openId={previewUser}
          onClose={() => setPreviewUser(null)}
          onSeeFull={() => {
            // 跳到个人中心 tab(只支持看自己)
            // 看别人的完整战绩复用同一 modal 内的更多内容,这里简化:关闭弹窗 + 切到个人 tab(看的还是自己)
            // TODO: 完整版需要支持"看别人完整"
            setPreviewUser(null);
            setTab("personal");
          }}
        />
      )}
    </div>
  );
}

function Header({
  me, adminToggle, adminActive,
}: {
  me: { name: string; avatar: string | null; openId: string } | null;
  adminToggle: (() => void) | null;
  adminActive: boolean;
}) {
  return (
    <div className="header">
      <div className="brand">
        <span className="brand-icon">🏸</span>
        <div className="brand-text">
          <div className="brand-name">客乐羽</div>
          <div className="brand-sub">客路羽毛球社团小程序</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {adminToggle && (
          <button
            className={adminActive ? "btn-secondary" : "btn-icon"}
            onClick={adminToggle}
            aria-label="管理面板"
          >
            {adminActive ? "← 返回" : "⚙️"}
          </button>
        )}
        {me && !adminActive && (
          <div className="avatar md" title={me.name}>
            {me.avatar ? <img src={me.avatar} alt="" /> : initials(me.name)}
          </div>
        )}
      </div>
    </div>
  );
}

function BottomTabBar({
  tab, onChange,
}: {
  tab: BottomTab;
  onChange: (t: BottomTab) => void;
}) {
  return (
    <div className="bottom-tab-bar">
      <button
        className={"bottom-tab-item " + (tab === "activity" ? "active" : "")}
        onClick={() => onChange("activity")}
      >
        <span className="bottom-tab-icon">🏸</span>
        <span className="bottom-tab-label">活动</span>
      </button>
      <button
        className={"bottom-tab-item " + (tab === "personal" ? "active" : "")}
        onClick={() => onChange("personal")}
      >
        <span className="bottom-tab-icon">👤</span>
        <span className="bottom-tab-label">个人</span>
      </button>
    </div>
  );
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

function redirectToLarkLogin() {
  const here = window.location.href;
  window.location.href = `/api/auth/start?return=${encodeURIComponent(here)}`;
}

/** 未登录提示页:点击后再跳转飞书授权 */
function LoginPrompt() {
  return (
    <div className="app">
      <div className="login-prompt card">
        <div className="login-prompt-icon">🏸</div>
        <div className="login-prompt-title">需要登录</div>
        <div className="login-prompt-sub">
          使用飞书账号登录后即可查看活动、报名与战绩
        </div>
        <button className="btn-primary" onClick={redirectToLarkLogin}>
          使用飞书登录
        </button>
      </div>
    </div>
  );
}
