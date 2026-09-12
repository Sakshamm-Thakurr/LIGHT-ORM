# Deployment guide

Everything in this repo is deployment-ready and has been verified locally
(build + typecheck + tests + a live manual smoke test against real
Postgres — see README §15). The only things left are steps that need
**your own account credentials**, which I can't do on your behalf. This
doc is the exact, minimal set of manual steps — no filler.

Suggested architecture (free-tier friendly, config files already in the
repo for this exact setup):

```
Vercel (frontend, static)  →  Render (todo-api, Node)  →  Neon (Postgres)
```

You can swap any of these for an equivalent provider (Supabase instead of
Neon, Railway instead of Render, Netlify instead of Vercel) — the app
doesn't depend on provider-specific features, just a Postgres connection
string and a place to run a Node process + a static site.

## 1. Database — Neon (or Supabase)

1. Create a free project at https://neon.tech (or https://supabase.com).
2. Copy the connection string (it looks like
   `postgres://user:password@ep-xxx.neon.tech/dbname?sslmode=require`).
3. Keep it somewhere safe — you'll paste it into Render in step 2, and
   **never commit it to the repo** (`.env` is already git-ignored).

## 2. Backend — Render

1. Push this repo to GitHub first (see [GitHub readiness](#4-github-readiness) below) — Render deploys from a GitHub repo.
2. Go to https://render.com → **New** → **Blueprint**, and point it at
   your GitHub repo. Render will read `render.yaml` at the repo root
   automatically and configure the `todo-api` service (build command,
   start command, and a `DATABASE_URL` env var placeholder) for you.
3. When prompted, paste your Neon connection string as the `DATABASE_URL`
   env var value (this is the one field `render.yaml` intentionally
   leaves for you to fill in — `sync: false` means Render won't ask you
   to commit it anywhere).
4. Deploy. Once live, note the URL Render gives you, e.g.
   `https://todo-api-xxxx.onrender.com`.
5. Sanity check: `curl https://todo-api-xxxx.onrender.com/api/health`
   should return `{"status":"ok"}`.

## 3. Frontend — Vercel

1. Open `apps/todo-app/frontend/vercel.json` and replace
   `YOUR-RENDER-BACKEND-URL.onrender.com` with the real Render URL from
   step 2.4, then commit that change.
2. Go to https://vercel.com → **Add New Project** → import the same
   GitHub repo, and set the project's **root directory** to
   `apps/todo-app/frontend`. Vercel will pick up `vercel.json` for the
   build command and the `/api/*` rewrite to your Render backend.
3. Deploy. Vercel gives you a public URL, e.g.
   `https://todo-app-xxxx.vercel.app` — **this is your live demo URL**;
   add it to README §18.

## 4. GitHub readiness

The repo is already initialized locally (`git init`, one commit, clean
`.gitignore`, no secrets — verified by grepping for `.env` files and
credential-shaped strings before committing). To push it:

```bash
# Create an empty repo at https://github.com/new (don't initialize it
# with a README/gitignore - this repo already has both), then:
cd light-orm
git remote add origin https://github.com/<your-username>/light-orm.git
git branch -M main
git push -u origin main
```

That's the one command that needs your GitHub authentication (SSH key or
a browser login prompt) — everything else in this repo is already
prepared and committed.

## 5. After deploying

Update these two placeholders once you have real URLs:
- README.md §18 "Live Todo demo" → your Vercel URL
- `packages/light-orm/README.md` and root README's GitHub links →
  `https://github.com/<your-username>/light-orm`
