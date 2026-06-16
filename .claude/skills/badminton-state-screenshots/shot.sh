#!/usr/bin/env bash
# 客乐羽 · 各状态截图测试(含真实数据 + 参赛者登录视角)
#
# 流程:reset 灌 15 个报名 → 登录某参赛者 → 填比分(让赛后有战绩)
#       → 逐个状态切换 + 用 CDP 注入登录态截图 → 恢复到 signup_open
#
# 用法:
#   ./shot.sh                         # 全状态,输出 ~/Downloads/badminton-states-<时间戳>
#   ./shot.sh <输出目录>
#   ./shot.sh <输出目录> "signup_open finished"
# 可调环境变量:
#   BASE_URL    缺省 https://klookbadminton.duckdns.org
#   DEV_SECRET  缺省读 ~/Downloads/e2e-tests/.env
#   LOGIN_ID    登录的 mock 用户 openId,缺省 mock_user_01(注意补零!陈大力,竞技场)
#   LOGIN_NAME  缺省 陈大力
#   FILL_SCORES 缺省 1(填比分);设 0 跳过
set -uo pipefail

BASE="${BASE_URL:-https://klookbadminton.duckdns.org}"
DEV="${DEV_SECRET:-$(grep -h '^DEV_SECRET=' "$HOME/Downloads/e2e-tests/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"'\'' ')}"
OUT="${1:-$HOME/Downloads/badminton-states-$(date +%Y%m%d-%H%M%S)}"
LOGIN_ID="${LOGIN_ID:-mock_user_01}"
LOGIN_NAME="${LOGIN_NAME:-陈大力}"
FILL_SCORES="${FILL_SCORES:-1}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=9222
mkdir -p "$OUT"

[ -z "$DEV" ] && { echo "❌ 无 DEV_SECRET(设 env 或确保 ~/Downloads/e2e-tests/.env 里有)"; exit 1; }
[ -x "$CHROME" ] || { echo "❌ 找不到 Google Chrome"; exit 1; }

stage() { curl -s -m 15 -X POST "$BASE/api/dev/session-stage" -H 'content-type: application/json' -d "{\"secret\":\"$DEV\",\"stage\":\"$1\"}"; }
label() { case "$1" in
  preview) echo "0-预告";; signup_open) echo "1-报名";; signup_closed) echo "2-分组";;
  in_progress) echo "3-比赛";; finished) echo "4-赛后";; *) echo "$1";; esac; }

# 探测 dev 端点
probe=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/dev/session-stage" \
  -H 'content-type: application/json' -d "{\"secret\":\"__probe__\",\"stage\":\"signup_open\"}")
[ "$probe" = "404" ] && { echo "❌ 服务器未启用 DEV_SECRET"; exit 1; }

echo "① reset 灌入 15 个 mock 报名"
curl -s -m 15 -X POST "$BASE/api/dev/reset" -H 'content-type: application/json' -d "{\"secret\":\"$DEV\"}" >/dev/null

# 决定状态列表;自动探测 preview 是否被后端支持(需新后端)
STAGES="${2:-}"
if [ -z "$STAGES" ]; then
  STAGES="signup_open signup_closed in_progress finished"
  if ! stage preview | grep -q "unknown stage"; then
    STAGES="preview $STAGES"
  else
    echo "  ⚠️  后端不支持 preview(预告)→ 跳过;重新部署 backend 后即可"
  fi
fi

# 登录参赛者,拿 bm_user cookie
COOKIE=$(curl -s -m 10 -i -X POST "$BASE/api/dev/login" -H 'content-type: application/json' \
  -d "{\"secret\":\"$DEV\",\"openId\":\"$LOGIN_ID\",\"name\":\"$LOGIN_NAME\"}" \
  | grep -i '^set-cookie:' | sed -E 's/^set-cookie: *([^;]*).*/\1/' | tr -d '\r')
[ -z "$COOKIE" ] && { echo "❌ dev/login 没拿到 cookie"; exit 1; }
echo "② 已登录 $LOGIN_NAME ($LOGIN_ID)"

# 填比分:让 比赛/赛后 有真实战绩
if [ "$FILL_SCORES" = "1" ]; then
  stage in_progress >/dev/null
  ids=$(curl -s -m 15 -b "$COOKIE" "$BASE/api/sessions/current" \
        | python3 -c "import sys,json;print(' '.join(str(m['id']) for m in (json.load(sys.stdin).get('matches') or [])))" 2>/dev/null)
  n=0
  for mid in $ids; do
    if [ $((n % 2)) -eq 0 ]; then b=11; else b=13; fi
    curl -s -m 10 -b "$COOKIE" -X POST "$BASE/api/matches/$mid/score" -H 'content-type: application/json' \
      -d "{\"scoreA\":15,\"scoreB\":$b}" >/dev/null
    n=$((n + 1))
  done
  echo "③ 已填 $n 场比分"
fi

# 启动带调试端口的 headless chrome(复用同一实例跑完所有状态)
pkill -9 -f "Google Chrome.*--headless" 2>/dev/null; sleep 1
P=$(mktemp -d /tmp/bdmchrome.XXXX)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --user-data-dir="$P" --no-proxy-server --remote-allow-origins='*' \
  --remote-debugging-port=$PORT about:blank >/dev/null 2>&1 &
CHPID=$!; sleep 2

echo "④ 逐状态截图(参赛者视角):"
for st in $STAGES; do
  stage "$st" >/dev/null
  name="$(label "$st")"
  if node "$HERE/cdp-shot.mjs" "$BASE" "$OUT/$name-$st.png" "$COOKIE" 500 1180 $PORT >/dev/null 2>&1; then
    echo "   ✓ $st -> $name-$st.png ($(stat -f%z "$OUT/$name-$st.png" 2>/dev/null) bytes)"
  else
    echo "   ✗ $st 失败"
  fi
done

# 收尾
kill -9 $CHPID 2>/dev/null; pkill -9 -f "Google Chrome.*--headless" 2>/dev/null; rm -rf "$P"
stage signup_open >/dev/null
echo "OUTDIR=$OUT"
