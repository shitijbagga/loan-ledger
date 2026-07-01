# Loan Ledger — Code Reference

**Version:** 1.0  
**Date:** July 2026

This document describes every function, constant, and piece of logic in the codebase, file by file.

---

## 1. `supabaseClient.js`

### Exports

#### `supabase`
Type: `SupabaseClient`

The single shared Supabase client instance. Created by calling `createClient(url, key)` from `@supabase/supabase-js`. Reads credentials from Vite environment variables at build time.

Used in: `App.jsx` (auth), `Auth.jsx` (auth), `loanStore.js` (database).

---

## 2. `loanStore.js`

### Private helpers

#### `DEFAULT_NEW_SCENARIO`
Type: object

The loan values used when creating a first-time user's scenario. Mirrors the `DEFAULT_INPUTS` object in `LoanLedger.jsx`.

```js
{
  totalPrice: 1000000,
  principal: 600000,
  termMonths: 240,
  annualAmortRate: 6,
  startRatePct: 4,
  startDateISO: "2024-01-01",
}
```

---

#### `rowToInputs(row)`
Converts a raw `loan_scenarios` database row (snake_case keys, all values as strings from Postgres) into the React state shape (camelCase keys, numeric values).

| DB column | React key |
|---|---|
| `total_price` | `totalPrice` |
| `principal` | `principal` |
| `term_months` | `termMonths` |
| `annual_amort_rate` | `annualAmortRate` |
| `start_rate_pct` | `startRatePct` |
| `start_date` | `startDateISO` |

All numeric columns are wrapped in `Number()` to guard against Postgres returning them as strings.

---

#### `inputsToRow(inputs)`
The reverse of `rowToInputs`. Converts the React state object into a plain object with snake_case keys, suitable for passing to Supabase's `.insert()` or `.update()` calls.

---

#### `rowToEvent(row)`
Converts a raw `loan_events` database row into the event shape used by React state:

```js
{
  id: row.id,           // uuid string — used as the React list key
  date: row.event_date, // "YYYY-MM-DD" string
  type: row.event_type, // "INTEREST" | "PRINCIPAL" | "EXTRA_PRINCIPAL"
  value: Number(row.value),
  notes: row.notes || "",
}
```

### Exported functions

#### `loadOrCreateScenario(userId)`
Async. Returns `{ scenarioId, inputs, events }`.

**Logic:**
1. Queries `loan_scenarios` with `.select("*").eq("user_id", userId).limit(1)`.
2. If one or more rows exist, takes the first, fetches its `loan_events` ordered by `event_date`, and returns all three pieces.
3. If no rows exist (first login), inserts a new scenario row using `DEFAULT_NEW_SCENARIO`, and returns `{ scenarioId, inputs: defaults, events: [] }`.
4. Throws on any Supabase error (the calling `useEffect` catches this and sets `saveError`).

---

#### `saveScenario(scenarioId, inputs, events)`
Async. Returns nothing. Throws on error.

**Logic:**
1. `.update({ ...inputsToRow(inputs), updated_at: new Date().toISOString() }).eq("id", scenarioId)` — updates the scenario row.
2. `.delete().eq("scenario_id", scenarioId)` — removes all existing event rows for this scenario.
3. If `events.length > 0`, inserts all events as new rows in a single `.insert(rows)` call.

**Rationale for delete-all + re-insert:** Simpler than tracking individual event changes. Safe for the expected event list sizes (typically < 20 events per loan).

---

## 3. `Auth.jsx`

### State

| Variable | Initial | Purpose |
|---|---|---|
| `mode` | `"sign_in"` | Which form variant is showing |
| `email` | `""` | Controlled email field |
| `password` | `""` | Controlled password field |
| `error` | `null` | Supabase error message string |
| `loading` | `false` | Network request in progress flag |

### `handleSubmit(e)`
Async. Called on form submit.

1. Calls `e.preventDefault()` to stop browser page reload.
2. Clears any previous error, sets `loading = true`.
3. Conditionally calls either:
   - `supabase.auth.signInWithPassword({ email, password })` — for `mode === "sign_in"`
   - `supabase.auth.signUp({ email, password })` — for `mode === "sign_up"`
4. Sets `loading = false`.
5. If Supabase returns an error, sets `error = error.message`.
6. On success, does nothing — `App.jsx`'s `onAuthStateChange` listener picks up the new session and re-renders the app automatically.

### Render
Returns a minimal styled form (no CSS classes, all inline styles). Toggles between "Log in" / "Create account" by flipping `mode`. Password field uses `minLength={6}` (matching Supabase's minimum password length default).

---

## 4. `App.jsx`

### State

| Variable | Initial | Purpose |
|---|---|---|
| `session` | `null` | Supabase session object (contains `user.id`, JWT, etc.) |
| `loadingSession` | `true` | Prevents flashing the login screen before session check |

### `useEffect` (runs once on mount)
1. `supabase.auth.getSession()` — async check for an existing stored session (from a previous visit). Updates `session` and sets `loadingSession = false`.
2. `supabase.auth.onAuthStateChange((_event, session) => setSession(session))` — subscribes to all future auth events (login, signup, signout, token refresh).
3. Returns a cleanup function that calls `listener.subscription.unsubscribe()` when the component unmounts.

### Render

```
loadingSession → null (renders nothing, avoids flash)
!session       → <Auth />
session        → sign-out button + <LoanLedger userId={session.user.id} />
```

The sign-out button calls `supabase.auth.signOut()` directly — no handler function needed. This clears the local session, which triggers `onAuthStateChange` → `setSession(null)` → `<Auth />` re-renders.

---

## 5. `LoanLedger.jsx`

### 5.1 Date utility functions (module-level, not exported)

All date utilities work with JavaScript `Date` objects internally. The standard representation used throughout is the **first day of the month** (`new Date(year, month-1, 1)`), since the month is the meaningful unit — the actual day-of-month is irrelevant except when computing the last day for display.

#### `parseISO(s)`
Parses a `"YYYY-MM-DD"` or `"YYYY-MM"` string into a `Date` at the first of that month. Ignores the day component entirely.

**Why not `new Date(s)`:** JavaScript's `Date` constructor parses ISO strings as UTC midnight, which can shift to the previous calendar day in local timezones behind UTC (e.g. Stockholm in winter). Parsing year and month directly as local-time integers avoids this.

---

#### `toISO(d)`
Returns a `"YYYY-MM-DD"` string from a `Date`, using local time. Zero-pads month and day.

---

#### `addMonth(d)`
Returns a new `Date` one calendar month after `d`, always on the 1st. Uses `new Date(year, month+1, 1)` — JavaScript's `Date` constructor correctly handles month overflow (e.g. month 12 → January of next year).

---

#### `addMonths(d, n)`
Returns a new `Date` exactly `n` calendar months after `d`. Used only for the chart x-axis tick label calculation.

---

#### `lastDayOfMonth(d)`
Returns a `Date` representing the last day of `d`'s month. Uses `new Date(year, month+1, 0)` — passing day 0 gives the last day of the previous month, which is the last day of `month`.

---

#### `monthKey(d)`
Returns a `"YYYY-MM"` string from a `Date`. Used for month-level equality comparisons — comparing two `Date` objects directly would compare milliseconds, but we only care whether two dates share the same year-month.

---

#### `fmtDate(d)`
Returns a human-readable date string in British English format, with day, e.g. `"31 Jan 2024"`. Used for payment dates in the schedule table and next-payment metric.

---

#### `fmtMonthYear(d)`
Returns a short month+year string, e.g. `"Jan 2024"`. Used for the chart x-axis major tick labels and the event list dates.

---

#### `fmtNum(n)`
Rounds `n` to the nearest integer and formats with thin-space thousands separators (e.g. `600 000`). Swedish/European number formatting convention.

---

### 5.2 `generateSchedule(inputs, events)` — the amortization engine

**Pure function. No side effects. Called via `useMemo` in the component.**

#### Parameters
- `inputs` — the loan parameters object (`principal`, `annualAmortRate`, `startRatePct`, `startDateISO`)
- `events` — array of event objects (`{ date, type, value }`)

#### Returns
Array of row objects, one per month, up to payoff or the 720-month cap.

#### Algorithm

```
Initialise:
  rate           = startRatePct
  monthlyPrincipal = round(principal × annualAmortRate% ÷ 12)
  balance        = principal
  totalInterest  = 0
  cursor         = first day of startDate's month
  events         = sorted ascending by date string
  idx            = 0  (pointer into sorted events)

For each month m from 1 to MAX_MONTHS (720):
  curKey = "YYYY-MM" of cursor

  Process any events whose month ≤ curKey (advancing idx):
    INTEREST        → rate = event.value
    PRINCIPAL       → monthlyPrincipal = round(event.value)
    EXTRA_PRINCIPAL → balance -= event.value  (clamped to 0)
                      extraThisMonth += event.value

  balanceAtStart = balance (after any EXTRA_PRINCIPAL deduction)
  If balanceAtStart ≤ 0.5 → break (loan fully paid)

  interest         = balanceAtStart × rate% ÷ 12
  principalPortion = min(monthlyPrincipal, balanceAtStart)
  totalInterest   += interest
  balance          = balanceAtStart - principalPortion
  paymentDate      = last day of cursor's month

  Push row: { month, date: paymentDate, balanceAtStart, rate, monthlyPrincipal,
              interest, principalPortion, totalPayment, extra, eventTag,
              totalInterestToDate, pctOfOriginal }
  cursor = first day of next month
```

#### Key design decisions in the engine

**Why sort events outside the loop:** Supabase returns events ordered by `event_date`, and the UI sorts them on display too — but sorting once up front in the engine guarantees correctness regardless of insertion order, with O(n log n) cost paid once rather than per-month.

**Why a pointer (`idx`) rather than filtering each month:** Filtering inside the loop would be O(n × months). The sorted pointer approach is O(n + months) — the events list is walked exactly once across the entire loan term.

**Why `balanceAtStart ≤ 0.5` as the break condition:** Floating-point arithmetic means the balance may never hit exactly 0. A threshold of 0.5 (half a krona) is below any meaningful rounding unit and avoids an infinite loop on loans where the final principal portion slightly overshoots.

**Why `Math.round()` for monthlyPrincipal:** Swedish banking convention rounds the monthly amortization amount to the nearest whole krona. Applied both at initialisation (from `annualAmortRate`) and when a `PRINCIPAL` event sets a new value.

**Why `min(monthlyPrincipal, balanceAtStart)` for principalPortion:** In the final month, the remaining balance may be less than the standard monthly amount. Using `min` ensures the last payment exactly clears the loan rather than taking it negative.

**Why `EXTRA_PRINCIPAL` reduces balance before interest is calculated:** An extra payment made in a given month reduces the balance on which that month's interest accrues. This is the conventional treatment: the extra payment is assumed to arrive at the start of the period, reducing the outstanding amount before interest is charged.

---

### 5.3 Constants (module-level)

#### `DEFAULT_INPUTS`
Placeholder loan parameters shown before any real data is loaded. These are immediately overwritten by `loadOrCreateScenario()` once Supabase responds.

#### `DEFAULT_EVENTS`
Two demo events (one extra payment, one rate change), included so the chart is not flat on first load. These are **not** the events loaded from Supabase — they are the initial value of the `events` state variable, which is replaced by `loadOrCreateScenario()` before the user sees them (because `loaded` is `false` until that resolves, blocking the render).

#### `EVENT_META`
Maps each event type string to a display label and colour hex code. Used in three places: the event list tags, the chart `ReferenceDot` fills, and the inline table row flags.

```js
{
  INTEREST:        { label: "Rate change",     color: "#1F4E5F" },
  PRINCIPAL:       { label: "Payment change",  color: "#6B7A78" },
  EXTRA_PRINCIPAL: { label: "Extra payment",   color: "#BB6B3C" },
}
```

---

### 5.4 `Field` sub-component

```jsx
function Field({ label, children }) { ... }
```

Renders `<label class="field"><span class="field-label">{label}</span>{children}</label>`.

`children` is always either an `<input>` or a `<select>`. Wrapping them in `<label>` means clicking the label text focuses the associated control automatically (standard HTML behaviour), without needing explicit `htmlFor`/`id` wiring.

---

### 5.5 `Stat` sub-component

```jsx
function Stat({ icon, label, value, sub, accent }) { ... }
```

Renders a metric tile. `accent` is an optional CSS colour string applied to the icon. `sub` is an optional secondary line below the main value.

---

### 5.6 `LoanLedger` component — state

See Component Architecture document (document 2, section 4.6) for the full state table.

---

### 5.7 `LoanLedger` — `useEffect` (load on mount)

```js
useEffect(() => {
  if (!userId) return;
  loadOrCreateScenario(userId)
    .then(({ scenarioId, inputs, events }) => {
      setScenarioId(scenarioId);
      setInputs(inputs);
      setEvents(events);
      setLoaded(true);
    })
    .catch((err) => {
      setSaveError(err.message);
      setLoaded(true);
    });
}, [userId]);
```

Runs once when the component mounts (or if `userId` changes, which in practice never happens — a user would sign out and a new `LoanLedger` instance would mount). Sets `loaded = true` in both success and error branches so the loading state never gets stuck.

---

### 5.8 `LoanLedger` — `setInput(key)`

Returns a change-event handler for the given input field key:

```js
const setInput = (key) => (e) => {
  const v = e.target.value;
  setInputs((s) => ({ ...s, [key]: key === "startDateISO" ? v : Number(v) }));
};
```

`startDateISO` is kept as a string (the `<input type="date">` returns `"YYYY-MM-DD"` strings). All other fields are parsed to `Number`. The spread `{ ...s, [key]: ... }` creates a new object, preserving all other keys — this is necessary because React compares state by reference; mutating in place would not trigger a re-render.

---

### 5.9 `LoanLedger` — `addEvent()`

```js
const addEvent = () => {
  if (!draft.date || draft.value === "") return;
  setEvents((evs) => [
    ...evs,
    { id: Date.now(), date: draft.date, type: draft.type, value: Number(draft.value), notes: draft.notes },
  ]);
  setDraft({ date: "", type: draft.type, value: "", notes: "" });
};
```

Guards against empty date or value. Uses `Date.now()` (current Unix timestamp in milliseconds) as a temporary client-side `id` — this is only used as a React list key for rendering. When the events are saved and reloaded from Supabase, each event gets a real UUID from the database, replacing this temporary id.

After adding, clears the date/value/notes fields but **preserves the selected type** — if a user is entering several rate-change events in a row, they shouldn't have to re-select the type each time.

---

### 5.10 `LoanLedger` — `removeEvent(id)`

```js
const removeEvent = (id) => setEvents((evs) => evs.filter((e) => e.id !== id));
```

Filters out the event with the matching id. Works for both temporary (`Date.now()`) ids (events added in this session but not yet saved) and real UUID ids (events loaded from Supabase).

---

### 5.11 `LoanLedger` — `handleSave()`

```js
const handleSave = async () => {
  setSaving(true);
  setSaveError(null);
  try {
    await saveScenario(scenarioId, inputs, events);
    setSavedAt(Date.now());
  } catch (err) {
    setSaveError(err.message);
  }
  setSaving(false);
};
```

Sets `saving = true` (disables button, shows "Saving...") while the async operation is in flight. On success, records the timestamp in `savedAt` (used to display "Saved ✓"). On failure, records the error message. Always sets `saving = false` when done, whether or not it succeeded.

---

### 5.12 `LoanLedger` — derived calculations

After `actual` and `original` are computed via `useMemo`, a series of derived values are calculated synchronously on each render:

#### `todayIdx`
The index of the last row in `actual` whose `date` is on or before `new Date()`. Found by iterating forward and updating `todayIdx` whenever the condition holds — the last match is what we want (not the first). Returns `-1` if the loan start date is in the future.

#### `currentBalance`
```js
todayIdx >= 0
  ? actual[todayIdx].balanceAtStart - actual[todayIdx].principalPortion
  : inputs.principal
```
The balance after the most recent paid installment. If the loan hasn't started yet, returns the original principal.

#### `chartData`
```js
Array.from({ length: chartLen }, (_, i) => ({
  month: i + 1,
  original: i < original.length ? original[i].balanceAtStart : i === original.length ? 0 : null,
  actual:   i < actual.length   ? actual[i].balanceAtStart   : i === actual.length   ? 0 : null,
}))
```
For each month in the longer of the two schedules, records both balances. When a schedule ends (reaches payoff), adds one explicit `0` value then `null` for all subsequent months. The `0` creates a clean line-to-zero terminus; `null` combined with `connectNulls={false}` on the `<Line>` component prevents Recharts from drawing a gap-crossing line.

#### `xTicks` and `numberTicks` — x-axis tick arrays

```js
// Sparse: 5-7 evenly spaced positions that get "MMM yyyy" labels
const xTicks = Array.from({ length: numTicks }, (_, i) =>
  Math.round(1 + (i * (chartLen - 1)) / (numTicks - 1))
);

// Dense: up to 20 positions that get plain month-number labels
// Minor ticks too close to a major tick are filtered out to avoid overlap
const minGap = Math.max(2, Math.round(chartLen / numberTickCount / 1.5));
const numberTicks = rawNumberTicks.filter(
  (t) => xTicks.every((x) => Math.abs(t - x) >= minGap)
);

const allTicks = [...new Set([...numberTicks, ...xTicks])].sort((a, b) => a - b);
```

`allTicks` is the merged, sorted union used by Recharts' `ticks` prop. `xTickSet` (a `Set` of the sparse positions) is used inside `renderXTick` to decide which ticks get the bold date label.

#### `renderXTick(payload)`
A custom Recharts tick renderer. Renders a plain grey month number for minor ticks, and for major ticks also renders a bold navy "MMM yyyy" label offset below the number. Returns an SVG `<g>` element containing `<text>` children.

---

### 5.13 Styling approach

All styles are in a single `<style>` tag rendered inside the component's JSX (a CSS-in-JS-lite approach). This keeps the component fully self-contained — no separate `.css` file to maintain.

CSS custom properties (`--navy`, `--copper`, etc.) are defined on `.ledger-app` and inherited by all child elements. This means the entire colour palette can be changed in one place, and individual elements reference tokens rather than hard-coded hex values.

**Exception:** A few elements (the Auth form, the sign-out button in `App.jsx`, and the loading state) use inline styles rather than the CSS token system, because they live outside the `.ledger-app` wrapper and can't inherit its custom properties. These are candidates for refactoring if the design is extended.

---

## 6. Build and Deployment

### Local development

```bash
cd ~/loan-ledger
npm run dev        # starts Vite dev server at http://localhost:5173
```

Vite serves the app with hot module replacement (HMR) — React components re-render in the browser immediately when source files are saved, without a full page reload.

### Production build

```bash
npm run build      # outputs to dist/
```

Vite bundles all JS, resolves imports, tree-shakes unused code, and writes optimised static files to `dist/`. Environment variables are baked in at this point. The `dist/` folder is what Vercel actually serves.

### Deployment pipeline

```
Developer: git push origin main
    │
    ▼
GitHub receives the push
    │
    ▼
Vercel detects the push via webhook
    │
    ▼
Vercel clones the repo, runs:
  npm install
  npm run build
    │
    ▼
Vercel serves dist/ at the production domain
```

No manual deploy step is required after the initial Vercel setup. Every push to `main` triggers a full rebuild and deploy automatically.

### Environment variables in production

Vercel injects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables during the `npm run build` step. These must be set under the Vercel project's Settings → Environment Variables. They are not committed to git.
