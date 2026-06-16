#!/usr/bin/env bash
set -uo pipefail
# 补充状态截图:候补中 / 报名失败(候补未晋升) / 完整分组 / 查看排名 / 查看详细 / 查看其他场次
BASE="${BASE_URL:-https://klookbadminton.duckdns.org}"
DEV="${DEV_SECRET:-$(grep -h '^DEV_SECRET=' "$HOME/Downloads/e2e-tests/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '"'\'' ')}"
[ -z "$DEV" ] && { echo "❌ 无 DEV_SECRET(设 env 或确保 ~/Downloads/e2e-tests/.env 里有)"; exit 1; }
DIR="${1:-$HOME/Downloads/badminton-补充状态截图}"; mkdir -p "$DIR"
HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; PORT=9222
stage(){ curl -s -X POST $BASE/api/dev/session-stage -H 'content-type: application/json' -d "{\"secret\":\"$DEV\",\"stage\":\"$1\"}" >/dev/null; }
login(){ curl -s -i -X POST $BASE/api/dev/login -H 'content-type: application/json' -d "{\"secret\":\"$DEV\",\"openId\":\"$1\",\"name\":\"$2\"}" | grep -i '^set-cookie:' | sed -E 's/^set-cookie: *([^;]*).*/\1/' | tr -d '\r'; }

echo "reset + 报名到候补"
curl -s -X POST $BASE/api/dev/reset -H 'content-type: application/json' -d "{\"secret\":\"$DEV\"}" >/dev/null
stage signup_open
SID=$(curl -s "$BASE/api/sessions/current" | python3 -c "import sys,json;print(json.load(sys.stdin)['session']['id'])")
# 再报 2 个把 16 位填满并溢出到候补:w1→正式#16, w2→候补#17
for u in w1 w2; do
  C=$(login "test_user_$u" "候补$u")
  curl -s -b "$C" -X POST "$BASE/api/sessions/$SID/signup" -H 'content-type: application/json' -d '{"preferredCourtType":"竞技","gender":"男"}' >/dev/null
done
COOKIE_W=$(login "test_user_w2" "候补w2")
echo "候补用户 test_user_w2 状态:"
curl -s -b "$COOKIE_W" "$BASE/api/sessions/current" | python3 -c "import sys,json;d=json.load(sys.stdin);m=d.get('mySignup');print('  isWaitlist=',m and m.get('isWaitlist'),'pos=',m and m.get('position'))"

COOKIE_P=$(login "mock_user_01" "陈大力")
echo "填比分"
stage in_progress
ids=$(curl -s -b "$COOKIE_P" "$BASE/api/sessions/current" | python3 -c "import sys,json;print(' '.join(str(m['id']) for m in (json.load(sys.stdin).get('matches') or [])))")
n=0; for mid in $ids; do if [ $((n%2)) -eq 0 ]; then b=11; else b=13; fi; curl -s -b "$COOKIE_P" -X POST "$BASE/api/matches/$mid/score" -H 'content-type: application/json' -d "{\"scoreA\":15,\"scoreB\":$b}" >/dev/null; n=$((n+1)); done
echo "  已填 $n 场"

pkill -9 -f "Google Chrome.*--headless" 2>/dev/null; sleep 1
P=$(mktemp -d /tmp/bdmchrome.XXXX)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$P" --no-proxy-server --remote-allow-origins='*' --remote-debugging-port=$PORT about:blank >/dev/null 2>&1 &
CHPID=$!; sleep 2
shot(){ # stage cookie file clickText
  stage "$1"
  node "$HERE/cdp-shot.mjs" "$BASE" "$DIR/$3" "$2" 500 1180 $PORT "${4:-}" >/dev/null 2>&1 && echo "  ✓ $3" || echo "  ✗ $3"
}
echo "截图:"
shot signup_open   "$COOKIE_W" "1-候补中.png"            ""
shot signup_closed "$COOKIE_W" "2-报名失败-候补未晋升.png" ""
shot in_progress   "$COOKIE_P" "3-完整分组.png"          "完整分组"
shot in_progress   "$COOKIE_P" "4-查看排名.png"          "查看排名"
shot finished      "$COOKIE_P" "5-查看详细.png"          "查看详细"
shot finished      "$COOKIE_P" "6-查看其他场次.png"       "查看其他场次"

kill -9 $CHPID 2>/dev/null; pkill -9 -f "Google Chrome.*--headless" 2>/dev/null; rm -rf "$P"
stage signup_open
echo "OUTDIR=$DIR"