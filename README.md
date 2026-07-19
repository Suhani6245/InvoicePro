# InvoicePro — Intelligent Billing & Invoice Management System

A full-stack invoicing and billing platform with automatic invoice numbering, GST/discount
calculations, QR-code payments, duplicate & fraud detection, a customer reliability analyzer,
and a business "Decision Engine" — built on Node.js/Express/MongoDB with a vanilla HTML/CSS/JS
frontend (no framework).

---

## Features

- **Authentication** — JWT-based admin login, bcrypt password hashing, protected routes
- **Customers** — CRUD with soft delete, search, and an auto-computed reliability/risk profile
- **Invoices** — auto-numbered (`INV-1001`, `INV-1002`, ...), line items with live GST/discount/
  total calculation, PDF generation, email delivery, and automatic Overdue status
- **Duplicate Invoice Detection** — flags likely duplicates (same customer, similar amount/items/
  date) before saving, with a similarity score and an override
- **Fraud Detection** — scores each invoice 0–100 using pure business-logic heuristics (amount vs.
  customer average, unusual quantities, inactivity-then-spike patterns, duplicate flags)
- **QR Code Payments** — every invoice gets a QR code linking to a public, no-login payment page;
  "Pay Now" simulates payment and updates the invoice, payment ledger, and activity log
- **Payments** — full payment ledger, automatically syncs invoice paid/remaining/status
- **Dashboard** — totals, status breakdown, revenue chart, collection efficiency, top/most-delayed
  customer, highest-selling product, predicted collection
- **Analytics ("AI Spending Insights")** — monthly growth, outstanding trend, top 5 customers,
  30-day performance comparison — all computed via MongoDB aggregation, no external AI API
- **Smart Customer Reliability & Payment Risk Analyzer** — 0–100 score, star rating, Low/Medium/
  High risk, and a plain-language recommendation per customer
- **Decision Engine** — auto-generated action items (high fraud risk, late customers, outstanding
  balances over ₹50,000, revenue drops, duplicate invoices)
- **Activity Logs** — full audit trail of everything the system does

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Auth | JWT, bcrypt |
| PDF | PDFKit |
| Email | Nodemailer |
| QR Codes | `qrcode` |
| Frontend | HTML, CSS, Vanilla JavaScript, Fetch API, Chart.js |
| Deployment | Render |

No frontend framework is used, by design.

## Project Structure

```
/InvoicePro
  /config          # DB connection, constants, admin bootstrap
  /controllers      # Route handlers (one per module)
  /middleware        # Auth, error handling, validators
  /models            # Mongoose schemas
  /routes             # Express routers
  /services            # Business logic (calculations, fraud/duplicate detection,
                        #   PDF/QR/email generation, analytics, reliability, decisions)
  /utils                # Logger, JWT helper, seed script
  /public                # Frontend (served statically by Express)
    /css
    /js
      /pages              # One module per page (dashboard, customers, invoices, ...)
    index.html              # SPA shell
    payment.html            # Public QR payment landing page
  server.js
  package.json
  .env.example
  .gitignore
  README.md
  DEPLOYMENT.md
  postman_collection.json
```

## Getting Started (Local Development)

### Prerequisites
- Node.js 18+
- A MongoDB Atlas cluster (free tier is enough) — see `DEPLOYMENT.md` for setup steps

### Setup

```bash
npm install
cp .env.example .env
# edit .env with your MongoDB URI, JWT secret, admin credentials, etc.
npm run dev      # starts with nodemon, auto-restarts on changes
# or
npm start        # plain node
```

The app serves both the API and the frontend from the same Express server. Once running, open:

```
http://localhost:5000
```

The first admin account is created automatically on startup from `ADMIN_NAME` / `ADMIN_EMAIL` /
`ADMIN_PASSWORD` in `.env` — just log in with those. If you'd rather register manually, `POST
/api/auth/register` is open until the first admin exists.

### Load sample data

```bash
npm run seed
```

Populates realistic demo customers, invoices, and payments spanning several months — including a
duplicate invoice, a high fraud-risk invoice, and an overdue high-balance customer — so every
feature has something to show immediately. See the script's console output for a summary of what
was created.

## Environment Variables

See `.env.example` for the full list with comments. At minimum you need:

- `MONGO_URI` — your MongoDB Atlas connection string
- `JWT_SECRET` — any long random string (generate with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — bootstrap admin credentials
- `BASE_URL` — used to build the QR payment link (`http://localhost:5000` locally, your Render URL
  in production)

SMTP variables are only required if you want the "Email Invoice" feature to actually send mail;
everything else works without them.

## API Overview

All endpoints are under `/api`. Full request/response examples are in `postman_collection.json`.

| Base path | Auth | Description |
|---|---|---|
| `/api/auth` | mixed | login, logout, register, me, change-password |
| `/api/customers` | protected | CRUD, search |
| `/api/invoices` | mixed | CRUD, PDF, email — `/api/invoices/pay/:invoiceNumber` is public |
| `/api/payments` | protected | record & list payments |
| `/api/dashboard` | protected | dashboard summary |
| `/api/analytics` | protected | insights + reliability analyzer |
| `/api/activity-logs` | protected | audit trail |
| `/api/decisions` | protected | Decision Engine recommendations |

"Protected" routes require `Authorization: Bearer <token>`. "Public" routes (only the QR payment
pages) require no auth by design, since customers never log in.

## Deployment

See **`DEPLOYMENT.md`** for the full step-by-step guide to pushing this to GitHub and deploying on
Render with MongoDB Atlas.

## License

MIT — do whatever you like with it.
