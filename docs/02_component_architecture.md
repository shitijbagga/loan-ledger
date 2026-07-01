# Loan Ledger — Component Architecture

**Version:** 1.0  
**Date:** July 2026

---

## 1. Overview

Loan Ledger is a React single-page application (SPA) built with Vite. All application logic runs in the user's browser — there is no application server. External services (authentication and data storage) are provided by Supabase, accessed directly from the browser via Supabase's JavaScript client library.

---

## 2. File Structure

```
loan-ledger/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx              ← React entry point; mounts <App /> into index.html
│   ├── index.css             ← Global reset (body margin only)
│   ├── App.jsx               ← Root component; handles auth state, shows Auth or LoanLedger
│   ├── Auth.jsx              ← Login / signup form
│   ├── LoanLedger.jsx        ← Main calculator UI and amortization engine
│   ├── loanStore.js          ← Data access layer (Supabase read/write functions)
│   └── supabaseClient.js     ← Supabase connection singleton
├── .env.local                ← Environment variables (not committed to git)
├── .gitignore
├── index.html                ← HTML shell; Vite injects the JS bundle here
├── package.json
└── vite.config.js
```

---

## 3. Component Tree

```
<App>
 ├── (loading) → null
 ├── (logged out) → <Auth />
 └── (logged in) →
      ├── Sign-out button
      └── <LoanLedger userId={session.user.id}>
           ├── Header + Save button
           ├── <Field> (×6, inside Inputs panel)
           ├── <Field> + <Field> + <Field> (inside Events draft form)
           ├── Event list rows (×N, one per saved event)
           ├── <Stat> (×4, snapshot metrics row)
           ├── <Stat> (×3, lifetime totals row)
           ├── <ResponsiveContainer> → <LineChart> (Recharts)
           │    ├── <Line> original schedule
           │    ├── <Line> actual schedule
           │    ├── <ReferenceLine> today marker
           │    └── <ReferenceDot> ×N (one per event)
           └── Schedule table (×N rows, collapsible)
```

---

## 4. Component Descriptions

### 4.1 `main.jsx`

The entry point. Renders `<App />` into the `#root` div in `index.html`. Also imports `index.css`. Nothing application-specific lives here — it is the standard Vite/React boilerplate entry.

---

### 4.2 `supabaseClient.js`

A module that creates and exports exactly one Supabase client instance:

```js
export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
```

**Why a singleton:** Supabase's client manages session state internally. Creating multiple instances would split that state across disconnected objects, causing authentication inconsistencies. All other modules import this one shared instance.

**Environment variables:** `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` are Vite's way of reading `.env.local` at build time. The `VITE_` prefix is required — Vite strips any variable without it from the browser bundle as a security measure.

---

### 4.3 `App.jsx`

The root component. Its only responsibility is **routing between the logged-out and logged-in states** — it renders nothing else.

**State:**

| State variable | Type | Purpose |
|---|---|---|
| `session` | object \| null | Current Supabase auth session, or null if logged out |
| `loadingSession` | boolean | Prevents flash of the login screen before the session check completes |

**Behaviour:**

1. On mount, calls `supabase.auth.getSession()` to check for an existing session from a previous visit (Supabase stores the JWT token in the browser's local storage automatically). Sets `loadingSession = false` when this completes.
2. Subscribes to `supabase.auth.onAuthStateChange(...)` — a real-time listener that fires whenever the user signs in, signs up, or signs out. Updates `session` accordingly, causing an immediate re-render.
3. Cleans up the listener subscription on unmount (the `return () => listener.subscription.unsubscribe()` in the `useEffect` cleanup).

**Render logic:**

```
loadingSession === true  →  render nothing (avoids login flash)
session === null         →  render <Auth />
session !== null         →  render sign-out button + <LoanLedger userId={session.user.id} />
```

The `userId` prop passed to `LoanLedger` is the user's unique identifier from Supabase Auth (`session.user.id` — a UUID). This is the same value used as the foreign key in the `loan_scenarios` table.

---

### 4.4 `Auth.jsx`

A self-contained login/signup form. No props. Handles its own state and talks to Supabase directly.

**State:**

| State variable | Type | Purpose |
|---|---|---|
| `mode` | `'sign_in'` \| `'sign_up'` | Toggles between the two form variants |
| `email` | string | Controlled input value |
| `password` | string | Controlled input value |
| `error` | string \| null | Error message returned by Supabase, displayed inline |
| `loading` | boolean | Disables the submit button while the network request is in flight |

**Behaviour:**

- `handleSubmit` calls either `supabase.auth.signInWithPassword()` or `supabase.auth.signUp()` depending on `mode`.
- On success, Supabase's `onAuthStateChange` listener in `App.jsx` fires automatically — `App` updates its `session` state and re-renders, replacing `<Auth />` with `<LoanLedger />`. `Auth` does not need to do anything itself to trigger this navigation.
- On failure, Supabase returns an error object. The `error.message` string (e.g. "Invalid login credentials") is displayed below the form fields.

---

### 4.5 `loanStore.js`

A pure data-access module — no UI, no React. Exports two async functions:

#### `loadOrCreateScenario(userId)`

1. Queries `loan_scenarios` for any row where `user_id = userId` (limit 1).
2. **If found:** fetches all `loan_events` rows for that scenario, ordered by `event_date`. Returns `{ scenarioId, inputs, events }`.
3. **If not found (first login ever):** inserts a new `loan_scenarios` row with hardcoded sensible defaults. Returns `{ scenarioId, inputs: defaults, events: [] }`.

The "create on first login" behaviour means the UI never needs to handle a "no scenario exists yet" empty state — every logged-in user always has exactly one scenario.

#### `saveScenario(scenarioId, inputs, events)`

1. Updates the `loan_scenarios` row (matching `scenarioId`) with the current input values and a fresh `updated_at` timestamp.
2. Deletes **all** existing `loan_events` rows for this scenario.
3. Re-inserts the current events list as new rows.

**Why delete-all + re-insert for events:** Tracking individual additions, edits, and deletions would require maintaining per-event dirty flags and sending separate INSERT/UPDATE/DELETE calls. The delete-all + re-insert approach is simpler and equally correct for a list that rarely exceeds a few dozen rows. At larger scales this would need revisiting, but it is appropriate here.

**Naming translation:** Supabase/Postgres columns use `snake_case` (`total_price`, `annual_amort_rate`) while React state uses `camelCase` (`totalPrice`, `annualAmortRate`). `loanStore.js` contains two private helpers — `inputsToRow()` and `rowToInputs()` — that translate between the two conventions. All other files use only `camelCase` and never see raw database column names.

---

### 4.6 `LoanLedger.jsx`

The main calculator component. Contains the amortization engine, all UI sections, and the load/save logic that connects them to `loanStore.js`.

This is the largest file in the project. Its responsibilities are:

1. **Date and number utility functions** (top of file, outside the component)
2. **`generateSchedule()`** — the core amortization calculation engine (outside the component, a pure function)
3. **`DEFAULT_INPUTS` and `EVENT_META`** — static configuration objects
4. **`Field` and `Stat`** — small presentational sub-components (defined before the main export)
5. **`LoanLedger` component** — state, derived calculations, event handlers, and the full JSX tree

These are described in detail in the Code Reference document (document 3).

**Props:**

| Prop | Type | Purpose |
|---|---|---|
| `userId` | string (UUID) | Passed from `App.jsx`; used to load/save the correct user's data |

**State:**

| State variable | Type | Purpose |
|---|---|---|
| `inputs` | object | The six loan parameter fields |
| `events` | array | List of loan modification events |
| `draft` | object | The in-progress "new event" form values |
| `showAllRows` | boolean | Whether the schedule table shows all rows or just the first 36 |
| `scenarioId` | string \| null | UUID of the loaded `loan_scenarios` row |
| `loaded` | boolean | Suppresses the UI until Supabase data has arrived |
| `saving` | boolean | Disables the Save button while the request is in flight |
| `saveError` | string \| null | Error message from a failed save attempt |
| `savedAt` | number \| null | Timestamp of last successful save (used to show "Saved ✓") |

**Key derived values (computed with `useMemo`):**

| Variable | How derived |
|---|---|
| `actual` | `generateSchedule(inputs, events)` — the schedule with all events applied |
| `original` | `generateSchedule(inputs, [])` — the schedule with no events, for comparison |
| `todayIdx` | Index of the last row whose `date` is ≤ today |
| `currentBalance` | Balance after the most recent processed payment |
| `nextRow` | The row immediately after `todayIdx` |
| `monthsRemaining` | `actual.length - (todayIdx + 1)` |
| `timeSaved` | `original.length - actual.length` |
| `interestSaved` | Lifetime interest difference between original and actual |
| `interestPaidTillDate` | `actual[todayIdx].totalInterestToDate` |
| `totalInterestActual` | `actual[last].totalInterestToDate` |
| `totalHomeCost` | `inputs.totalPrice + totalInterestActual` |
| `chartData` | Combined array of `{ month, original, actual }` objects for Recharts |
| `eventDots` | Positions for the coloured event markers on the chart |
| `allTicks` | Merged dense + sparse tick positions for the x-axis |

---

### 4.7 `Field` (sub-component, in `LoanLedger.jsx`)

A tiny wrapper that renders a `<label>`, a text label, and whatever child element is passed in (an `<input>` or `<select>`).

```jsx
<Field label="Annual amortization rate (%)">
  <input type="number" ... />
</Field>
```

Keeps the inputs panel JSX clean by eliminating repeated `<label><span>...</span><input /></label>` boilerplate.

---

### 4.8 `Stat` (sub-component, in `LoanLedger.jsx`)

Renders a single metric tile: an icon, a label string, a value string, and an optional sub-label. An optional `accent` prop overrides the icon colour (used for the copper-toned lifetime metrics row).

```jsx
<Stat
  icon={<Wallet size={18} />}
  label="Current balance"
  value={fmtNum(currentBalance)}
/>
```

---

## 5. Data Flow

```
Supabase DB
    │
    │  loadOrCreateScenario(userId)
    ▼
LoanLedger state
(inputs, events)
    │
    │  generateSchedule()   [pure function, runs in browser]
    ▼
actual[], original[]
    │
    ├──► Stat tiles (derived values)
    ├──► LineChart (chartData array)
    └──► Schedule table (visibleRows)

    │
    │  handleSave()
    ▼
loanStore.saveScenario()
    │
    ▼
Supabase DB
```

All calculation happens client-side, synchronously, every time `inputs` or `events` changes. There is no debouncing — the schedule recalculates on every keystroke in the inputs panel and on every event add/delete. For loan terms up to 60 years (720 months, the hard cap), this is fast enough to be imperceptible.

---

## 6. Authentication Flow

```
User submits form
      │
      ▼
supabase.auth.signInWithPassword()
  or signUp()
      │
      ▼ (Supabase validates, returns session JWT)
      │
      ▼
onAuthStateChange fires in App.jsx
      │
      ▼
App.session updated → LoanLedger renders
      │
      ▼
useEffect fires → loadOrCreateScenario(userId)
      │
      ▼
State populated → UI shows real data
```

The JWT token is stored in browser `localStorage` by Supabase's client library automatically. On the next visit, `getSession()` retrieves it without requiring a re-login, until the token expires (default: 1 hour, with automatic refresh).

---

## 7. External Dependencies

| Package | Version | Purpose |
|---|---|---|
| `react` | 19.x | UI framework |
| `react-dom` | 19.x | React's browser renderer |
| `recharts` | 3.x | Chart components (`LineChart`, `XAxis`, etc.) |
| `lucide-react` | 1.x | Icon components (`Wallet`, `Trash2`, etc.) |
| `@supabase/supabase-js` | latest | Supabase client (auth + database) |
| `vite` | 8.x | Build tool and dev server |
| `eslint` | — | Code linting (development only) |

---

## 8. Environment Variables

| Variable | Set in | Available in |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` (local) and Vercel project settings (production) | Browser bundle (baked in at build time) |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` (local) and Vercel project settings (production) | Browser bundle (baked in at build time) |

Neither variable is a true secret — the Supabase `anon` key is designed to be public-facing. Row Level Security policies in Supabase are the actual security layer, not keeping this key private.

---

## 9. Database Schema

### `loan_scenarios`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, auto-generated |
| `user_id` | uuid | Foreign key → `auth.users.id` |
| `name` | text | Scenario label (default: "My loan") |
| `total_price` | numeric | Total property purchase price |
| `principal` | numeric | Loan amount (not total price) |
| `term_months` | integer | Original loan term in months |
| `annual_amort_rate` | numeric | Annual amortization rate as a percentage |
| `start_rate_pct` | numeric | Initial interest rate as a percentage |
| `start_date` | date | First month of the loan |
| `created_at` | timestamptz | Auto-set on insert |
| `updated_at` | timestamptz | Updated on each save |

### `loan_events`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, auto-generated |
| `scenario_id` | uuid | Foreign key → `loan_scenarios.id` (cascade delete) |
| `event_date` | date | Month of the event (day is stored but ignored by the engine) |
| `event_type` | text | One of: `INTEREST`, `PRINCIPAL`, `EXTRA_PRINCIPAL` |
| `value` | numeric | New rate (%), new monthly amount, or one-time sum |
| `notes` | text | Optional free-text annotation |

### Row Level Security policies

Both tables have RLS enabled. Users can only SELECT, INSERT, UPDATE, and DELETE their own rows. For `loan_events`, ownership is verified by joining to `loan_scenarios` (since `loan_events` has no `user_id` column directly — it inherits ownership from its parent scenario).
