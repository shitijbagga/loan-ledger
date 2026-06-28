import { supabase } from "./supabaseClient";

const DEFAULT_NEW_SCENARIO = {
  totalPrice: 1000000,
  principal: 600000,
  termMonths: 240,
  annualAmortRate: 6,
  startRatePct: 4,
  startDateISO: "2024-01-01",
};

function rowToInputs(row) {
  return {
    totalPrice: Number(row.total_price),
    principal: Number(row.principal),
    termMonths: Number(row.term_months),
    annualAmortRate: Number(row.annual_amort_rate),
    startRatePct: Number(row.start_rate_pct),
    startDateISO: row.start_date,
  };
}

function inputsToRow(inputs) {
  return {
    total_price: inputs.totalPrice,
    principal: inputs.principal,
    term_months: inputs.termMonths,
    annual_amort_rate: inputs.annualAmortRate,
    start_rate_pct: inputs.startRatePct,
    start_date: inputs.startDateISO,
  };
}

function rowToEvent(row) {
  return {
    id: row.id,
    date: row.event_date,
    type: row.event_type,
    value: Number(row.value),
    notes: row.notes || "",
  };
}

// Loads the user's scenario, creating a fresh default one the very first time they log in.
export async function loadOrCreateScenario(userId) {
  const { data: scenarios, error: selectError } = await supabase
    .from("loan_scenarios")
    .select("*")
    .eq("user_id", userId)
    .limit(1);
  if (selectError) throw selectError;

  if (scenarios && scenarios.length > 0) {
    const scenario = scenarios[0];
    const { data: eventRows, error: eventsError } = await supabase
      .from("loan_events")
      .select("*")
      .eq("scenario_id", scenario.id)
      .order("event_date");
    if (eventsError) throw eventsError;

    return {
      scenarioId: scenario.id,
      inputs: rowToInputs(scenario),
      events: (eventRows || []).map(rowToEvent),
    };
  }

  const { data: created, error: insertError } = await supabase
    .from("loan_scenarios")
    .insert({ user_id: userId, ...inputsToRow(DEFAULT_NEW_SCENARIO) })
    .select()
    .single();
  if (insertError) throw insertError;

  return { scenarioId: created.id, inputs: rowToInputs(created), events: [] };
}

// Saves the current inputs + events, fully replacing whatever events were there before.
export async function saveScenario(scenarioId, inputs, events) {
  const { error: updateError } = await supabase
    .from("loan_scenarios")
    .update({ ...inputsToRow(inputs), updated_at: new Date().toISOString() })
    .eq("id", scenarioId);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from("loan_events")
    .delete()
    .eq("scenario_id", scenarioId);
  if (deleteError) throw deleteError;

  if (events.length > 0) {
    const rows = events.map((e) => ({
      scenario_id: scenarioId,
      event_date: e.date,
      event_type: e.type,
      value: e.value,
      notes: e.notes || null,
    }));
    const { error: insertEventsError } = await supabase.from("loan_events").insert(rows);
    if (insertEventsError) throw insertEventsError;
  }
}