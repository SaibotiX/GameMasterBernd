#!/usr/bin/env bash
# Blocks the local network from inside the containers — 02's hardening
# bullet: the scrying glass needs the open internet (model APIs, MediaWiki
# hosts), so egress stays open and the PRIVATE ranges are what get shut.
# Docker consults the DOCKER-USER chain for all forwarded container
# traffic; container-to-container proxying (caddy → friends) rides the
# docker subnets and is explicitly allowed first.
#
# RUN ON THE VPS ONLY — never on a dev machine (it rewrites live firewall
# chains). Idempotent: flushes and rebuilds only DOCKER-USER. Persistence
# across reboots is the runbook's step (iptables-persistent or a oneshot
# systemd unit calling this script after docker.service).
set -euo pipefail

if ! iptables -L DOCKER-USER -n >/dev/null 2>&1; then
	echo "DOCKER-USER chain missing — is docker running? (run this after docker.service)" >&2
	exit 1
fi

iptables -F DOCKER-USER

# Replies to inbound connections (the friends' pages) flow regardless.
iptables -A DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN

# Container-to-container (caddy → wc-*) lives inside docker's own pools.
iptables -A DOCKER-USER -s 172.16.0.0/12 -d 172.16.0.0/12 -j RETURN

# The local network is unreachable from any container: RFC-1918, link-local
# (cloud metadata lives there when it exists at all), and the CGN range.
iptables -A DOCKER-USER -d 10.0.0.0/8      -j DROP
iptables -A DOCKER-USER -d 172.16.0.0/12   -j DROP
iptables -A DOCKER-USER -d 192.168.0.0/16  -j DROP
iptables -A DOCKER-USER -d 169.254.0.0/16  -j DROP
iptables -A DOCKER-USER -d 100.64.0.0/10   -j DROP

# Everything else continues through docker's normal chains.
iptables -A DOCKER-USER -j RETURN

echo "DOCKER-USER rebuilt: private ranges dropped, docker subnets and replies open"
iptables -S DOCKER-USER
