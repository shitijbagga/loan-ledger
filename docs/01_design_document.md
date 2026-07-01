# Loan Ledger — Design Document

**Version:** 1.0  
**Date:** July 2026  
**Status:** Live (deployed)

---

## 1. Project Background

Loan Ledger began as a Microsoft Excel workbook using VBA macros to calculate Swedish-style home loan amortization schedules. The original tool allowed a user to input basic loan details, then record "events" (changes to interest rate, changes to the monthly payment amount, or one-time extra principal payments) that would cause the amortization schedule and related metrics to be recalculated automatically.

The goal of this project was to recreate that tool as a multi-user web application, preserving all of the original calculation logic while adding:

- A clean, browser-based UI accessible from any device
- Persistent per-user data storage (no need to re-enter data on each visit)
- User authentication (login/signup)
- A live deployment accessible via a permanent public URL

---

## 2. Scope

### In scope (v1.0)

- Single loan scenario per user
- All three event types from the original tool (rate change, payment change, extra payment)
- Full amortization schedule table, scrollable and collapsible
- Balance trajectory chart comparing original vs. actual schedule, with event markers
- Key metrics: current balance, next payment, months remaining, interest saved, total interest paid to date, total interest expected at payoff, total cost of home
- User authentication (email + password, no email confirmation required)
- Explicit "Save" button — user controls when data is persisted
- Deployment to a live public URL (Vercel)

### Out of scope (deferred to future versions)

- Multiple loan scenarios per user
- "Suite" of additional personal finance tools
- React Router / multi-page navigation
- Custom domain name
- Magic link / OAuth authentication
- Auto-save on every change
- Admin/reporting views

---

## 3. Users

This is a single-user-per-account personal finance tool, not a public product. Each registered user manages their own loan data, invisible to all other users.

**Intended user profile:** Homeowner with an active Swedish-style mortgage, comfortable with basic financial concepts (principal, interest rate, amortization), who wants to plan and model the impact of various loan events over time.

---

## 4. User Flows

### 4.1 First-time user

1. Opens the app URL.
2. Sees the login screen — clicks "Need an account? Sign up."
3. Enters email and password → clicks "Sign up."
4. Is immediately logged in (no email confirmation step).
5. App loads with sensible default loan values pre-filled.
6. User updates the inputs to reflect their actual loan → clicks **Save**.
7. User adds events as needed → clicks **Save** again.
8. Returns later: app loads their saved values automatically.

### 4.2 Returning user

1. Opens the app URL.
2. Sees the login screen — enters email and password → clicks "Log in."
3. App loads their previously saved loan inputs and events.
4. User reviews or modifies → clicks **Save** if changes are made.

### 4.3 Adding an event

1. In the Events panel, selects an event date, type (rate change / payment change / extra payment), and value.
2. Optionally adds a note.
3. Clicks **Add** — the event immediately appears in the list and the chart/schedule recalculate in real time.
4. Clicks **Save** to persist.

### 4.4 Signing out

1. Clicks **Sign out** button (top right of the app).
2. Returns to login screen. Session is cleared from the browser.

---

## 5. UI Layout

The app is a single scrollable page divided into four numbered sections, mirroring the four sheets of the original Excel workbook:

| Section | Content | Excel equivalent |
|---|---|---|
| 01 Inputs | Loan parameters form | Inputs sheet |
| 02 Events | Add/delete event list | Events sheet |
| 03 Chart | Balance trajectory graph | Dashboard chart |
| 04 Schedule | Full monthly amortization table | Schedule sheet |

A row of **snapshot metrics** sits between the Events panel and the chart, summarising current state at a glance. A second highlighted row below it shows lifetime cost totals.

---

## 6. Design Language

The visual style is custom CSS (no utility-class framework), built around a small set of design tokens:

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F4F6F5` | Page background (with subtle grid) |
| `--card` | `#FFFFFF` | Panel/card backgrounds |
| `--border` | `#DCE2E0` | All borders and axis lines |
| `--ink` | `#16242B` | Primary text |
| `--muted` | `#6B7A78` | Labels, secondary text, axis tick labels |
| `--navy` | `#1F4E5F` | Primary action colour, original-schedule line |
| `--copper` | `#BB6B3C` | Actual-schedule line, extra payment markers, Save button, lifetime metrics row |
| `--sage` | `#4C7A6D` | Positive/savings indicators |

**Typography:**
- `Inter` — all prose, labels, card titles, UI text
- `IBM Plex Mono` — all numbers, dates, codes (schedule table, metric values, axis ticks)

**Grid background:** The page background uses a CSS repeating linear-gradient to produce a subtle 28px grid, referencing the spreadsheet origins of the tool.

---

## 7. Key Design Decisions

### 7.1 Explicit save, not auto-save

The user explicitly clicks **Save** when they want to persist changes. This avoids unintentional saves mid-edit (e.g. while deleting one event to replace it with another) and keeps the user in control of their data — closer to the "click Generate Schedule" UX of the original Excel tool.

### 7.2 Single scenario per user (v1.0)

Keeping one loan per account simplifies the auth and load/save logic significantly. The data model already supports multiple scenarios per user (`user_id` on `loan_scenarios`), so this is a UI constraint, not a schema limitation — adding a scenario picker later is additive rather than structural.

### 7.3 Linear amortization only

The app implements only Swedish-style linear amortization (fixed monthly principal). Annuity-style mortgages (where the total monthly payment is fixed but the split between principal and interest changes) are a different calculation model and out of scope for this version.

### 7.4 Month-end payment dates

All payment dates are the last day of each calendar month. The day of the start date is ignored. This matches the original Excel tool's behaviour and the Swedish mortgage market convention.

### 7.5 "Balance at start" framing

Each row's balance figures represent the balance *as it stood at the beginning of that month*, before the month-end payment is made. This is explicit in the column label "Balance at start" and reflects when interest accrues vs. when it is paid.

---

## 8. Deployment Architecture

```
Browser (user)
     │
     ▼
Vercel (static hosting)
  └── Built React app (HTML + JS bundle)
     │
     ├──► Supabase Auth   (login / session management)
     └──► Supabase DB     (loan_scenarios, loan_events tables)
```

- **Vercel** serves the built static files. Re-deployment triggers automatically on every `git push` to the `main` branch of the GitHub repository.
- **Supabase** provides both the authentication layer (JWT-based sessions) and the Postgres database. Row Level Security policies ensure each user's data is inaccessible to all others, enforced at the database level — not just in application code.
- All calculation logic runs **client-side** in the browser. No server-side computation is needed, reducing latency and Supabase usage.

---

## 9. Future Considerations

- **Multiple scenarios per user** — a scenario picker/switcher UI above the main calculator, with create/rename/delete actions.
- **Finance tool suite** — React Router added to support `/loan-ledger`, `/budget-tracker`, etc. as distinct pages with a shared navigation shell.
- **Custom domain** — a `*.com` or `*.se` domain pointed at the Vercel deployment via DNS.
- **Email confirmation** — re-enable Supabase's email confirmation toggle when/if opening to a wider user base.
- **Auto-save** — debounced save (e.g. 2 seconds after the last change) instead of the explicit button, if preferred after using the tool for a while.
