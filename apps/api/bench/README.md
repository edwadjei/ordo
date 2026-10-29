# CPU benchmark

Cloudflare's Workers Free plan allows 10 ms of CPU per request. `wrangler dev` does not report CPU time, so this benchmark measures it locally, as close to the Worker as Node allows.

```bash
npm run bench:cpu --workspace @ordo/api              # warm and cold, every route
npm run bench:cpu --workspace @ordo/api -- warm      # warm only
npm run bench:cpu --workspace @ordo/api -- cold home # cold, routes matching "home"
```

It takes about three minutes. Nothing leaves the machine and no account or remote D1 is used.

## What it measures

- **The real Worker bundle.** It runs `wrangler deploy --dry-run` (nothing is uploaded), imports the bundle into Node, and calls its own `fetch` handler. Configuration, the per-request Drizzle database, routing, guards and every domain run exactly as on Cloudflare.
- **The Worker's CPU, not D1's.** D1 is `SqliteD1` (`sqlite-d1.ts`), an in-process stand-in on `node:sqlite` with every migration applied. Its calls are synchronous, so the CPU spent inside SQLite is timed exactly and subtracted: on Cloudflare, queries run in D1, outside the Worker's CPU time. What remains is routing, guards, Web Crypto, Zod, Drizzle's SQL building and row mapping, and JSON. The binding's own (de)serialisation of results is not counted.
- **The request's own thread.** `process.threadCpuUsage()` counts the main thread only, as Cloudflare counts the isolate's thread. Background compiler and garbage-collector threads are left out.
- **Realistic, fictional data.**
  - 3 workspaces, 20 projects and 300 tasks, every tenth task a subtask.
  - 100 notes of 1,000 to 20,000 characters, about 1 MB in all.
  - Sign-in goes through the real code flow, with a fake Gatekeeper that sends nothing.
  - AI capture uses the development fake model.
- **Warm**: one process serves each route 45 times; the first 5 are discarded. This is a busy isolate.
- **Cold**: each sample is a fresh process that imports the bundle, lets its startup finish, and serves one request. This is a new isolate, the usual case when traffic is light. V8 compiles each function the first time it runs, so this is where the 10 ms limit is at risk.
  - Before the timed request the process spins the CPU for 100 ms, because an idle Mac moves it to a slower core or clock and would inflate the one request being timed.
  - The startup column is the bundle's evaluation plus the warm-up. Cloudflare limits startup separately, at 1 second.
  - Verify and save are measured after their own preceding step (the code request, the processing run), which has already warmed part of their path.

## Comparing with another build

`BENCH_BUNDLE=<folder with worker.js>` measures a prebuilt bundle instead of building this checkout, for example `main`'s. Build it with `npx wrangler deploy --dry-run --outdir <folder>` in a checkout of that commit.

Other settings:
- `BENCH_ITERATIONS` (warm runs, default 40) and `BENCH_COLD_SAMPLES` (cold processes per route, default 7).
- `BENCH_RESEED=0` reuses the last seeded database.
- `BENCH_PROFILE=<file>` with `cold-one "<route>"` writes a V8 CPU profile of one cold request.

## Limits

This is a proxy. Node's `Request` and `Response` are JavaScript (undici); workerd's are native, so Node slightly overstates request handling. Cloudflare's servers also differ from a laptop. Treat the numbers as relative, before against after, and confirm on the hosted Worker with `wrangler tail`, which reports each request's CPU time.
