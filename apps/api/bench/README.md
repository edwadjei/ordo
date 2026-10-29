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
  - Two transcripts of about 2,000 and 10,000 spoken words (12,000 and 57,000 characters).
  - AI capture goes through the real Workers AI adapter. The `AI` binding is a local stub that returns a reply the size of a real one (a summary, five tasks and an email draft) as a JSON string, so the Worker parses it.
  - Save is a ready run with 10 tasks and 2 drafts, and verify is a ready sign-in challenge. Both are written straight into the database first (not timed), so each is measured on its own.
- **Warm**: one process serves each route 45 times; the first 5 are discarded. This is a busy isolate.
- **Cold**: each sample is a fresh process that imports the bundle, lets its startup finish, and serves one request. This is a new isolate, the usual case when traffic is light. V8 compiles each function the first time it runs, so this is where the 10 ms limit is at risk.
  - Before the timed request the process spins the CPU for 100 ms, because an idle Mac moves it to a slower core or clock and would inflate the one request being timed.
  - The startup column is the bundle's evaluation plus the warm-up. Cloudflare limits startup separately, at 1 second.

## Inside workerd

```bash
npm run bench:workerd --workspace @ordo/api               # every route
npm run bench:workerd --workspace @ordo/api -- process    # routes matching "process"
```

The Node benchmark cannot see workerd's own JavaScript, such as the D1 binding (`cloudflare-internal:d1-api`). That code runs in the isolate on every database call, counts as Worker CPU, and is compiled the first time a new isolate uses it. `bench/workerd.ts` measures it.

For each sample it:
- starts `wrangler dev --local` on a fresh isolate (port 8829, inspector 9239, its own local D1 under `bench/.build`);
- lets the startup warm-up finish;
- profiles exactly one request through the DevTools protocol.

A sample's CPU is the profile's non-idle time, and the table shows where it went. Data a route needs is written beforehand with `wrangler d1 execute --local`. AI capture uses the development fake model, because workerd cannot reach Workers AI locally.

It takes about 15 minutes for every route at 5 samples (`BENCH_COLD_SAMPLES`). With the inspector attached, workerd runs slower than on Cloudflare, so compare its numbers before against after rather than with the 10 ms limit.

## Comparing with another build

`BENCH_BUNDLE=<folder with worker.js>` measures a prebuilt bundle instead of building this checkout, for example `main`'s. Build it with `npx wrangler deploy --dry-run --outdir <folder>` in a checkout of that commit.

Other settings:
- `BENCH_ITERATIONS` (warm runs, default 40) and `BENCH_COLD_SAMPLES` (cold processes per route, default 7).
- `BENCH_RESEED=0` reuses the last seeded database.
- `BENCH_PROFILE=<file>` with `cold-one "<route>"` writes a V8 CPU profile of one cold request.

## Limits

This is a proxy. Node's `Request` and `Response` are JavaScript (undici); workerd's are native, so Node slightly overstates request handling. Cloudflare's servers also differ from a laptop. Treat the numbers as relative, before against after, and confirm on the hosted Worker with `wrangler tail`, which reports each request's CPU time.
