import { type CurrentSessionResponse } from "../api";
import { ProgressBar, deriveStage } from "../components/ProgressBar";
import { StagePreview } from "../components/stages/StagePreview";
import { StageSignup } from "../components/stages/StageSignup";
import { StageAssigned } from "../components/stages/StageAssigned";
import { StagePlaying } from "../components/stages/StagePlaying";
import { StageAfter } from "../components/stages/StageAfter";

/**
 * 当前活动页主入口
 * - 顶部进度条 + 倒计时
 * - 按 stage 渲染对应组件
 */
export function ActivityPage({
  data, onReload, onClickUser,
}: {
  data: CurrentSessionResponse | null;
  onReload: () => void;
  onClickUser: (openId: string) => void;
}) {
  if (!data) {
    return <div className="empty"><div className="empty-icon">⏳</div>加载中…</div>;
  }

  const stage = deriveStage(data.session.state);

  return (
    <>
      <ProgressBar session={data.session} />

      {stage === "preview" && <StagePreview data={data} />}
      {stage === "signup" && (
        <StageSignup data={data} onChange={onReload} onClickUser={onClickUser} />
      )}
      {stage === "assigned" && (
        <StageAssigned data={data} onClickUser={onClickUser} />
      )}
      {stage === "playing" && (
        <StagePlaying data={data} onChange={onReload} />
      )}
      {stage === "after" && <StageAfter data={data} />}
    </>
  );
}
