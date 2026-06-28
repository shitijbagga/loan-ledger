import React, { useMemo, useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceDot, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Plus, Trash2, TrendingDown, CalendarClock, Wallet, PiggyBank, Receipt, Home } from "lucide-react";
import { loadOrCreateScenario, saveScenario } from "./loanStore";

/* ---------------------------------------------------------------- */
/* Date helpers                                                      */
/* ---------------------------------------------------------------- */
const parseISO = (s) => {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
};
const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const lastDayOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const fmtDate = (d) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtMonthYear = (d) =>
  d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const fmtNum = (n) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/* ---------------------------------------------------------------- */
/* Amortization engine (linear / Swedish-style fixed principal)      */
/* ---------------------------------------------------------------- */
function generateSchedule({ principal, annualAmortRate, startRatePct, startDateISO }, events) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  let rate = startRatePct;
  let monthlyPrincipal = Math.round((principal * (annualAmortRate / 100)) / 12);
  let balance = principal;
  let totalInterest = 0;
  let cursor = parseISO(startDateISO);
  let idx = 0;
  const rows = [];
  const MAX_MONTHS = 720;

  for (let m = 1; m <= MAX_MONTHS; m++) {
    const curKey = monthKey(cursor);
    let extraThisMonth = 0;
    let eventTag = null;

    while (idx < sorted.length && monthKey(parseISO(sorted[idx].date)) <= curKey) {
      const ev = sorted[idx];
      if (ev.type === "INTEREST") {
        rate = ev.value;
        eventTag = "INTEREST";
      } else if (ev.type === "PRINCIPAL") {
        monthlyPrincipal = Math.round(ev.value);
        eventTag = "PRINCIPAL";
      } else if (ev.type === "EXTRA_PRINCIPAL") {
        balance -= ev.value;
        extraThisMonth += ev.value;
        eventTag = "EXTRA_PRINCIPAL";
      }
      idx++;
    }
    if (balance < 0) balance = 0;
    const balanceAtStart = balance;
    if (balanceAtStart <= 0.5) break;

    const interest = (balanceAtStart * (rate / 100)) / 12;
    const principalPortion = Math.min(monthlyPrincipal, balanceAtStart);
    totalInterest += interest;
    balance = balanceAtStart - principalPortion;

    const paymentDate = lastDayOfMonth(cursor);
    rows.push({
      month: m,
      date: paymentDate,
      dateISO: toISO(paymentDate),
      balanceAtStart,
      rate,
      monthlyPrincipal,
      interest,
      principalPortion,
      totalPayment: interest + principalPortion,
      extra: extraThisMonth,
      eventTag,
      totalInterestToDate: totalInterest,
      pctOfOriginal: (balance / principal) * 100,
    });
    cursor = addMonth(cursor);
  }
  return rows;
}

/* ---------------------------------------------------------------- */
/* Defaults                                                           */
/* ---------------------------------------------------------------- */
const DEFAULT_INPUTS = {
  totalPrice: 1000000,
  principal: 600000,
  termMonths: 240,
  annualAmortRate: 6,
  startRatePct: 4,
  startDateISO: "2024-01-01",
};

const DEFAULT_EVENTS = [
  { id: 1, date: "2025-06-01", type: "EXTRA_PRINCIPAL", value: 50000, notes: "Bonus payout" },
  { id: 2, date: "2025-09-01", type: "INTEREST", value: 3.5, notes: "Rate renegotiation" },
];

const EVENT_META = {
  INTEREST: { label: "Rate change", color: "#1F4E5F" },
  PRINCIPAL: { label: "Payment change", color: "#6B7A78" },
  EXTRA_PRINCIPAL: { label: "Extra payment", color: "#BB6B3C" },
};

/* ---------------------------------------------------------------- */
/* Small presentational pieces                                       */
/* ---------------------------------------------------------------- */
function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Stat({ icon, label, value, sub, accent }) {
  return (
    <div className="stat">
      <div className="stat-icon" style={accent ? { color: accent } : undefined}>
        {icon}
      </div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Main component                                                     */
/* ---------------------------------------------------------------- */
export default function LoanLedger({ userId }) {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState({ date: "", type: "EXTRA_PRINCIPAL", value: "", notes: "" });
  const [showAllRows, setShowAllRows] = useState(false);
  const [scenarioId, setScenarioId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (!userId) return;
    loadOrCreateScenario(userId)
      .then((result) => {
        setScenarioId(result.scenarioId);
        setInputs(result.inputs);
        setEvents(result.events);
        setLoaded(true);
      })
      .catch((err) => {
        setSaveError(err.message);
        setLoaded(true);
      });
  }, [userId]);

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

  const setInput = (key) => (e) => {
    const v = e.target.value;
    setInputs((s) => ({ ...s, [key]: key === "startDateISO" ? v : Number(v) }));
  };

  const addEvent = () => {
    if (!draft.date || draft.value === "") return;
    setEvents((evs) => [
      ...evs,
      { id: Date.now(), date: draft.date, type: draft.type, value: Number(draft.value), notes: draft.notes },
    ]);
    setDraft({ date: "", type: draft.type, value: "", notes: "" });
  };

  const removeEvent = (id) => setEvents((evs) => evs.filter((e) => e.id !== id));

  const actual = useMemo(() => generateSchedule(inputs, events), [inputs, events]);
  const original = useMemo(() => generateSchedule(inputs, []), [inputs]);

  const today = new Date();
  let todayIdx = -1;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i].date <= today) todayIdx = i;
  }

  const currentBalance =
    todayIdx >= 0 ? actual[todayIdx].balanceAtStart - actual[todayIdx].principalPortion : inputs.principal;
  const nextRow = actual[todayIdx + 1];
  const monthsRemaining = Math.max(actual.length - (todayIdx + 1), 0);
  const actualPayoff = actual.length ? actual[actual.length - 1].date : null;
  const originalPayoff = original.length ? original[original.length - 1].date : null;
  const totalInterestActual = actual.length ? actual[actual.length - 1].totalInterestToDate : 0;
  const totalInterestOriginal = original.length ? original[original.length - 1].totalInterestToDate : 0;
  const timeSaved = original.length - actual.length;
  const interestSaved = totalInterestOriginal - totalInterestActual;

  // Interest paid so far (as of today's most recent processed installment)
  const interestPaidTillDate = todayIdx >= 0 ? actual[todayIdx].totalInterestToDate : 0;

  // Total interest expected over the life of the loan, given every event already
  // entered (past and future). This is simply the actual schedule's lifetime total.
  const interestExpectedAtCurrentRate = totalInterestActual;

  // Total cost of the home once the loan (with all entered events) is fully paid off
  const totalHomeCost = inputs.totalPrice + totalInterestActual;

  const chartLen = Math.max(original.length, actual.length) + 1;
  const chartData = Array.from({ length: chartLen }, (_, i) => ({
    month: i + 1,
    original: i < original.length ? original[i].balanceAtStart : i === original.length ? 0 : null,
    actual: i < actual.length ? actual[i].balanceAtStart : i === actual.length ? 0 : null,
  }));

  const eventDots = events
    .map((ev) => {
      const i = actual.findIndex((r) => monthKey(r.date) === monthKey(parseISO(ev.date)));
      if (i < 0) return null;
      return { ...ev, month: i + 1, balance: actual[i].balanceAtStart, color: EVENT_META[ev.type].color };
    })
    .filter(Boolean);

  // Converts a 1-based month index into a "MMM yyyy" label, anchored to the loan start date.
  const monthLabel = (idx) => fmtMonthYear(lastDayOfMonth(addMonths(parseISO(inputs.startDateISO), idx - 1)));

  // Sparse tier: 5-8 evenly spaced ticks that get the bold "MMM yyyy" label.
  const numTicks = Math.min(7, chartLen);
  const xTicks =
    numTicks > 1
      ? Array.from({ length: numTicks }, (_, i) => Math.round(1 + (i * (chartLen - 1)) / (numTicks - 1)))
      : [1];
  const xTickSet = new Set(xTicks);

  // Dense tier: plain month-number ticks shown more often so the axis doesn't look bare.
  // Minor ticks that land too close to a major (date) tick are dropped to avoid overlapping labels.
  const numberTickCount = Math.min(20, chartLen);
  const rawNumberTicks =
    numberTickCount > 1
      ? Array.from({ length: numberTickCount }, (_, i) => Math.round(1 + (i * (chartLen - 1)) / (numberTickCount - 1)))
      : [1];
  const minGap = Math.max(2, Math.round(chartLen / numberTickCount / 1.5));
  const numberTicks = rawNumberTicks.filter((t) => xTicks.every((x) => Math.abs(t - x) >= minGap));
  const allTicks = Array.from(new Set([...numberTicks, ...xTicks])).sort((a, b) => a - b);

  // Custom tick: plain month number for the dense tier, plus a bold date label for the sparse tier.
  const renderXTick = ({ x, y, payload }) => {
    const isMajor = xTickSet.has(payload.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={10} textAnchor="middle" fontSize={9.5} fontFamily="IBM Plex Mono, monospace" fill={isMajor ? "#16242B" : "#A6AEAC"} fontWeight={isMajor ? 600 : 400}>
          {payload.value}
        </text>
        {isMajor && (
          <text x={0} y={0} dy={23} textAnchor="middle" fontSize={10} fontFamily="Inter, sans-serif" fill="#1F4E5F" fontWeight={700}>
            {monthLabel(payload.value)}
          </text>
        )}
      </g>
    );
  };

  const visibleRows = showAllRows ? actual : actual.slice(0, 36);

  if (!loaded) {
    return (
      <div style={{ padding: 60, textAlign: "center", fontFamily: "Inter, sans-serif", color: "#6B7A78" }}>
        Loading your loan…
      </div>
    );
  }

  return (
    <div className="ledger-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .ledger-app {
          --paper: #F4F6F5;
          --grid-line: rgba(22,36,43,0.06);
          --card: #FFFFFF;
          --border: #DCE2E0;
          --ink: #16242B;
          --muted: #6B7A78;
          --navy: #1F4E5F;
          --copper: #BB6B3C;
          --sage: #4C7A6D;
          --slate: #6B7A78;
          font-family: 'Inter', system-ui, sans-serif;
          color: var(--ink);
          background: var(--paper);
          background-image:
            linear-gradient(var(--grid-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
          background-size: 28px 28px;
          padding: 28px;
          border-radius: 4px;
          max-width: 1180px;
          margin: 0 auto;
        }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .header { margin-bottom: 24px; }
        .eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--copper);
          font-weight: 600;
        }
        .title {
          font-size: 28px;
          font-weight: 700;
          margin: 4px 0 2px;
          letter-spacing: -0.01em;
        }
        .subtitle { color: var(--muted); font-size: 14px; }

        .grid-2 { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; margin-bottom: 16px; }
        @media (max-width: 860px) { .grid-2 { grid-template-columns: 1fr; } }

        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 18px 20px;
        }
        .card-head {
          display: flex; align-items: baseline; gap: 8px; margin-bottom: 14px;
        }
        .card-step {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px; color: var(--muted); font-weight: 600;
        }
        .card-title { font-size: 15px; font-weight: 700; }

        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field-label { font-size: 11.5px; color: var(--muted); font-weight: 500; }
        .field input, .field select {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          padding: 7px 9px;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: var(--paper);
          color: var(--ink);
        }
        .field input:focus, .field select:focus {
          outline: 2px solid var(--navy); outline-offset: 1px;
        }

        .event-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .event-form .notes-row { grid-column: 1 / -1; display: flex; gap: 8px; }
        .event-form .notes-row input { flex: 1; }
        .add-btn {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          background: var(--navy); color: white; border: none;
          padding: 8px 12px; border-radius: 4px; font-size: 13px; font-weight: 600;
          cursor: pointer; white-space: nowrap;
        }
        .add-btn:hover { background: #163d4a; }

        .event-list { display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto; }
        .event-row {
          display: flex; align-items: center; gap: 10px;
          border: 1px solid var(--border); border-radius: 4px; padding: 7px 10px;
          font-size: 12.5px; background: var(--paper);
        }
        .tag {
          font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; font-weight: 600;
          padding: 2px 6px; border-radius: 3px; color: white; white-space: nowrap;
        }
        .event-row .date { font-family: 'IBM Plex Mono', monospace; color: var(--muted); white-space: nowrap; }
        .event-row .notes { color: var(--muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .event-row .value { font-family: 'IBM Plex Mono', monospace; font-weight: 600; }
        .del-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px; }
        .del-btn:hover { color: var(--copper); }
        .empty-note { font-size: 12.5px; color: var(--muted); padding: 6px 0; }

        .stats-row {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;
        }
        .stats-row-highlight { grid-template-columns: repeat(3, 1fr); }
        .stats-row-highlight .stat { background: #FBF4EC; border-color: #E8D5BE; }
        @media (max-width: 860px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
        .stat {
          background: var(--card); border: 1px solid var(--border); border-radius: 6px;
          padding: 14px 16px; display: flex; gap: 10px; align-items: flex-start;
        }
        .stat-icon { color: var(--navy); margin-top: 1px; }
        .stat-label { font-size: 11px; color: var(--muted); font-weight: 500; }
        .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 17px; font-weight: 600; margin-top: 1px; }
        .stat-sub { font-size: 11px; color: var(--sage); margin-top: 2px; font-weight: 500; }

        .chart-card { margin-bottom: 16px; }
        .legend-row { display: flex; gap: 16px; margin-top: 10px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
        .legend-swatch { width: 12px; height: 3px; border-radius: 2px; }

        table.schedule { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        table.schedule th, table.schedule td {
          font-family: 'IBM Plex Mono', monospace;
          padding: 6px 8px; text-align: right; border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        table.schedule th:first-child, table.schedule td:first-child,
        table.schedule th:nth-child(2), table.schedule td:nth-child(2) { text-align: left; }
        table.schedule thead th {
          font-family: 'Inter', sans-serif; font-weight: 600; font-size: 11px;
          color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em;
          position: sticky; top: 0; background: var(--card);
        }
        table.schedule tbody tr:nth-child(even) { background: rgba(22,36,43,0.02); }
        .table-scroll { max-height: 420px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; }
        .show-more {
          margin-top: 10px; font-size: 12.5px; color: var(--navy); background: none; border: none;
          cursor: pointer; font-weight: 600; padding: 0;
        }
        .row-flag { font-size: 10px; padding: 1px 5px; border-radius: 3px; color: white; margin-left: 6px; }
      `}</style>

      <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <div className="eyebrow">Step-based loan ledger</div>
          <div className="title">Loan Amortization Planner</div>
          <div className="subtitle">
            Linear (Swedish-style) amortization — fixed monthly principal, adjustable via dated events.
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <button onClick={handleSave} disabled={saving} className="add-btn" style={{ background: "#BB6B3C" }}>
            {saving ? "Saving..." : "Save"}
          </button>
          {savedAt && !saving && <div style={{ fontSize: 11.5, color: "#4C7A6D", marginTop: 6 }}>Saved ✓</div>}
          {saveError && <div style={{ fontSize: 11.5, color: "#BB6B3C", marginTop: 6, maxWidth: 220 }}>{saveError}</div>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <span className="card-step">01</span>
            <span className="card-title">Loan inputs</span>
          </div>
          <div className="field-grid">
            <Field label="Total price of home">
              <input type="number" value={inputs.totalPrice} onChange={setInput("totalPrice")} />
            </Field>
            <Field label="Original loan amount">
              <input type="number" value={inputs.principal} onChange={setInput("principal")} />
            </Field>
            <Field label="Term (months)">
              <input type="number" value={inputs.termMonths} onChange={setInput("termMonths")} />
            </Field>
            <Field label="Annual amortization rate (%)">
              <input type="number" step="0.1" value={inputs.annualAmortRate} onChange={setInput("annualAmortRate")} />
            </Field>
            <Field label="Interest rate at start (%)">
              <input type="number" step="0.1" value={inputs.startRatePct} onChange={setInput("startRatePct")} />
            </Field>
            <Field label="Start date">
              <input type="date" value={inputs.startDateISO} onChange={setInput("startDateISO")} />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-step">02</span>
            <span className="card-title">Events — loan modifications</span>
          </div>
          <div className="event-form">
            <Field label="Event date">
              <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
            </Field>
            <Field label="Type">
              <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}>
                <option value="EXTRA_PRINCIPAL">Extra payment (one-time)</option>
                <option value="INTEREST">Interest rate change</option>
                <option value="PRINCIPAL">Monthly payment change</option>
              </select>
            </Field>
            <div className="notes-row">
              <Field label={draft.type === "INTEREST" ? "New rate (%)" : "Amount"}>
                <input type="number" value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} />
              </Field>
              <Field label="Notes (optional)">
                <input type="text" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
              </Field>
              <button className="add-btn" onClick={addEvent} style={{ alignSelf: "flex-end" }}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
          <div className="event-list">
            {events.length === 0 && <div className="empty-note">No events yet — the loan follows its original schedule.</div>}
            {[...events].sort((a, b) => a.date.localeCompare(b.date)).map((ev) => (
              <div className="event-row" key={ev.id}>
                <span className="tag" style={{ background: EVENT_META[ev.type].color }}>
                  {EVENT_META[ev.type].label}
                </span>
                <span className="date">{fmtMonthYear(parseISO(ev.date))}</span>
                <span className="value">
                  {ev.type === "INTEREST" ? `${ev.value}%` : `${fmtNum(ev.value)}`}
                </span>
                <span className="notes">{ev.notes}</span>
                <button className="del-btn" onClick={() => removeEvent(ev.id)} aria-label="Delete event">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stats-row">
        <Stat icon={<Wallet size={18} />} label="Current balance" value={fmtNum(currentBalance)} />
        <Stat
          icon={<CalendarClock size={18} />}
          label="Next payment"
          value={nextRow ? fmtNum(nextRow.totalPayment) : "—"}
          sub={nextRow ? fmtDate(nextRow.date) : ""}
        />
        <Stat icon={<TrendingDown size={18} />} label="Months remaining" value={monthsRemaining} sub={actualPayoff ? `Payoff ${fmtDate(actualPayoff)}` : ""} />
        <Stat
          icon={<PiggyBank size={18} />}
          label="Interest saved vs. original"
          value={fmtNum(interestSaved)}
          sub={timeSaved !== 0 ? `${timeSaved > 0 ? "−" : "+"}${Math.abs(timeSaved)} months vs. original` : "On original schedule"}
          accent="var(--sage)"
        />
      </div>

      <div className="stats-row stats-row-highlight">
        <Stat
          icon={<Receipt size={18} />}
          label="Total interest paid to date"
          value={fmtNum(interestPaidTillDate)}
          accent="var(--copper)"
        />
        <Stat
          icon={<Receipt size={18} />}
          label="Total interest expected at payoff"
          value={fmtNum(interestExpectedAtCurrentRate)}
          sub="Includes all events entered, past and future"
          accent="var(--copper)"
        />
        <Stat
          icon={<Home size={18} />}
          label="Total cost of home at payoff"
          value={fmtNum(totalHomeCost)}
          sub={`Price ${fmtNum(inputs.totalPrice)} + interest ${fmtNum(totalInterestActual)}`}
          accent="var(--copper)"
        />
      </div>

      <div className="card chart-card">
        <div className="card-head">
          <span className="card-step">03</span>
          <span className="card-title">Balance trajectory — original vs. actual</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 6, left: 0 }}>
            <CartesianGrid stroke="rgba(22,36,43,0.08)" vertical={false} />
            <XAxis
              dataKey="month"
              ticks={allTicks}
              interval={0}
              tick={renderXTick}
              height={48}
              axisLine={{ stroke: "#DCE2E0" }}
              tickLine={{ stroke: "#DCE2E0" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6B7A78" }}
              tickFormatter={(v) => fmtNum(v)}
              width={70}
              axisLine={{ stroke: "#DCE2E0" }}
              tickLine={{ stroke: "#DCE2E0" }}
            />
            <Tooltip
              formatter={(v) => (v == null ? "—" : fmtNum(v))}
              labelFormatter={(m) => `Month ${m} — ${monthLabel(m)}`}
            />
            <Line type="monotone" dataKey="original" stroke="#1F4E5F" strokeWidth={2} dot={false} strokeDasharray="5 4" connectNulls={false} />
            <Line type="monotone" dataKey="actual" stroke="#BB6B3C" strokeWidth={2.5} dot={false} connectNulls={false} />
            {todayIdx >= 0 && <ReferenceLine x={todayIdx + 1} stroke="#6B7A78" strokeDasharray="3 3" label={{ value: "Today", fontSize: 11, fill: "#6B7A78", position: "top" }} />}
            {eventDots.map((d) => (
              <ReferenceDot key={d.id} x={d.month} y={d.balance} r={5} fill={d.color} stroke="white" strokeWidth={1.5} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="legend-row">
          <div className="legend-item"><span className="legend-swatch" style={{ background: "#1F4E5F" }} /> Original schedule</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: "#BB6B3C" }} /> Actual (with events)</div>
          {Object.entries(EVENT_META).map(([k, v]) => (
            <div className="legend-item" key={k}>
              <span className="legend-swatch" style={{ background: v.color, width: 8, height: 8, borderRadius: "50%" }} />
              {v.label}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-step">04</span>
          <span className="card-title">Amortization schedule</span>
        </div>
        <div className="table-scroll">
          <table className="schedule">
            <thead>
              <tr>
                <th>#</th>
                <th>Installment due</th>
                <th>Balance at start</th>
                <th>Rate</th>
                <th>Interest</th>
                <th>Principal</th>
                <th>Total payment</th>
                <th>Extra</th>
                <th>Total interest</th>
                <th>% of original</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>
                    {fmtDate(r.date)}
                    {r.eventTag && (
                      <span className="row-flag" style={{ background: EVENT_META[r.eventTag].color }}>
                        {EVENT_META[r.eventTag].label}
                      </span>
                    )}
                  </td>
                  <td>{fmtNum(r.balanceAtStart)}</td>
                  <td>{r.rate.toFixed(2)}%</td>
                  <td>{fmtNum(r.interest)}</td>
                  <td>{fmtNum(r.principalPortion)}</td>
                  <td>{fmtNum(r.totalPayment)}</td>
                  <td>{r.extra ? fmtNum(r.extra) : "—"}</td>
                  <td>{fmtNum(r.totalInterestToDate)}</td>
                  <td>{r.pctOfOriginal.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAllRows && actual.length > 36 && (
          <button className="show-more" onClick={() => setShowAllRows(true)}>
            Show all {actual.length} months ↓
          </button>
        )}
        {showAllRows && (
          <button className="show-more" onClick={() => setShowAllRows(false)}>
            Collapse ↑
          </button>
        )}
      </div>
    </div>
  );
}
