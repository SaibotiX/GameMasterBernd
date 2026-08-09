#!/usr/bin/env bash
# The host stack's end-to-end check, run on the dev machine: the production
# shapes (TLS, secret path, basic auth, WebSocket proxy, hardened friend
# container) against the local image, self-signed. Proves 02 item 1's
# config actually carries the game before any of it touches the VPS.
#
#   deploy/host/localcheck.sh          # expects world-console:latest built
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DOOR="https://localhost:8443/f/localtest00000000000000000000"

# A throwaway store in the production layout (R13): under the repo, not
# /tmp — the repo tree is what Docker Desktop provably shares. wc-test
# mounts only its staging slice, exactly like a friend on the box; 777 so
# the container's player uid can write through the bind whatever the
# mapping.
WC_TEST_STORE="$(mktemp -d "$HERE/.localcheck-store.XXXXXX")"
mkdir -p "$WC_TEST_STORE/staging/test" "$WC_TEST_STORE/sessions"
chmod 777 "$WC_TEST_STORE" "$WC_TEST_STORE/staging" "$WC_TEST_STORE/staging/test" "$WC_TEST_STORE/sessions"
export WC_TEST_SHIP="$WC_TEST_STORE/staging/test"

# The house lane, keyless (R12): a throwaway gateway state with two virtual
# keys — one funded, one holding a single micro-dollar so its first turn is
# its last — and the gateway pointed at the pretend-Anthropic stub. The org
# key here is a stand-in; the stub only checks that ONE arrived (custody
# proof: the friend's key never travels upstream).
GATEWAY_STATE="$(mktemp -d "$HERE/.localcheck-gateway.XXXXXX")"
chmod 777 "$GATEWAY_STATE"
cat >"$GATEWAY_STATE/keys.json" <<'KEYS'
{
	"wc-local-good": { "player": "test", "budgetMicro": 1000000, "rpm": 60 },
	"wc-local-broke": { "player": "broke", "budgetMicro": 1, "rpm": 60 }
}
KEYS
export GATEWAY_STATE
export GATEWAY_UPSTREAM="http://stub:9990"
export ANTHROPIC_ORG_KEY="sk-local-stand-in"

# The landing ground's address fixture (R19): the real value lives only in
# the box .env — here a deliberately fake street proves templates render it.
export WC_IMPRESSUM_ADDRESS="Teststraße 1, 0000 Localdorf"

compose() { docker compose -f "$HERE/compose.yaml" --profile local "$@"; }
cleanup() {
	compose down -v --remove-orphans >/dev/null 2>&1 || true
	docker volume rm world-console_restore-check >/dev/null 2>&1 || true
	rm -rf "$WC_TEST_STORE" "$GATEWAY_STATE"
	[ -z "${BK_TMP:-}" ] || rm -rf "$BK_TMP"
}
trap cleanup EXIT

echo "=== up (caddy-local + wc-test + waker + gateway + stub) ==="
compose config -q
compose up -d caddy-local wc-test waker gateway stub

echo "=== door: wrong password is refused ==="
for _ in $(seq 1 20); do
	CODE="$(curl -ks -o /dev/null -w '%{http_code}' "$DOOR/" || true)"
	[ "$CODE" != "000" ] && break
	sleep 0.5
done
[ "$CODE" = "401" ] || { echo "FAIL: expected 401 without auth, got $CODE"; exit 1; }
CODE="$(curl -ks -o /dev/null -w '%{http_code}' -u test:wrong "$DOOR/")"
[ "$CODE" = "401" ] || { echo "FAIL: expected 401 with wrong password, got $CODE"; exit 1; }

echo "=== door: the right pair opens the page ==="
CODE="$(curl -ks -o /dev/null -w '%{http_code}' -u test:local-test-password "$DOOR/")"
[ "$CODE" = "200" ] || { echo "FAIL: expected 200 with auth, got $CODE"; exit 1; }

echo "=== no directory of doors: unmatched paths say nothing ==="
CODE="$(curl -ks -o /dev/null -w '%{http_code}' "https://localhost:8443/")"
[ "$CODE" = "404" ] || { echo "FAIL: expected 404 at /, got $CODE"; exit 1; }

echo "=== the landing ground: the words are served (02 items 9+11, R13/R19/R16) ==="
# The production root block on its local hostname: the loud disclosure, the
# AI sentence (Art. 50(1)), both names (R16), R29's retention sentence, the
# SCC transfer ground, and the Impressum's templates-rendered address.
SITE_RESOLVE="--resolve site.localhost:8443:127.0.0.1"
BODY="$(curl -ks $SITE_RESOLVE "https://site.localhost:8443/")"
grep -q "AI game master" <<<"$BODY" \
	|| { echo "FAIL: the landing is missing the AI sentence"; exit 1; }
grep -q "personally reads" <<<"$BODY" \
	|| { echo "FAIL: the landing softened the human-reads fact"; exit 1; }
grep -q "Hausregel" <<<"$BODY" && grep -q "WORLD CONSOLE" <<<"$BODY" \
	|| { echo "FAIL: the landing is missing a name (R16)"; exit 1; }
BODY="$(curl -ks $SITE_RESOLVE "https://site.localhost:8443/datenschutz.html")"
grep -q "deleted within 30 days at most" <<<"$BODY" \
	|| { echo "FAIL: the note is missing R29's retention sentence"; exit 1; }
grep -q "standard contractual clauses" <<<"$BODY" \
	|| { echo "FAIL: the note is missing the transfer ground"; exit 1; }
BODY="$(curl -ks $SITE_RESOLVE "https://site.localhost:8443/impressum.html")"
grep -q "Teststraße 1, 0000 Localdorf" <<<"$BODY" \
	|| { echo "FAIL: the Impressum address did not render from the env"; exit 1; }
HDRS="$(curl -ksI $SITE_RESOLVE "https://site.localhost:8443/")"
grep -qi "strict-transport-security" <<<"$HDRS" \
	|| { echo "FAIL: the hardening headers are missing"; exit 1; }

echo "=== the whole page carries through the door (prefix strip, auth, TLS) ==="
# appserver-probe walks page + health + pane APIs + the PTY stream — every
# client URL is relative, and THIS is where that promise is proven: behind
# /f/<token>/ with basic auth over self-signed TLS, exactly like a friend.
NODE_TLS_REJECT_UNAUTHORIZED=0 WS_PROBE_AUTH="test:local-test-password" \
	node "$HERE/../image/appserver-probe.mjs" "$DOOR"

echo "=== the house lane: a turn flows through the gateway (R12) ==="
# From INSIDE a friend container — the only vantage that proves the web
# network route, the virtual-key auth, and the upstream swap in one move.
compose exec -T wc-test node -e '
const req = (extra={}) => fetch(process.env.WC_GATEWAY_URL + "/v1/messages", {
	method: "POST",
	headers: { "content-type": "application/json", "anthropic-version": "2023-06-01",
		"x-api-key": process.env.ANTHROPIC_API_KEY },
	body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 32,
		messages: [{ role: "user", content: "knock" }], ...extra }),
});
(async () => {
	const r = await req();
	const j = await r.json();
	if (r.status !== 200 || !(j.usage?.output_tokens > 0)) { console.error("turn refused:", r.status, JSON.stringify(j)); process.exit(1); }
	console.log("turn ok, usage:", JSON.stringify(j.usage));
})();' || { echo "FAIL: no turn flowed through the gateway"; exit 1; }

echo "=== the house lane: cache_control passes through with a hit ==="
compose exec -T wc-test node -e '
const sys = [{ type: "text", text: "stable prefix ".repeat(400), cache_control: { type: "ephemeral" } }];
const turn = () => fetch(process.env.WC_GATEWAY_URL + "/v1/messages", {
	method: "POST",
	headers: { "content-type": "application/json", "anthropic-version": "2023-06-01",
		"x-api-key": process.env.ANTHROPIC_API_KEY },
	body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 32, system: sys,
		messages: [{ role: "user", content: "again" }] }),
}).then((r) => r.json());
(async () => {
	const first = await turn();
	const second = await turn();
	const read = second.usage?.cache_read_input_tokens ?? 0;
	if (!(read > 0)) { console.error("no cache hit:", JSON.stringify({ first: first.usage, second: second.usage })); process.exit(1); }
	console.log("cache hit on the second call:", read, "tokens read");
})();' || { echo "FAIL: cache_control did not survive the gateway"; exit 1; }

echo "=== the house lane: a dry grant refuses the second knock ==="
compose exec -T wc-test node -e '
const turn = () => fetch(process.env.WC_GATEWAY_URL + "/v1/messages", {
	method: "POST",
	headers: { "content-type": "application/json", "anthropic-version": "2023-06-01",
		"x-api-key": "wc-local-broke" },
	body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 32,
		messages: [{ role: "user", content: "last coin" }] }),
});
(async () => {
	const drain = await turn();
	if (drain.status !== 200) { console.error("the single micro-dollar did not buy the first turn:", drain.status); process.exit(1); }
	const after = await turn();
	const j = await after.json();
	if (!(after.status === 400 && j.type === "error" && /grant is spent/.test(j.error?.message ?? ""))) {
		console.error("the dry grant was not refused kindly:", after.status, JSON.stringify(j)); process.exit(1);
	}
	console.log("refused with:", JSON.stringify(j.error.message));
})();' || { echo "FAIL: the dry grant did not refuse"; exit 1; }

echo "=== the house lane: pi itself completes a turn through the gateway ==="
# The whole item-2 wiring in one breath: the shipped .pi/extensions override
# reroutes pi, the container env carries the virtual key and the model, and
# the stub answers — keyless end to end. (--model because this bare exec has
# no app server to pass the flag; the PTY spawn adds it from WC_MODEL.)
PI_OUT="$(compose exec -T wc-test sh -c 'cd /home/player/game && pi --model "$WC_MODEL" --no-session -p "say the word"')" \
	|| { echo "FAIL: pi errored through the lane"; echo "$PI_OUT"; exit 1; }
grep -q "the stub answers" <<<"$PI_OUT" \
	|| { echo "FAIL: pi did not answer through the gateway"; echo "$PI_OUT"; exit 1; }

echo "=== the house lane: the meter recorded every turn ==="
compose exec -T gateway node -e '
fetch("http://127.0.0.1:4100/healthz").then((r) => r.json()).then((h) => {
	const good = h.keys["wc-local-good"], broke = h.keys["wc-local-broke"];
	if (!(good?.spentMicro > 0 && broke?.spentMicro > 0)) { console.error("meter empty:", JSON.stringify(h)); process.exit(1); }
	if (!(good.spentMonthMicro > 0 && h.globalMonthMicro > 0 && h.globalDayMicro > 0)) { console.error("month/day buckets empty:", JSON.stringify(h)); process.exit(1); }
	console.log("meter:", JSON.stringify(h.keys));
});' || { echo "FAIL: the gateway meter recorded nothing"; exit 1; }

echo "=== the house lane: a side call lands TAGGED in the ledger (2026-08-09 ruling) ==="
# gmchat's side voices ride the /side prefix (laneModel); the gateway meters
# them under the same caps but tags the row — reconcile subtracts the tag.
compose exec -T wc-test node -e '
(async () => {
	const r = await fetch(process.env.WC_GATEWAY_URL + "/side/v1/messages", {
		method: "POST",
		headers: { "content-type": "application/json", "anthropic-version": "2023-06-01",
			"x-api-key": process.env.ANTHROPIC_API_KEY },
		body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 32,
			messages: [{ role: "user", content: "a side voice" }] }),
	});
	const j = await r.json();
	if (r.status !== 200 || !(j.usage?.output_tokens > 0)) { console.error("side call refused:", r.status, JSON.stringify(j)); process.exit(1); }
	console.log("side call ok");
})();' || { echo "FAIL: the side call did not flow through /side"; exit 1; }
LAST_ROW="$(tail -1 "$GATEWAY_STATE/usage.jsonl")"
grep -q '"side":true' <<<"$LAST_ROW" \
	|| { echo "FAIL: the side call's ledger row is not tagged"; echo "$LAST_ROW"; exit 1; }
[ "$(grep -c '"side":true' "$GATEWAY_STATE/usage.jsonl")" = "1" ] \
	|| { echo "FAIL: plain turns were tagged side"; exit 1; }

echo "=== the house lane: /grant shows a friend their own window only ==="
compose exec -T wc-test node -e '
(async () => {
	const mine = await fetch(process.env.WC_GATEWAY_URL + "/grant", { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY } }).then((r) => r.json());
	if (!(mine.player === "test" && mine.remainingMicro > 0 && mine.laneOpen === true)) { console.error("grant window wrong:", JSON.stringify(mine)); process.exit(1); }
	if (JSON.stringify(mine).includes("broke")) { console.error("a friend can see another grant"); process.exit(1); }
	const nobody = await fetch(process.env.WC_GATEWAY_URL + "/grant", { headers: { "x-api-key": "not-a-key" } });
	if (nobody.status !== 401) { console.error("a stranger read a grant:", nobody.status); process.exit(1); }
	console.log("grant window:", JSON.stringify(mine));
})();' || { echo "FAIL: the grant window misbehaves"; exit 1; }

echo "=== the ledger's tripwires: the daily alarm pings, the kill-switch stops the lane ==="
# Shrink the ruled values and recreate the gateway: the persisted ledger
# already crosses both shrunken lines, so the gateway PINGS both on waking
# (boot-time tripwire check) and rests the lane — the next knock, any key,
# is refused with the resting message.
export GATEWAY_ALARM_DAY_MICRO=10 GATEWAY_KILL_MICRO=10
compose up -d gateway >/dev/null 2>&1
sleep 1
compose exec -T wc-test node -e '
(async () => {
	const r = await fetch(process.env.WC_GATEWAY_URL + "/v1/messages", {
		method: "POST",
		headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": process.env.ANTHROPIC_API_KEY },
		body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 32, messages: [{ role: "user", content: "one past the line" }] }),
	});
	const j = await r.json();
	if (!(r.status === 400 && /rests this month/.test(j.error?.message ?? ""))) {
		console.error("the tripped kill-switch did not stop the lane:", r.status, JSON.stringify(j)); process.exit(1);
	}
	console.log("the lane rests:", JSON.stringify(j.error.message));
})();' || { echo "FAIL: the kill-switch did not hold"; exit 1; }
docker logs "$(compose ps -q gateway)" 2>&1 | grep -q "ping: THE KILL-SWITCH TRIPPED" \
	|| { echo "FAIL: the kill-switch never pinged"; docker logs "$(compose ps -q gateway)" | tail -5; exit 1; }
docker logs "$(compose ps -q gateway)" 2>&1 | grep -q "ping: Daily spend crossed the alarm line" \
	|| { echo "FAIL: the daily alarm never pinged"; docker logs "$(compose ps -q gateway)" | tail -5; exit 1; }
unset GATEWAY_ALARM_DAY_MICRO GATEWAY_KILL_MICRO
compose up -d gateway >/dev/null 2>&1
sleep 1
compose exec -T gateway node -e '
fetch("http://127.0.0.1:4100/healthz").then((r) => r.json()).then((h) => {
	if (!(h.globalMonthMicro < h.killMicro)) { console.error("lane still resting at ruled values:", JSON.stringify(h)); process.exit(1); }
	console.log("lane open again at the ruled caps (spent", h.globalMonthMicro, "of", h.killMicro, "micro)");
});' || { echo "FAIL: the lane did not reopen at ruled values"; exit 1; }

echo "=== a stop is a seal: a session in the live volumes reaches the store (R13) ==="
# localcheck runs KEYLESS by design — pi cannot finish a turn, so it never
# writes a real session here (the box's end-to-end receipt proves that
# half). Fabricate one in the live volumes instead — same fixture shape as
# verify leg 5 — and let the real seam do the rest: compose stop → SIGTERM
# → pi's hangup → the seal lands in wc-test's staging slice.
# The fixture wears pi's REAL entry shape (id/parentId chain, content as
# text blocks) — pi --continue silently starts fresh on a malformed chain,
# which the resume leg below would misread as a broken feature.
compose exec -T wc-test sh <<'FIXTURE'
set -e
SID=0198bbbb-cccc-7ddd-8eee-ffff00001111
SDIR=/home/player/.pi/agent/sessions/--home-player-game--
STORY=/home/player/game/data/world/localcheck-world/$SID
mkdir -p "$SDIR" "$STORY"
{
	echo '{"type":"session","version":3,"id":"'$SID'","timestamp":"2026-08-09T12:00:00.000Z","cwd":"/home/player/game"}'
	echo '{"type":"message","id":"aaaa0001","parentId":null,"timestamp":"2026-08-09T12:00:10.000Z","message":{"role":"user","content":[{"type":"text","text":"through the door"}],"timestamp":"2026-08-09T12:00:10.000Z"}}'
} > "$SDIR/2026-08-09T12-00-00_$SID.jsonl"
echo '# quests' > "$STORY/quests.md"
FIXTURE
compose stop wc-test
find "$WC_TEST_SHIP" -name sealed | grep -q . \
	|| { echo "FAIL: no sealed session in the store after stop"; ls -laR "$WC_TEST_SHIP"; exit 1; }
MANIFEST="$(find "$WC_TEST_SHIP" -name manifest.json | head -1)"
grep -q '"player": "test"' "$MANIFEST" \
	|| { echo "FAIL: manifest does not name the player"; cat "$MANIFEST"; exit 1; }

echo "=== the one-shot sweep (the host's seam) finds nothing left to do ==="
SWEEP_OUT="$(compose run --rm --no-deps -T --entrypoint "node /opt/appserver/shipper.js sweep" wc-test)"
echo "$SWEEP_OUT" | grep -q '"copied":0' && echo "$SWEEP_OUT" | grep -q '"sealed":0' \
	|| { echo "FAIL: re-sweep of a sealed store was not a no-op"; echo "$SWEEP_OUT"; exit 1; }

echo "=== store side: verify hashes, compact to tar.zst, prune to markers ==="
"$HERE/store-sweep.sh" --store "$WC_TEST_STORE" --compact-only
TAR="$(find "$WC_TEST_STORE/sessions" -name '*.tar.zst' | head -1)"
[ -n "$TAR" ] || { echo "FAIL: no compacted tarball"; ls -laR "$WC_TEST_STORE"; exit 1; }
tar --zstd -tf "$TAR" | grep -q '^session.jsonl$' \
	|| { echo "FAIL: tarball misses session.jsonl"; exit 1; }
find "$WC_TEST_STORE/staging" -name session.jsonl | grep -q . \
	&& { echo "FAIL: staged data files were not pruned"; exit 1; }
find "$WC_TEST_STORE/staging" -name sealed | grep -q . \
	|| { echo "FAIL: the sealed marker did not survive compaction"; exit 1; }

echo "=== store side twice is a no-op ==="
"$HERE/store-sweep.sh" --store "$WC_TEST_STORE" --compact-only
[ "$(find "$WC_TEST_STORE/sessions" -name '*.tar.zst' | wc -l)" = "1" ] \
	|| { echo "FAIL: a second store-sweep changed the store"; exit 1; }

echo "=== the reaper: an idle friend is stopped, and the stop seals ==="
compose up -d wc-test
for _ in $(seq 1 20); do
	compose exec -T wc-test node -e \
		'fetch("http://127.0.0.1:7681/healthz").then(()=>process.exit(0)).catch(()=>process.exit(1))' \
		>/dev/null 2>&1 && break
	sleep 0.5
done
REAP_OUT="$(COMPOSE_PROFILES=local IDLE_LIMIT=0 STORE="$WC_TEST_STORE" "$HERE/reaper.sh" wc-test)"
grep -q "stop: wc-test" <<<"$REAP_OUT" \
	|| { echo "FAIL: the reaper left the idle friend running"; echo "$REAP_OUT"; exit 1; }
compose ps --services --status running | grep -qx wc-test \
	&& { echo "FAIL: wc-test still running after the reaper"; exit 1; }

echo "=== the waker: a knock on the sleeping door wakes the friend ==="
# The reaper just put wc-test to sleep. The first knock must serve the
# waking page (second upstream) AND start the container; within a few
# knocks the real page answers again — start-on-connect, end to end.
BODY="$(curl -ks -u test:local-test-password "$DOOR/")"
grep -qi "waking" <<<"$BODY" \
	|| { echo "FAIL: a sleeping door did not serve the waking page"; echo "$BODY" | head -8; exit 1; }
WOKE=0
for _ in $(seq 1 40); do
	BODY="$(curl -ks -u test:local-test-password "$DOOR/" || true)"
	if grep -q "assets/app.js" <<<"$BODY"; then WOKE=1; break; fi
	sleep 0.5
done
[ "$WOKE" = 1 ] || { echo "FAIL: the friend never woke behind the door"; exit 1; }

echo "=== resume: the woken console carries the sitting (02 §sizing) ==="
# The fixture session is in the woken container's volume; attaching must
# spawn pi with --continue, whose transcript replay shows the fixture's own
# words. A fresh spawn would never print them.
# Strip terminal escapes before matching — the phrase can arrive chopped
# across styled repaint runs — and give a cold container time to boot pi
# and replay. Exits as soon as the phrase lands.
RESUME_OUT="$(compose exec -T wc-test node -e '
const {WebSocket}=require("/opt/appserver/node_modules/ws");
const ws=new WebSocket("ws://127.0.0.1:7681/ws/term");
let buf="";
const clean=()=>buf.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g,"").replace(/\x1b\][^\x07]*\x07/g,"");
const probe=setInterval(()=>{if(clean().includes("through the door")){console.log("RESUMED");process.exit(0)}},500);
ws.on("message",(d,b)=>{if(b)buf+=d.toString("utf8")});
ws.on("open",()=>{ws.send(JSON.stringify({t:"resize",cols:120,rows:30,attach:true}));
setTimeout(()=>{console.log("TIMEOUT after 20s; screen tail:");console.log(clean().split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean).slice(-12).join("\n"));process.exit(1)},20000)});
ws.on("error",()=>process.exit(1));')" \
	|| { echo "FAIL: the woken console did not resume the sitting"; echo "$RESUME_OUT"; exit 1; }
grep -q RESUMED <<<"$RESUME_OUT" \
	|| { echo "FAIL: the woken console did not resume the sitting"; echo "$RESUME_OUT"; exit 1; }

echo "=== the chronicle serves marked: x-ai-generated on world prose (Art. 50(2)) ==="
# The fixture's quests.md is chronicle prose — its served copy must say
# AI-generated; the constitution is human law and must not (probe holds
# that half). Through the real door, auth and prefix strip and all.
HDRS="$(curl -ksI -u test:local-test-password "$DOOR/files/data/world/localcheck-world/0198bbbb-cccc-7ddd-8eee-ffff00001111/quests.md")"
grep -qi "^x-ai-generated: true" <<<"$HDRS" \
	|| { echo "FAIL: chronicle prose served without the AI marking"; echo "$HDRS"; exit 1; }

echo "=== reconciliation: the two meters agree, and a lie is caught (R12/R6) ==="
# The first receipt for reconcile.sh, fully fabricated: a gateway ledger row
# and a pi cost stamp that MATCH (4520 micro vs usage.cost.total 0.004520),
# then the ghost-row rules — a keyless ghost (removed player, §deletion's
# residue) reports benignly, a keyed ghost (a live player with no volume)
# exits red — and last the epoch floor: pre-lane days answer green. The
# honest day passes, the lie pages. NTFY_TOPIC is forced empty: tests
# never page.
# A fixed post-epoch day: reconcile only string-matches timestamps against
# --day, so the fixture needs no relation to the wall clock — and the real
# today can still be pre-epoch while this check runs.
RECON_DAY="2026-08-15"
# The side row (999000 micro, tagged) would blow the 5% tolerance ~20× over
# if it were counted — "test: match" below is the subtraction's receipt.
cat >"$GATEWAY_STATE/recon-ledger.jsonl" <<RECON
{"ts":"${RECON_DAY}T10:00:00.000Z","key":"wc-local-good","player":"test","model":"claude-haiku-4-5","usage":{},"costMicro":4520}
{"ts":"${RECON_DAY}T10:05:00.000Z","key":"wc-local-good","player":"test","model":"claude-haiku-4-5","usage":{},"costMicro":999000,"side":true}
RECON
compose exec -T wc-test sh <<FIXTURE
set -e
SDIR=/home/player/.pi/agent/sessions/--home-player-game--
mkdir -p "\$SDIR"
cat >"\$SDIR/${RECON_DAY}T10-00-00_0198dddd-eeee-7fff-8aaa-bbbb22223333.jsonl" <<'SESSION'
{"type":"session","version":3,"id":"0198dddd-eeee-7fff-8aaa-bbbb22223333","timestamp":"${RECON_DAY}T10:00:00.000Z","cwd":"/home/player/game"}
{"type":"message","id":"bbbb0001","parentId":null,"timestamp":"${RECON_DAY}T10:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"a costed turn"}],"model":"claude-haiku-4-5","provider":"anthropic","usage":{"input":14,"output":349,"cacheRead":0,"cacheWrite":0,"totalTokens":363,"cost":{"input":0.000014,"output":0.001745,"cacheRead":0,"cacheWrite":0,"total":0.004520}},"timestamp":"${RECON_DAY}T10:00:05.000Z"}}
SESSION
FIXTURE
RECON_OUT="$(NTFY_TOPIC= "$HERE/reconcile.sh" --day "$RECON_DAY" --ledger "$GATEWAY_STATE/recon-ledger.jsonl")" \
	|| { echo "FAIL: matching meters reconciled red"; echo "$RECON_OUT"; exit 1; }
grep -q "test: match" <<<"$RECON_OUT" \
	|| { echo "FAIL: no match verdict"; echo "$RECON_OUT"; exit 1; }
grep -q "side, subtracted" <<<"$RECON_OUT" \
	|| { echo "FAIL: the side sum was not named and subtracted"; echo "$RECON_OUT"; exit 1; }
echo "$RECON_OUT" | tail -1

# A REMOVED player's row — no volume AND no key — is §deletion's designed
# residue (sums kept, handle gone): reported, never paged.
echo '{"ts":"'"$RECON_DAY"'T10:30:00.000Z","key":"wc-was-here","player":"gone","model":"claude-haiku-4-5","usage":{},"costMicro":4000}' >>"$GATEWAY_STATE/recon-ledger.jsonl"
RECON_OUT="$(NTFY_TOPIC= "$HERE/reconcile.sh" --day "$RECON_DAY" --ledger "$GATEWAY_STATE/recon-ledger.jsonl")" \
	|| { echo "FAIL: a removed player's residue paged"; echo "$RECON_OUT"; exit 1; }
grep -q "gone: removed" <<<"$RECON_OUT" \
	|| { echo "FAIL: the removed player was not named benignly"; echo "$RECON_OUT"; exit 1; }

# The SAME missing volume under a LIVE key is a leak and must still page:
# mint the ghost a key, then expect red.
docker run --rm --user 0 -v "$GATEWAY_STATE:/d" world-console:latest node -e '
	const fs = require("fs");
	const keys = JSON.parse(fs.readFileSync("/d/keys.json", "utf8"));
	keys["wc-local-ghost"] = { player: "ghost", budgetMicro: 1000, rpm: 60 };
	fs.writeFileSync("/d/keys.json", JSON.stringify(keys, null, "\t") + "\n");'
echo '{"ts":"'"$RECON_DAY"'T11:00:00.000Z","key":"wc-local-ghost","player":"ghost","model":"claude-haiku-4-5","usage":{},"costMicro":999000}' >>"$GATEWAY_STATE/recon-ledger.jsonl"
if RECON_OUT="$(NTFY_TOPIC= "$HERE/reconcile.sh" --day "$RECON_DAY" --ledger "$GATEWAY_STATE/recon-ledger.jsonl" 2>&1)"; then
	echo "FAIL: a ledger row with no session counterpart passed"; echo "$RECON_OUT"; exit 1
fi
grep -q "ghost: MISMATCH" <<<"$RECON_OUT" \
	|| { echo "FAIL: the ghost was not called out"; echo "$RECON_OUT"; exit 1; }
grep -q "gone: removed" <<<"$RECON_OUT" \
	|| { echo "FAIL: the removed player's benign line vanished from the red run"; echo "$RECON_OUT"; exit 1; }

# Days before the lane's first full day answer green with or without rows —
# the epoch never moves, so 2026-08-09 tests it forever.
RECON_OUT="$(NTFY_TOPIC= "$HERE/reconcile.sh" --day 2026-08-09 --ledger "$GATEWAY_STATE/recon-ledger.jsonl")" \
	|| { echo "FAIL: a pre-epoch day reconciled red"; echo "$RECON_OUT"; exit 1; }
grep -q "predates the lane" <<<"$RECON_OUT" \
	|| { echo "FAIL: the pre-epoch day was not named"; echo "$RECON_OUT"; exit 1; }

echo "=== a tampered manifest is refused loudly ==="
SID2=0198cccc-dddd-7eee-8fff-000011112222
S2="$WC_TEST_STORE/staging/test/$SID2"
mkdir -p "$S2"
echo '{"type":"session","timestamp":"2026-08-09T13:00:00.000Z"}' >"$S2/session.jsonl"
printf '{"manifestVersion":1,"sessionId":"%s","player":"test","sourceSize":61,"files":{"session.jsonl":{"size":61,"sha256":"%s"}}}\n' \
	"$SID2" "0000000000000000000000000000000000000000000000000000000000000000" >"$S2/manifest.json"
echo '{}' >"$S2/sealed"
if "$HERE/store-sweep.sh" --store "$WC_TEST_STORE" --compact-only 2>/dev/null; then
	echo "FAIL: a tampered manifest was accepted"; exit 1
fi
[ ! -e "$WC_TEST_STORE/sessions/test/$SID2.tar.zst" ] \
	|| { echo "FAIL: the tampered session was compacted anyway"; exit 1; }
[ -f "$S2/session.jsonl" ] \
	|| { echo "FAIL: the tampered staging dir was pruned"; exit 1; }

echo "=== the backup lane: stage → borg → prune → a restored chronicle reads (02 item 13) ==="
if command -v borg >/dev/null 2>&1; then
	BK_TMP="$(mktemp -d "$HERE/.localcheck-backup.XXXXXX")"
	# A pretend box: all six state paths backup.sh requires, throwaway content.
	mkdir -p "$BK_TMP/hostdir/gateway-state" "$BK_TMP/hostdir/caddy/friends" "$BK_TMP/hostdir/first-use"
	echo '| test | 2026-08-09 | probe | yes | yes | note 2026-08-09 |' >"$BK_TMP/hostdir/consents.md"
	echo 'ACME_EMAIL=localcheck@example.invalid' >"$BK_TMP/hostdir/.env"
	cp "$GATEWAY_STATE/keys.json" "$BK_TMP/hostdir/gateway-state/keys.json"
	echo '# a door' >"$BK_TMP/hostdir/caddy/friends/test.caddy"
	echo 'services: {}' >"$BK_TMP/hostdir/compose.override.yaml"
	echo 'as served' >"$BK_TMP/hostdir/first-use/index.html"
	export BORG_PASSCOMMAND="echo localcheck-pass"
	borg init --encryption=repokey "$BK_TMP/repo"
	# Plant an archive far past the month — the nightly prune must eat it.
	borg create --timestamp 2026-06-01T00:00:00 "$BK_TMP/repo::nightly-stale" "$BK_TMP/hostdir/consents.md"
	"$HERE/backup.sh" --repo "$BK_TMP/repo" --staging "$BK_TMP/staging" \
		--hostdir "$BK_TMP/hostdir" --store "$WC_TEST_STORE" \
		--volumes "world-console_data-test world-console_sessions-test"
	if borg list --short "$BK_TMP/repo" | grep -q '^nightly-stale$'; then
		echo "FAIL: the stale archive outlived the 28-day prune (§deletion's promise)"; exit 1
	fi
	ARCHIVE="$(borg list --short "$BK_TMP/repo" | tail -1)"
	[ -n "$ARCHIVE" ] || { echo "FAIL: no archive landed"; exit 1; }
	borg list "$BK_TMP/repo::$ARCHIVE" | grep -q "sessions/test" \
		|| { echo "FAIL: the session store did not ride the archive"; exit 1; }
	borg list "$BK_TMP/repo::$ARCHIVE" | grep -q "consents.md" \
		|| { echo "FAIL: the box-local state did not ride the archive"; exit 1; }
	# The restore half, §Backups' exit gate in miniature: the data tar back
	# out of the archive, into a scratch volume, and the chronicle reads
	# through a scratch container.
	mkdir "$BK_TMP/x"
	(cd "$BK_TMP/x" && borg extract "$BK_TMP/repo::$ARCHIVE" "${BK_TMP#/}/staging/world-console_data-test.tar")
	docker volume create world-console_restore-check >/dev/null
	docker run --rm --user 0 --network none -v world-console_restore-check:/v \
		-v "$BK_TMP/x/${BK_TMP#/}/staging:/in:ro" \
		--entrypoint tar world-console:latest xf /in/world-console_data-test.tar -C /v
	RESTORED="$(docker run --rm --user 0 --network none -v world-console_restore-check:/v:ro \
		--entrypoint cat world-console:latest \
		/v/world/localcheck-world/0198bbbb-cccc-7ddd-8eee-ffff00001111/quests.md)"
	[ "$RESTORED" = "# quests" ] \
		|| { echo "FAIL: the restored chronicle does not read"; echo "$RESTORED"; exit 1; }
	docker volume rm world-console_restore-check >/dev/null
	unset BORG_PASSCOMMAND
else
	echo "SKIPPED, LOUDLY: no borg on this machine — the cycle stands unproven here;"
	echo "the box's nightly run and the restore gate carry the proof"
	echo "(sudo apt install borgbackup wakes this leg)"
fi

echo "=== localcheck green ==="
