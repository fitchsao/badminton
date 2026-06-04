import { sendPrivateCard } from "../lark.js";
import { config } from "../config.js";

/**
 * 集中所有飞书私信卡片的生成 + 发送逻辑
 * 所有发送失败都吞掉,不阻塞主流程,仅写日志
 */

type Logger = { info?: Function; warn?: Function; error?: Function };

interface CardOptions {
  title: string;
  emoji: string;
  body: string;
  buttonText?: string;
  buttonUrl?: string;
  color?: "blue" | "green" | "orange" | "red" | "purple";
}

function buildCard(o: CardOptions): object {
  const elements: any[] = [
    {
      tag: "div",
      text: { tag: "lark_md", content: `**${o.emoji} ${o.body}**` },
    },
  ];
  if (o.buttonText && o.buttonUrl) {
    elements.push({
      tag: "action",
      actions: [{
        tag: "button",
        text: { tag: "plain_text", content: o.buttonText },
        type: "primary",
        url: o.buttonUrl,
      }],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: {
      template: o.color ?? "purple",
      title: { tag: "plain_text", content: o.title },
    },
    elements,
  };
}

/**
 * 候补晋升通知
 */
export async function notifyPromoted(
  openId: string,
  userName: string,
  ctx: { sessionId: number; eventStartAt: Date },
  logger?: Logger,
): Promise<void> {
  const card = buildCard({
    emoji: "🎉",
    title: "你已晋升为正式名单",
    body: `${userName},有人取消了,你已从候补晋升为正式!\n活动: ${fmtTime(ctx.eventStartAt)}`,
    buttonText: "查看详情",
    buttonUrl: `${config.app.baseUrl}/?session_id=${ctx.sessionId}`,
    color: "green",
  });
  try {
    await sendPrivateCard(openId, card);
    logger?.info?.({ openId, userName }, "已发送候补晋升通知");
  } catch (err) {
    logger?.warn?.({ err, openId }, "候补晋升通知发送失败");
  }
}

/**
 * 报名开放提醒(订阅触发)
 */
export async function notifySignupOpen(
  openId: string,
  userName: string,
  ctx: { sessionId: number; eventStartAt: Date },
  logger?: Logger,
): Promise<void> {
  const card = buildCard({
    emoji: "⏰",
    title: "本周羽毛球报名已开放",
    body: `${userName},你预约的报名提醒来了!\n活动: ${fmtTime(ctx.eventStartAt)}\n手快有手慢无,马上去抢名额吧 🏸`,
    buttonText: "立即报名",
    buttonUrl: `${config.app.baseUrl}/?session_id=${ctx.sessionId}`,
    color: "purple",
  });
  try {
    await sendPrivateCard(openId, card);
    logger?.info?.({ openId, userName }, "已发送报名开放提醒");
  } catch (err) {
    logger?.warn?.({ err, openId }, "报名开放提醒发送失败");
  }
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: config.app.tz,
    month: "long", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}
