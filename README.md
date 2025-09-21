# ViQi Prototype – AI Matchmaking Demo

ViQi is a session-only proof of concept that showcases a full SaaS journey for Film & TV professionals: capture a request, personalise AI-generated matches, gate premium data behind Stripe checkout, and reveal results instantly after payment. It deliberately avoids any persistent database so the whole experience can be demoed with only external services (Google OAuth, Stripe, Gemini).

---

## 1. What the Demo Covers

- **Guided flow**: ask a question → optional sign-in → AI processing → blurred preview → paywall → revealed contacts.
- **Personalisation**: business emails are parsed for their domain and passed into the Gemini prompt for tailored matches.
- **Payments**: Stripe Checkout is used end to end; users who complete payment (or already have an active subscription in Stripe) bypass the paywall on future visits.
- **Delightful UX**: all actions show hover/tap feedback, buttons disable while processing, and loading states include spinners so the experience feels production-ready on desktop and mobile.
- **Resilient fallback**: if Gemini or Stripe throw errors, the app gracefully falls back to mock data so the demo never breaks mid-pitch.

This POC is intentionally lightweight—drop in real auth, persistence, and richer prompts when you are ready for production.

---

## 2. Architecture at a Glance

```
viqi-prototype/
├── apps/
│   ├── web/   # Next.js 15 (App Router) frontend deployed to Vercel
│   └── api/   # FastAPI backend deployed to Render
├── packages/  # (reserved for shared packages – currently unused)
└── README.md
```

- **Frontend**: Next.js, React 19, Tailwind, NextAuth (Google SSO). All state is stored in sessionStorage/localStorage.
- **Backend**: FastAPI with Loguru logging. No database; subscription state is determined via Stripe APIs and the Gemini call can use real or mock data.

---

## 3. Prerequisites

| Tool | Notes |
| ---- | ----- |
| Node.js 18+ | Required for the Next.js frontend |
| Python 3.9+ | Required for the FastAPI backend |
| Google Cloud OAuth App | For Google sign-in (optional but recommended) |
| Stripe Test Account | Checkout + subscription status checks |
| Gemini API Key | Real responses; omit to use the built-in mock data |

---

## 4. Environment Variables

Create the following `.env` files (or configure these values in Vercel/Render). Only the keys you actually need have to be present.

### Frontend (`apps/web`)

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_API_BASE_URL` | URL of the FastAPI backend (e.g., `https://viqi-prototype.onrender.com`) |
| `NEXTAUTH_URL` | Base URL of the frontend (`http://localhost:3000` in dev, Vercel URL in prod) |
| `NEXTAUTH_SECRET` | NextAuth JWT secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials (optional if you demo with email-only auth) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for checkout |

### Backend (`apps/api`)

| Variable | Purpose |
| -------- | ------- |
| `STRIPE_SECRET_KEY` | Stripe secret key used for Checkout + subscription lookups |
| `STRIPE_PRICE_ID_STARTER_MONTHLY` etc. | Price IDs for the Starter/Pro plans (monthly + annual) |
| `APP_BASE_URL` | Public URL of the frontend; used as the default success/cancel redirect for Stripe |
| `GEMINI_API_KEY` | Optional; enables real Gemini responses |
| `DEBUG=true` | (Optional) enable verbose logging on Render |

> ℹ️ In this session-only POC you do **not** need database credentials. All user data lives in the browser.

---

## 5. Local Development

1. **Install dependencies**
   ```bash
   # From the repo root
   npm install
   cd apps/api && pip install -r requirements.txt
   ```

2. **Run frontend & backend together**
   ```bash
   # Runs Next.js on http://localhost:3000 and FastAPI on http://localhost:8000
   npm run dev
   ```

3. **Visit the demo**
   - http://localhost:3000 – main experience
   - http://localhost:8000/docs – FastAPI Swagger docs

### Useful Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev:web` | Frontend only |
| `npm run dev:api` | Backend only |
| `npm run build:web` | Next.js production build |

> The `db:*` scripts in `package.json` are legacy and can be ignored for the session-only POC.

---

## 6. Deploying the Demo

### Vercel (Frontend)
1. Connect the GitHub repo to Vercel.
2. Add the frontend env vars listed above.
3. Build command: `npm run build:web` (or the default Next.js build).

### Render (Backend)
1. Create a **Web Service** pointing to this repo, root `apps/api`.
2. Build command: `pip install -r requirements.txt`.
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
4. Set backend env vars, including `APP_BASE_URL` pointing to your Vercel domain.

The frontend’s `NEXT_PUBLIC_API_BASE_URL` should point to the Render service URL.

---

## 7. Demo Walkthrough

1. **Ask a question** on the landing page (e.g., “Looking for cinematographers in Iceland”).
2. **Sign in** via Google or enter an email. The domain is used to infer the user’s company.
3. **Processing screen** shows progress while Gemini runs; match data is cached in sessionStorage.
4. **Preview** displays blurred companies/emails and masked outreach copy.
5. **Click Unlock** → Stripe Checkout opens. After payment, the reveal page loads with full contact data.
6. **Returning paid users** are detected via Stripe and skip the paywall on future queries.

---

## 8. UX & Resilience Notes

- Buttons and interactive controls include hover/tap feedback and disable while processing, with spinners to show progress.
- Layouts adapt down to mobile widths; headers stack and cards reflow to keep content readable.
- Stripe & Gemini failures fall back to mocked data so the pitch never stalls.

---

## 9. Next Steps Toward Production

When moving beyond the demo:
- Introduce a persistent user store (e.g., Postgres) and move auth from sessionStorage to a real identity provider.
- Replace the POC Gemini prompt with domain-specific templates and validation.
- Store match results and payment history; handle webhooks instead of polling Stripe.
- Add monitoring/alerting, rate limiting, and privacy safeguards around personal data.

---

## 10. Getting Help

- **Logs**: both Next.js and FastAPI log detailed events (requests, Stripe lookups, Gemini calls). Enable `DEBUG=true` on the backend for verbose output.
- **Questions**: open an issue in this repo or reach out to the ViQi engineering team.

Enjoy demoing ViQi! 🎬
