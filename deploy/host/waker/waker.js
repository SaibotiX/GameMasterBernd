// deploy/host/waker/waker.js — start-on-connect (02 item 12, the reaper's
// other half). Caddy's per-friend door lists this as the SECOND upstream
// under lb_policy first: while the friend's container runs, no request
// ever lands here; once the reaper has put it to sleep, the knock falls
// through, this answers with the waking page and starts the container by
// name over the docker socket. The next refresh finds the real page.
//
// The blast radius, deliberately: it can START containers named
// world-console-wc-<name>-1 — nothing else, no other API call ever leaves
// here, and the name must fit new-friend.sh's own alphabet. It lives on
// the `wake` network shared with caddy alone; friends sit on `web`, and
// docker's cross-network isolation keeps this socket out of their reach.
const http = require("node:http");

const log = (ev, extra = {}) =>
	console.log(JSON.stringify({ ts: new Date().toISOString(), ev, ...extra }));

const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;

function startContainer(name, cb) {
	const req = http.request(
		{
			socketPath: "/var/run/docker.sock",
			method: "POST",
			path: `/v1.43/containers/world-console-wc-${name}-1/start`,
		},
		(res) => {
			res.resume();
			cb(res.statusCode);
		},
	);
	req.on("error", (err) => {
		log("socket-error", { err: String(err) });
		cb(0);
	});
	req.end();
}

const page = (title, body, refresh) => `<!doctype html>
<html><head><meta charset="utf-8">
${refresh ? '<meta http-equiv="refresh" content="3">' : ""}<title>${title}</title>
<style>body{background:#0c0c14;color:#c8c8d8;font-family:monospace;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center;max-width:34rem;padding:1rem}p{color:#8888a0}</style>
</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>
`;

http
	.createServer((req, res) => {
		const name = String(req.headers["x-friend"] ?? "");
		if (!NAME_RE.test(name)) {
			log("refused", { name });
			res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
			res.end(page("World Console", "No such door.", false));
			return;
		}
		startContainer(name, (code) => {
			log("wake", { name, code });
			if (code === 404) {
				res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
				res.end(
					page(
						"World Console — closed",
						"This console has been taken out of service. Ping the maintainer if that surprises you.",
						false,
					),
				);
				return;
			}
			// 204 started · 304 already running (we raced the dial) · anything
			// else: the refresh keeps knocking either way.
			res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			res.end(
				page(
					"World Console — waking",
					"The console was asleep and is waking now. This page knocks again in a moment; your world is exactly where you left it.",
					true,
				),
			);
		});
	})
	.listen(9000, () => log("listening", { port: 9000 }));
