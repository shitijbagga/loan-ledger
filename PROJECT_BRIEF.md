# Loan Ledger — Project Brief

## What this is
A web app that recreates an Excel/VBA home loan amortization tool (Swedish-style
linear amortization) as a multi-user web app with login and saved scenarios.

A working front-end prototype already exists: `loan-ledger.jsx` (included alongside
this brief). It has no backend — all state is in-memory React state. The goal now is
to turn it into a real app with accounts and persistence.

## Tech decisions already made
- **Frontend:** React (existing prototype, `loan-ledger.jsx`)
- **Hosting:** Vercel (deploys from GitHub on push)
- **Backend/DB/Auth:** Supabase (Postgres + built-in auth)
- **Repo:** GitHub (empty repo created, see URL provided separately)

## Calculation engine (already implemented in the prototype — port as-is)
Linear ("Swedish-style") amortization:
- Monthly principal payment is a **fixed amount** = round(original loan × annual
  amortization rate % ÷ 12), rounded to the nearest whole krona. It stays fixed
  unless changed by a `PRINCIPAL` event.
- Monthly interest = balance at start of month × (annual rate % ÷ 12).
- Each month's payment date is the **last day of that calendar month**. "Balance at
  start" = balance carried in before that month's installment.
- Three event types, each with a date (month/year only, day ignored):
  - `INTEREST` — sets a new interest rate from that month onward
  - `PRINCIPAL` — sets a new fixed monthly principal amount from that month onward (rounded to nearest krona)
  - `EXTRA_PRINCIPAL` — one-time lump sum that reduces the balance that month (monthly payment amount is unaffected; the loan just finishes sooner)
- Events are applied in chronological order, at the start of whichever month they fall in.

See the `generateSchedule()` function in `loan-ledger.jsx` for the full reference
implementation — port this logic into the new app's backend or shared logic layer
largely unchanged.

## Data model needed in Supabase
Each user should be able to save multiple named scenarios. Suggested tables:

**`loan_scenarios`**
- `id` (uuid, pk)
- `user_id` (uuid, fk → auth.users)
- `name` (text) — user-given label, e.g. "My home loan"
- `total_price` (numeric)
- `principal` (numeric)
- `term_months` (integer)
- `annual_amort_rate` (numeric)
- `start_rate_pct` (numeric)
- `start_date` (date)
- `created_at`, `updated_at` (timestamps)

**`loan_events`**
- `id` (uuid, pk)
- `scenario_id` (uuid, fk → loan_scenarios)
- `event_date` (date)
- `event_type` (text: 'INTEREST' | 'PRINCIPAL' | 'EXTRA_PRINCIPAL')
- `value` (numeric)
- `notes` (text, nullable)

Use Supabase **Row Level Security** so each user can only read/write their own
scenarios (standard `auth.uid() = user_id` policy on `loan_scenarios`, and a join-based
policy on `loan_events`).

## UI structure (from the prototype)
1. **Inputs panel** — total price, loan amount, term, amortization rate, start rate, start date
2. **Events panel** — add/delete dated events (rate change, payment change, extra payment)
3. **Stats row** — current balance, next payment, months remaining/payoff date, interest saved vs. original
4. **Lifetime totals row** — interest paid to date, interest expected at payoff, total home cost
5. **Chart** — original vs. actual balance trajectory (recharts), with event markers, "today" marker, two-tier x-axis (month numbers + sparse "MMM yyyy" labels)
6. **Schedule table** — full monthly ledger, collapsible beyond 36 rows

## What's needed for the real app (beyond the prototype)
- Login / signup screens (Supabase Auth — email/password is simplest to start)
- A scenario picker ("My loans" list) so a user can have more than one saved loan
- Save / load / delete actions wired to Supabase instead of local React state
- Auto-save or an explicit "Save" button (designer's choice — flag this for discussion)
- Basic loading/error states for network calls

## Style reference
Custom CSS already defines the visual language (no Tailwind compiler used) — colors,
fonts (Inter + IBM Plex Mono), card/grid styling. Carry this forward rather than
restyling from scratch.
