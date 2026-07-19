# Deployment Guide — GitHub + Render

This walks through pushing InvoicePro to GitHub and deploying it live on Render, on top of the
MongoDB Atlas cluster you already set up.

---

## Part 1 — Push to GitHub

If you haven't already:

```bash
cd InvoicePro
git init
git add .
git commit -m "Initial commit: InvoicePro"
```

`.gitignore` already excludes `node_modules/`, `.env`, and log files, so secrets won't be
committed. Double check with:

```bash
git status
# .env should NOT appear in the list of files to be committed
```

Create a new empty repository on GitHub (no README/license, since you already have those), then:

```bash
git remote add origin https://github.com/<your-username>/invoicepro.git
git branch -M main
git push -u origin main
```

---

## Part 2 — Deploy on Render

1. Go to **render.com**, sign up/log in (no credit card required for the free tier).
2. **New +** → **Web Service**.
3. Connect your GitHub account and select the `invoicepro` repository.
4. Configure:
   | Field | Value |
   |---|---|
   | Name | `invoicepro` (or anything) |
   | Region | closest to you |
   | Branch | `main` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |

5. Under **Environment Variables**, add everything from your local `.env` **except** you don't
   need to set `PORT` — Render injects that automatically and `server.js` already reads
   `process.env.PORT`. At minimum:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGO_URI` | your MongoDB Atlas connection string |
   | `JWT_SECRET` | your long random secret |
   | `JWT_EXPIRES_IN` | `7d` |
   | `ADMIN_NAME` | your name |
   | `ADMIN_EMAIL` | your admin email |
   | `ADMIN_PASSWORD` | a strong password |
   | `BASE_URL` | *(leave blank for now, see step 7 below)* |
   | `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_GST`, `COMPANY_EMAIL`, `COMPANY_PHONE` | your details, shown on invoice PDFs |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | only needed if you want "Email Invoice" to work |

6. Click **Create Web Service**. Render builds and deploys — first deploy takes a couple of
   minutes. You'll get a URL like `https://invoicepro-xxxx.onrender.com`.

7. **Important:** go back into Environment Variables and set `BASE_URL` to that exact URL (e.g.
   `https://invoicepro-xxxx.onrender.com`), then save — this triggers a redeploy. This step matters
   because `BASE_URL` is what gets baked into every invoice's QR code payment link; if it's wrong,
   QR codes will point at the wrong place.

---

## Part 3 — MongoDB Atlas network access for Render

Render's free tier uses dynamic outbound IPs, so the simplest option is:

- In Atlas → **Network Access** → **Add IP Address** → **Allow Access From Anywhere** (`0.0.0.0/0`)

This is fine for a demo/portfolio project. For a real production deployment, use Render's **Static
Outbound IP** add-on (paid) and allow-list just that IP in Atlas instead.

---

## Part 4 — Verify it's live

- Visit `https://your-app.onrender.com/api/health` — should return
  `{"success":true,"message":"InvoicePro API is running",...}`
- Visit `https://your-app.onrender.com/` — should show the login page
- Log in with your `ADMIN_EMAIL`/`ADMIN_PASSWORD`
- Run `npm run seed` **locally with `MONGO_URI` pointed at the same Atlas cluster** to populate
  demo data (the seed script talks directly to MongoDB, not through Render, so this works fine)

---

## A note on the free tier for demos

Render's free web services spin down after ~15 minutes of no traffic, and the next request takes
30–60 seconds to "wake up" the container. This is completely normal — it's not a bug. If you're
showcasing this live, open the app a minute or two before your audience needs to see it so it's
already warm, or just narrate through the brief loading screen if it happens live ("cold start on
the free tier — give it a few seconds").

If you want to eliminate this entirely for a showcase, Render's paid Starter tier ($7/month) keeps
the instance always-on — not necessary for a portfolio piece, but worth knowing about.

---

## Redeploying after changes

Render auto-deploys on every push to `main`:

```bash
git add .
git commit -m "Your change description"
git push
```

Watch the deploy progress in the Render dashboard under your service's **Logs** tab.
