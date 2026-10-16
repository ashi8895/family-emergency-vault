# Deploying

Goal: a public demo link, like your other projects. This guide uses **MongoDB Atlas** (database) and **Render** (API and web). Run these first on your machine:

```bash
npm run typecheck     # fix anything it reports
npm run test
```

## 1. Database

Atlas, free cluster. Create a database user, allow network access from anywhere (`0.0.0.0/0`) for a demo, and copy the connection string. Add the database name before the `?`, for example `.../family-vault?retryWrites=true`.

## 2. API on Render (Web Service)

| Setting | Value |
|---|---|
| Root directory | `apps/server` |
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Atlas string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PRELOGIN_SECRET` | three different random strings, 32+ characters (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `CLIENT_ORIGIN` | the public URL of the web app, no trailing slash |
| `STORAGE` | `gridfs` (Render's free disk is wiped on every deploy, so files must live in MongoDB) |
| `TRUST_PROXY` | `1` (otherwise every visitor shares one rate limit and the audit log shows the proxy's IP) |
| `SMTP_URL`, `MAIL_FROM` | optional. Gmail example: `smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com` using an app password. Without it, emails are **not sent** in production. |

Never set `TIME_UNIT_MS` here. The server refuses to start if you do.

Do not rotate `JWT_REFRESH_SECRET` casually: it also derives the key for emailed links and stored 2FA seeds.

## 3. Web on Render (Static Site)

| Setting | Value |
|---|---|
| Root directory | `apps/web` |
| Build command | `npm install --include=dev && npm run build` |
| Publish directory | `dist` |

Add two **rewrite** rules, in this order:

| Source | Destination | Why |
|---|---|---|
| `/api/*` | `https://YOUR-API.onrender.com/api/*` | The browser calls `/api` on the web URL, so the refresh cookie stays same-site |
| `/*` | `/index.html` | `/invite/...`, `/approve/...`, `/access/...` must load the app |

`render.yaml` in the repository root contains both services as a blueprint. Check Render's current documentation before relying on it.

## 4. Check it works

1. Open `https://YOUR-API.onrender.com/api/health` and expect `{"ok":true}`.
2. Register on the web URL. In MongoDB Atlas, `vaultitems` must show unreadable ciphertext.
3. Upload a file, lock the vault, sign in again, download it. This proves `STORAGE=gridfs` works.
4. Invite a trusted person. Without `SMTP_URL` the link appears in the UI. Open it in a private window.

## 5. Free-tier caveats you must know

- **The scheduler stops when the service sleeps.** Render's free web services sleep after about 15 minutes without traffic. While asleep, no check-in emails or escalations are sent. For a demo, ping `/api/health` every 10 minutes with a free monitor (UptimeRobot or cron-job.org). A real product needs an always-on instance.
- The first request after sleep takes about 30 seconds.
- Without SMTP, nobody receives email. Either configure it or show the links from the UI.
- A demo is not a safe place for real data. Say so on the page and keep using fake data.
