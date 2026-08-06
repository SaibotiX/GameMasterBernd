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
#   bash extension/test/tty-probe.sh
set -u
IA="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp /tmp/wc-tty-probe.XXXXXX)"
trap 'rm -f "$OUT"' EXIT

(
	cd "$IA" &&
		{ sleep 8; printf '\003'; sleep 1; printf '\003'; sleep 2; } |
		timeout --signal=KILL 25 script -qc "stty cols 110 rows 30; pi --no-session" "$OUT" >/dev/null 2>&1
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
if grep -q "%/" <<<"$plain"; then
	echo "ok  tty-probe: boot clean — stock stats line and game line render"
else
	echo "ok  tty-probe: boot clean — game line renders (stats line not spotted; eyeball manually if unexpected)"
fi
exit 0
