import type { Rank } from "../api";

/**
 * 段位/勋章模块当前隐藏 - 等优化策略后再开放。
 * 保留组件签名,所有引用处无需改动。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RankBadge(_props: {
  rank: Rank | null;
  size?: "sm" | "md";
  compact?: boolean;
}) {
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function RankHero(_props: { rank: Rank }) {
  return null;
}
