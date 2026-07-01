# Loan Ledger

A Swedish-style (linear) home loan amortization calculator, built as a multi-user web application.

Originally a Microsoft Excel/VBA tool, rebuilt as a React single-page application with Supabase for authentication and data persistence, deployed on Vercel.

**Live app:** https://loan-ledger-liard.vercel.app

---

## What it does

- Calculates a full monthly amortization schedule based on your loan details
- Lets you record "events" that change the loan's conditions over time:
  - **Rate change** — a new interest rate taking effect from a given month
  - **Payment change** — a new fixed monthly principal amount from a given month
  - **Extra payment** — a one-time lump sum that reduces the balance immediately
- Recalculates the schedule and all metrics instantly as you make changes
- Shows a chart comparing your original schedule against the actual one (with events)
- Displays key metrics: current balance, next payment, months remaining, interest saved, total cost of home
- Saves your data per user account — return any time without re-entering everything

---

## Calculation model

The app uses **linear (Swedish-style) amortization**:

- The monthly principal payment is a **fixed amount**, calculated as:
  `round(original loan × annual amortization rate% ÷ 12)`, rounded to the nearest whole krona
- Monthly interest accrues on the balance at the **start of each month**
- Each installment is due on the **last day of the calendar month**
- Extra payments reduce the balance immediately but do not change the fixed monthly amount — the loan simply finishes sooner
- Events are matched by month only — the day of an event date is ignored

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, built with Vite 8 |
| Charts | Recharts |
| Icons | Lucide React |
| Auth + Database | Supabase (Postgres + built-in JWT auth) |
| Hosting | Vercel (auto-deploys from GitHub `main`) |
| Version control | GitHub |
| Dev environment | WSL2 (Ubuntu) on Windows |

---

## Local development setup

### Prerequisites

- **WSL2 with Ubuntu** (Windows) — required due to Smart App Control blocking Vite's native binaries on Windows directly
- **nvm** (Node Version Manager) — installed inside WSL
- **Node.js v24+** — installed via `nvm install --lts`
- **Git** — installed inside WSL via `sudo apt install git`
- A **Supabase** account and project
- A **GitHub** account with SSH key configured (see below)

### First-time setup

**1. Clone the repository (from inside WSL)**

```bash
cd ~
git clone git@github.com:shitijbagga/loan-ledger.git
cd loan-ledger
```

**2. Install dependencies**

```bash
npm install
```

**3. Create your local environment file**

```bash
nano .env.local
```

Add:

```
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key_here
```

Get these values from your Supabase project: **Settings → Data API**.

This file is git-ignored and will never be committed. Do not put these values anywhere else.

**4. Start the development server**

```bash
npm run dev
```

Open `http://localhost:5173` in your Windows browser (WSL2 forwards the port automatically).

### SSH key setup (if cloning for the first time on a new machine)

GitHub uses SSH authentication. If you're on a new machine:

```bash
ssh-keygen -t ed25519 -C "your-github-email@example.com"
cat ~/.ssh/id_ed25519.pub
```

Copy the output and add it to GitHub: **Settings → SSH and GPG keys → New SSH key** (Authentication key).

Test it works:

```bash
ssh -T git@github.com
# Should print: Hi shitijbagga! You've successfully authenticated...
```

---

## Database setup (Supabase)

If setting up a fresh Supabase project, run the following SQL in the **SQL Editor**:

```sql
create table public.loan_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My loan',
  total_price numeric not null,
  principal numeric not null,
  term_months integer not null,
  annual_amort_rate numeric not null,
  start_rate_pct numeric not null,
  start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loan_events (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.loan_scenarios(id) on delete cascade,
  event_date date not null,
  event_type text not null check (event_type in ('INTEREST','PRINCIPAL','EXTRA_PRINCIPAL')),
  value numeric not null,
  notes text
);

alter table public.loan_scenarios enable row level security;
alter table public.loan_events enable row level security;

create policy "select own scenarios" on public.loan_scenarios
  for select using (auth.uid() = user_id);
create policy "insert own scenarios" on public.loan_scenarios
  for insert with check (auth.uid() = user_id);
create policy "update own scenarios" on public.loan_scenarios
  for update using (auth.uid() = user_id);
create policy "delete own scenarios" on public.loan_scenarios
  for delete using (auth.uid() = user_id);

create policy "select own events" on public.loan_events
  for select using (
    exists (select 1 from public.loan_scenarios s where s.id = loan_events.scenario_id and s.user_id = auth.uid())
  );
create policy "insert own events" on public.loan_events
  for insert with check (
    exists (select 1 from public.loan_scenarios s where s.id = loan_events.scenario_id and s.user_id = auth.uid())
  );
create policy "update own events" on public.loan_events
  for update using (
    exists (select 1 from public.loan_scenarios s where s.id = loan_events.scenario_id and s.user_id = auth.uid())
  );
create policy "delete own events" on public.loan_events
  for delete using (
    exists (select 1 from public.loan_scenarios s where s.id = loan_events.scenario_id and s.user_id = auth.uid())
  );
```

Also turn off email confirmation: **Authentication → Sign In / Providers → Confirm email: Off**.

---

## Deployment

Deployment is automatic. Every `git push` to the `main` branch triggers a Vercel rebuild and redeploy.

To deploy manually (e.g. after changing environment variables in Vercel):
1. Go to [vercel.com](https://vercel.com) → your project → Deployments tab
2. Find the latest deployment → click ⋯ → Redeploy

Vercel requires these environment variables to be set under **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase publishable key |

---

## Project structure

```
loan-ledger/
├── docs/                     ← Project documentation
│   ├── 01_design_document.md
│   ├── 02_component_architecture.md
│   ├── 03_code_reference.md
│   ├── 04_readme.md          ← This file (also at root as README.md)
│   ├── 05_adr.md
│   └── 06_runbook.md
├── src/
│   ├── main.jsx              ← Entry point
│   ├── index.css             ← Global reset
│   ├── App.jsx               ← Auth gate (logged in/out routing)
│   ├── Auth.jsx              ← Login / signup form
│   ├── LoanLedger.jsx        ← Main calculator (engine + UI)
│   ├── loanStore.js          ← Supabase read/write functions
│   └── supabaseClient.js     ← Supabase client singleton
├── .env.local                ← Local credentials (NOT in git)
├── .gitignore
├── index.html
├── package.json
└── vite.config.js
```

---

## Documentation

Full documentation lives in the `/docs` folder:

| Document | Contents |
|---|---|
| `01_design_document.md` | Project background, user flows, UI layout, design decisions |
| `02_component_architecture.md` | Component tree, data flow, database schema, dependencies |
| `03_code_reference.md` | Every function and constant documented in detail |
| `05_adr.md` | Architecture Decision Records — why key choices were made |
| `06_runbook.md` | How to operate, monitor, and recover the live app |
