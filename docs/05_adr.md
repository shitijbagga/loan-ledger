# Loan Ledger — Architecture Decision Records (ADRs)

**Version:** 1.0  
**Date:** July 2026

An ADR (Architecture Decision Record) is a short document capturing a significant technical or design decision: what the options were, what was chosen, and why. They exist so that future maintainers (including future-you, six months from now) understand the reasoning behind the current approach and don't unknowingly undo a decision that was made deliberately.

---

## ADR-001: React as the UI framework

**Date:** June 2026  
**Status:** Accepted

### Context
The original tool was an Excel/VBA workbook. We needed a UI framework to power the web version. The main candidates were React, Vue, and plain HTML/JS.

### Decision
React.

### Reasons
- The amortization engine translates naturally into React's model: inputs and events as state, the schedule as a derived value computed by a pure function (`generateSchedule`), and the UI as a function of that state.
- React's `useMemo` hook directly solves the performance concern of running the schedule calculation on every render — it only reruns when `inputs` or `events` actually change.
- React is the most widely documented and supported UI framework, meaning future help, plugins, and examples are easiest to find.
- The original Excel tool had four "sheets" that naturally map to four sections of a single-page React component.

### Consequences
- We are committed to the React ecosystem (Recharts for charts, Lucide React for icons).
- Adding routing later (for a multi-tool suite) requires React Router, which is additive and well-supported.

---

## ADR-002: Vite as the build tool (not Next.js)

**Date:** June 2026  
**Status:** Accepted

### Context
Two realistic options for scaffolding the React app: Vite (a lightweight build tool for SPAs) or Next.js (a full framework with server-side rendering and file-based routing).

### Decision
Vite.

### Reasons
- The app is a **single page** — a calculator with sections, not a multi-page site needing routing.
- We already have a backend (Supabase). Next.js's built-in API routes would be unused overhead.
- Server-side rendering (Next.js's main advantage) benefits SEO on public content. This is a private, login-gated tool — there is no public content for search engines to index.
- Vite's development server is simpler and faster, with fewer layers of abstraction — better suited to learning the setup from scratch.
- Vite's build output is straightforward static files, easy to deploy anywhere.

### Consequences
- If the app ever needs true SEO on public pages (e.g. a marketing landing page), Vite is not the right tool for that specific page, and a separate static site or Next.js app would be needed alongside it.
- Switching to Next.js later would require restructuring the build setup but not rewriting the application logic — the React components themselves would port cleanly.
- Adding routing for a multi-tool suite uses React Router, which works fine with Vite.

---

## ADR-003: Supabase for authentication and database

**Date:** June 2026  
**Status:** Accepted

### Context
We needed per-user data persistence (save and reload loan scenarios) and user authentication. Options considered: Supabase, Firebase, a custom Node.js/Express backend with a separate database, or no backend (browser localStorage only).

### Decision
Supabase.

### Reasons
- Provides both **authentication** (email/password, JWT sessions) and a **Postgres database** under one service, with one account and one free tier — fewer moving parts than running separate auth and DB services.
- Row Level Security (RLS) enforces data isolation at the database level. Even if there were a bug in the application code, one user could not access another's data — the database simply refuses the query.
- The JavaScript client library (`@supabase/supabase-js`) allows the browser to talk to Supabase directly — no custom backend server is needed, which keeps the architecture simple (browser → Supabase, no middle layer).
- Free tier is generous enough for personal/small-scale use with no time limit (unlike Firebase's Spark plan, which has tighter limits on some features).
- Supabase projects on the free tier pause after 1 week of inactivity — acceptable for a personal tool, worth noting for future growth.

### Consequences
- All calculation logic runs client-side in the browser (good: no server costs, no latency for calculations).
- The Supabase `anon` key is exposed in the browser bundle — this is by design and safe, because RLS policies, not key secrecy, are the security boundary.
- If this tool grows to thousands of active users, Supabase's free tier would need upgrading to a paid plan.

---

## ADR-004: Email + password authentication (not magic link or OAuth)

**Date:** June 2026  
**Status:** Accepted

### Context
Supabase supports several authentication methods: email + password, magic link (passwordless, email-based), and OAuth (Google, GitHub, etc.). We needed to choose one for the initial version.

### Decision
Email + password, with email confirmation disabled.

### Reasons
- **No external dependency at login time:** magic link requires the user to have their email client available and accessible at the moment of signing in. Email + password works offline from the email provider.
- **Simpler for a personal/closed tool:** OAuth (Sign in with Google) adds complexity (OAuth app registration, redirect URIs, provider configuration) with limited benefit when the user base is small and known.
- **Email confirmation disabled** so that sign-up is immediate — confirmation emails add friction with no meaningful security benefit for a private personal tool.

### Switching cost
Low. Supabase's auth methods are independent of the user data model — each user has a stable UUID regardless of sign-in method. Switching method only changes the login screen UI and one function call (`signInWithPassword` → `signInWithOtp`). Existing accounts are not affected.

### Consequences
- Users must remember a password. No "forgot password" flow is currently implemented (Supabase supports it, but it requires email to be functional — deferred to a future version).
- If email confirmation is ever re-enabled, existing users created without confirmation are not retroactively affected.

---

## ADR-005: Linear (Swedish-style) amortization model only

**Date:** June 2026  
**Status:** Accepted

### Context
Two amortization models exist in practice:
- **Linear (Swedish-style):** monthly principal payment is fixed; interest decreases each month as the balance falls; total payment shrinks over time.
- **Annuity:** total monthly payment is fixed; the split between principal and interest shifts (more interest early, more principal later).

### Decision
Linear amortization only.

### Reasons
- The original Excel tool was built for the Swedish mortgage market, where linear amortization is the dominant (and for many borrowers, legally required) method.
- The intended users have Swedish-style mortgages.
- Supporting both models would double the complexity of the engine and require a model-selector in the UI.

### Consequences
- The app is not suitable for users with annuity-style mortgages (common in the UK, US, and many other markets).
- Adding annuity support later is possible — it would require a separate `generateAnnuitySchedule()` function and a model toggle in the inputs — but is not planned.

---

## ADR-006: Month-end payment dates, balance-at-start framing

**Date:** June 2026  
**Status:** Accepted

### Context
The amortization schedule could frame each row around either the payment date or the beginning of the period. The original Excel tool used "balance at start of month" as the key figure, with the payment made at month-end.

### Decision
Payment dates are the **last day of each calendar month**. The "Balance at start" column shows the balance entering that month, before the payment is made.

### Reasons
- Matches the original Excel tool's conventions exactly.
- Reflects the Swedish mortgage payment convention (month-end payments).
- "Balance at start" is the figure used to calculate that month's interest, so it is the most relevant figure to display alongside the interest amount.
- The day of the start date is ignored and normalised to the first of the start month — consistent with the original tool.

### Consequences
- Floating-point arithmetic means interest amounts are computed from the balance at the start of each 30/31-day period as a flat 1/12 of the annual rate — not from exact day counts. This is a known, deliberate simplification that matches the original tool and is standard for amortization calculators.

---

## ADR-007: Explicit Save button (not auto-save)

**Date:** June 2026  
**Status:** Accepted

### Context
Two common patterns for saving state to a backend: auto-save (write to the database on every change) or explicit save (user clicks a Save button).

### Decision
Explicit Save button.

### Reasons
- Users may make several related changes (update the interest rate, add two events, delete one old event) before they consider the data "ready." Auto-saving mid-sequence could persist an incomplete state.
- Closer to the UX of the original Excel tool, where the user clicked "Generate Schedule" deliberately.
- Simpler to implement: one `handleSave()` function, no debouncing logic, no mid-edit database writes.
- Avoids excessive Supabase writes for users who are actively exploring scenarios.

### Switching cost
Low. Auto-save would replace `handleSave()` with a debounced `useEffect` watching `[inputs, events]`. The underlying `saveScenario()` function in `loanStore.js` would be unchanged.

### Consequences
- Users who forget to click Save will lose changes if they close the browser. A future improvement could add a "unsaved changes" warning before navigation.

---

## ADR-008: Delete-all + re-insert strategy for saving events

**Date:** June 2026  
**Status:** Accepted

### Context
When saving events to Supabase, we need to reconcile the current in-memory event list against whatever rows exist in the `loan_events` table. Options:
- **Diff and patch:** compute which events were added, edited, or deleted; issue targeted INSERT, UPDATE, DELETE calls.
- **Delete-all + re-insert:** delete every row for this scenario, then insert the entire current list fresh.

### Decision
Delete-all + re-insert.

### Reasons
- A loan typically has fewer than 20-30 events over its lifetime. The performance difference between the two approaches is imperceptible at this scale.
- Diffing requires tracking per-event dirty state (was this event added? edited? unchanged?) — significant added complexity.
- Re-inserting all events is a fixed-cost, simple operation with no edge cases to handle (e.g. "what if an edit to event A failed but the delete of event B succeeded?").
- Supabase's `on delete cascade` on `loan_events.scenario_id` means that if a scenario is ever deleted, all its events are cleaned up automatically — no orphaned rows.

### Consequences
- Each Save operation deletes and recreates all event rows, meaning event `id` UUIDs change on every save. These IDs are only used as React list keys while the component is mounted — they are not exposed to the user or referenced anywhere else, so regenerating them is harmless.
- If the app grows to scenarios with hundreds of events, this approach should be reconsidered.

---

## ADR-009: WSL2 (Ubuntu) as the development environment on Windows

**Date:** June 2026  
**Status:** Accepted

### Context
Development is on a Windows laptop. Vite uses Rolldown, which ships a native `.node` binary for Windows. Windows Smart App Control (a security feature) blocked this binary from running, preventing `npm run dev` from starting.

Two potential fixes were considered:
- Disable Smart App Control (permanent, cannot be re-enabled without reinstalling Windows)
- Use WSL2 (runs a real Linux kernel, where Smart App Control does not apply)

### Decision
WSL2 with Ubuntu.

### Reasons
- Smart App Control is a system-wide security setting affecting all users on the machine. Disabling it permanently for one development task was disproportionate.
- WSL2 creates a self-contained Linux environment that does not affect other Windows users on the machine (the developer's wife uses a separate Windows account for office work — unaffected).
- WSL2 is the recommended development environment for web projects on Windows by most toolchain authors.
- Linux dev environments are more consistent with the production environment (Vercel runs Linux).
- The developer has prior Linux experience, making the transition low-friction.

### Consequences
- Development must happen inside the WSL2 Ubuntu environment, not native Windows PowerShell.
- The `~/loan-ledger` project folder lives inside the Linux filesystem (`/home/shitij/loan-ledger`), not on the Windows C: drive, for performance reasons (cross-filesystem I/O between WSL and Windows is slow).
- A one-time reboot of the Windows machine was required to enable the WSL2 Windows features. This was the only impact on the shared laptop.
- VS Code's "Remote - WSL" extension allows editing Linux-side files from the Windows VS Code GUI seamlessly.

---

## ADR-010: Vercel for hosting

**Date:** June 2026  
**Status:** Accepted

### Context
The built app is a set of static files (HTML, JS, CSS). Options for hosting: Vercel, Netlify, GitHub Pages, or a VPS/cloud server (AWS, DigitalOcean, etc.).

### Decision
Vercel.

### Reasons
- Automatic deployment from GitHub: every `git push` to `main` triggers a rebuild and deploy with no manual steps.
- Native Vite support — build settings are auto-detected from `package.json`, no configuration file needed.
- Free tier covers this use case with no time or traffic limits that would be an issue at this scale.
- Per-deploy preview URLs are generated automatically — useful for checking a specific past version.
- Environment variables are managed in the Vercel dashboard, kept separate from the git repository.

### Consequences
- The production URL is currently a Vercel-assigned domain (`loan-ledger-liard.vercel.app`). A custom domain can be added at any time by pointing DNS records to Vercel.
- Vercel's free tier has build-minute limits, which are not a concern at current deploy frequency (a few times per week at most).
