#!/usr/bin/env bash
# Pseudo-TTY boot probe — the verification recipe's third leg, scripted.
#
# Boots plain `pi` in the repo root exactly as the maintainer does (both
# .pi/extensions loaders, ephemeral session) under a real pseudo-terminal,
# lets the TUI render a few seconds of frames, then double-^C's out and
# grades the captured screen:
#
#   exit 0  ok    — boot clean: game footer line up, no crash
#   exit 1  FAIL  — pi died booting (the 0.84.0 uncaughtException class),
#                   or the game footer line never rendered
#   exit 2  WARN  — the footer shim's degrade marker is showing: the game
#                   runs but pi's stock footer outgrew the shim — fix per
#                   research/design/pi-upgrades.md
#
# Run after EVERY pi upgrade and before any push that touched the TUI:
#   bash extension/test/tty-probe.sh                 # the maintainer's console
#   WC_PLAYER_UI=1 bash extension/test/tty-probe.sh # the player's console (R30)
#   WC_NARROW=1 bash extension/test/tty-probe.sh    # 59 columns, a standing
#       world-strike: pi CRASHES on any widget line wider than the terminal
#       (the 2026-08-17 strike-banner crash) — this lane holds the contract
#
# The two lanes are each other's negative control: the player lane FAILS on
# pi's stats line or a swallowed gate notice; the maintainer lane FAILS on
# player chrome leaking in. A detector that cannot fail is decoration.
set -u
IA="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp /tmp/wc-tty-probe.XXXXXX)"
trap 'rm -f "$OUT"' EXIT

# The player lane also TYPES: a gated built-in and the bash escape (each
# must draw its in-register refusal instead of executing), then /worlds —
# it must ANSWER with its listing — and a bare /note, which must ask back
# in register (bare forms never write: no choice file, no notes.md — the
# probe mutates nothing).
if [ "${WC_PLAYER_UI:-}" = "1" ]; then
	keys() { sleep 8; printf '/model\r'; sleep 2; printf '!pwd\r'; sleep 2; printf '/worlds\r'; sleep 2; printf '/note\r'; sleep 2; printf '\003'; sleep 1; printf '\003'; sleep 2; }
else
	keys() { sleep 8; printf '\003'; sleep 1; printf '\003'; sleep 2; }
fi

# The narrow lane boots a crafted session whose ledger stands a world-strike
# (ev:check, kind:peril) at 59 columns — narrower than the strike banner's
# foot line once was. The session lives and dies in /tmp; nothing real is
# read or written.
COLS=110
PI_CMD="pi --no-session"
if [ "${WC_NARROW:-}" = "1" ]; then
	NARROW_DIR="$(mktemp -d /tmp/wc-tty-narrow.XXXXXX)"
	trap 'rm -f "$OUT"; rm -rf "$NARROW_DIR"' EXIT
	uuid="$(cat /proc/sys/kernel/random/uuid)"
	# The header's cwd must be the repo: pi loads project extensions from the
	# SESSION's cwd, not the launch dir — a /tmp cwd boots a bare pi.
	{
		printf '%s\n' "{\"type\":\"session\",\"version\":3,\"id\":\"$uuid\",\"timestamp\":\"2026-08-17T10:00:00.000Z\",\"cwd\":\"$IA\"}"
		printf '%s\n' '{"type":"custom","id":"aa000001","parentId":null,"timestamp":"2026-08-17T10:00:01.000Z","customType":"world-console.ledger","data":{"ev":"world","world":"dragon-realm"}}'
		printf '%s\n' '{"type":"custom","id":"aa000002","parentId":"aa000001","timestamp":"2026-08-17T10:00:02.000Z","customType":"world-console.ledger","data":{"ev":"check","slug":"","tier":"hard","dc":20,"trial":"a rival moving first — the caravan rest at Brookside under sudden challenge","kind":"peril"}}'
	} >"$NARROW_DIR/trial.jsonl"
	COLS=59
	PI_CMD="pi --session $NARROW_DIR/trial.jsonl"
fi

(
	cd "$IA" &&
		keys |
		timeout --signal=KILL 35 script -qc "stty cols $COLS rows 30; $PI_CMD" "$OUT" >/dev/null 2>&1
)

# Strip ANSI control sequences (CSI, OSC, charset selects) for stable greps.
plain="$(sed -E -e 's/\x1b\[[0-9;?]*[A-Za-z]//g' -e 's/\x1b\][^\x07\x1b]*(\x07|\x1b\\)?//g' -e 's/\x1b[=>()][0-9A-Za-z]?//g' "$OUT" | tr -d '\r')"

fail=0
if grep -q "uncaughtException" <<<"$plain"; then
	echo "FAIL tty-probe: pi died booting the extension (uncaughtException)"
	grep -A 8 "uncaughtException" <<<"$plain" | head -12
	fail=1
fi
if ! grep -q "mood:" <<<"$plain" && ! grep -q "the tale has ended" <<<"$plain"; then
	echo "FAIL tty-probe: the game footer line never rendered"
	fail=1
fi
if [ "${WC_PLAYER_UI:-}" = "1" ]; then
	# The player's console (R30): no stats line, the banner's opener up, and
	# both gate notices drawn — a swallowed notice means the gate gated nothing.
	if grep -q "%/" <<<"$plain"; then
		echo "FAIL tty-probe(player): pi's stats line leaked into the player footer"
		fail=1
	fi
	if ! grep -q "lists every command" <<<"$plain"; then
		echo "FAIL tty-probe(player): the banner's opener never rendered"
		fail=1
	fi
	if ! grep -q "is not at this table" <<<"$plain"; then
		echo "FAIL tty-probe(player): typed /model drew no refusal — the submit gate is not gating"
		fail=1
	fi
	if ! grep -q "behind the curtain" <<<"$plain"; then
		echo "FAIL tty-probe(player): typed !pwd drew no refusal — the bash escape is open"
		fail=1
	fi
	if ! grep -q "worlds this console can open" <<<"$plain"; then
		echo "FAIL tty-probe(player): typed /worlds drew no listing — the command surface is not answering"
		fail=1
	fi
	if ! grep -q "set down for the makers" <<<"$plain"; then
		echo "FAIL tty-probe(player): typed /note drew no ask-back — the notes surface is dark"
		fail=1
	fi
else
	# The maintainer's console: player chrome leaking in is the mirrored failure.
	if grep -q "lists every command\|is not at this table" <<<"$plain"; then
		echo "FAIL tty-probe: player chrome leaked into the maintainer's console"
		fail=1
	fi
fi
if [ "${WC_NARROW:-}" = "1" ]; then
	# Both greps must hit or the lane proves nothing: the banner UP shows the
	# session armed its trial; the foot line WAS the crashing overflow.
	if ! grep -q "THE WORLD STRIKES" <<<"$plain"; then
		echo "FAIL tty-probe(narrow): the strike banner never rendered — no trial stood, nothing was tested"
		fail=1
	fi
	if ! grep -q "cast the die" <<<"$plain"; then
		echo "FAIL tty-probe(narrow): the banner's foot line is missing at 59 columns"
		fail=1
	fi
fi
if [ "$fail" -ne 0 ]; then
	echo "--- last screen lines ---"
	tail -25 <<<"$plain"
	exit 1
fi
if grep -q "footer API drift" <<<"$plain"; then
	echo "WARN tty-probe: degrade marker showing — game on, stats off; fix the shim per research/design/pi-upgrades.md"
	grep "footer API drift" <<<"$plain" | head -2
	exit 2
fi
if [ "${WC_NARROW:-}" = "1" ]; then
	echo "ok  tty-probe(narrow): the 59-column strike banner renders truncated — no crash"
elif [ "${WC_PLAYER_UI:-}" = "1" ]; then
	echo "ok  tty-probe(player): boot clean — game line only, banner up, both gate notices drawn, /worlds and /note answering"
elif grep -q "%/" <<<"$plain"; then
	echo "ok  tty-probe: boot clean — stock stats line and game line render"
else
	echo "ok  tty-probe: boot clean — game line renders (stats line not spotted; eyeball manually if unexpected)"
fi
exit 0
