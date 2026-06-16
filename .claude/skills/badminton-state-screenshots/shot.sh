#!/usr/bin/env bash
# 客乐羽 · 各状态截图测试
# 用法:
#   ./shot.sh                      # 默认 4 个状态,输出到 ~/Downloads/badminton-states-<时间戳>
#   ./shot.sh <输出目录>            # 指定输出目录
#   ./shot.sh <输出目录> "signup_open finished"   # 只截指定状态
# 结束后会把环境恢复到 signup_open(可报名)。
#
# 依赖来源(无需手填):
#   BASE_URL    环境变量,缺省 https://klookbadminton.duckdns.org
#   DEV_SECRET  环境变量,缺省从 ~/Downloads/e2e-tests/.env 读取
set -uo pipefail

BASE="${BASE_URL:-https://klookbadminton.duckdns.org}"
DEV="${DEV_SECRET:-$(grep -h '^DEV_SECRET=' "$HOME/Downloads/e2e-tests/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"'\'' ')}"
OUT="${1:-$HOME/Downloads/badminton-states-$(date +%Y%m%d-%H%M%S)}"
STAGES="${2:-signup_open signup_closed in_progress finished}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ -z "$DEV" ]; then echo "❌ 找不到 DEV_SECRET(设 env 或确保 ~/Downloads/e2e-tests/.env 里有)"; exit 1; fi
if [ ! -x "$CHROME" ]; then echo "❌ 找不到 Google Chrome"; exit 1; fi
mkdir -p "$OUT"

# 探测 dev 端点是否启用
probe=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST "$BASE/api/dev/session-stage" \
  -H 'content-type: application/json' -d "{\"secret\":\"__probe__\",\"stage\":\"signup_open\"}")
[ "$probe" = "404" ] && { echo "❌ 服务器未启用 DEV_SECRET(dev 端点 404),先在服务器 .env 设置并重启 backend"; exit 1; }

label () {  # stage -> 文件名前缀
  case "$1" in
    signup_open)   echo "1-报名";;
    signup_closed) echo "2-分组";;
    in_progress)   echo "3-比赛";;
    finished)      echo "4-赛后";;
    *)             echo "$1";;
  esac
}

pkill -9 -f "Google Chrome.*--headless" 2>/dev/null; sleep 1

for st in $STAGES; do
  # ① 切状态(必须紧贴截图,dev 阶段用相对时间会随真实时钟漂移)
  curl -s -m 15 -X POST "$BASE/api/dev/session-stage" -H 'content-type: application/json' \
    -d "{\"secret\":\"$DEV\",\"stage\":\"$st\"}" >/dev/null
  name="$(label "$st")"
  file="$OUT/$name-$st.png"
  # ② headless 截图。关键:独立 profile(避免锁冲突)+ --no-proxy-server(绕开内网 PAC)
  P=$(mktemp -d /tmp/bdmchrome.XXXX)
  # 宽度 500:app max-width 480 + 余量,避免右侧被切
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$P" --no-proxy-server \
    --window-size=500,1180 --virtual-time-budget=6000 --force-device-scale-factor=2 \
    --screenshot="$file" "$BASE" >/dev/null 2>&1 &
  pid=$!
  # ③ 比赛/赛后页有 20s 轮询,Chrome 可能不退出 → 等文件出现(最多 25s)后强杀
  for _ in $(seq 1 25); do [ -s "$file" ] && break; sleep 1; done
  kill -9 "$pid" 2>/dev/null
  rm -rf "$P"
  if [ -s "$file" ]; then echo "✓ $st -> $name-$st.png ($(stat -f%z "$file") bytes)"; else echo "✗ $st 失败"; fi
done

# 收尾:恢复到可报名 + 清理残留 headless
curl -s -m 15 -X POST "$BASE/api/dev/session-stage" -H 'content-type: application/json' \
  -d "{\"secret\":\"$DEV\",\"stage\":\"signup_open\"}" >/dev/null
pkill -9 -f "Google Chrome.*--headless" 2>/dev/null
echo "OUTDIR=$OUT"
