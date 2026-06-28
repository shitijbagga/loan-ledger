import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import LoanLedger from "./LoanLedger";

function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loadingSession) return null;
  if (!session) return <Auth />;

  return (
    <div>
      <div style={{ textAlign: "right", padding: "10px 20px" }}>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ fontSize: 13, background: "none", border: "1px solid #DCE2E0", borderRadius: 4, padding: "5px 10px", cursor: "pointer" }}
        >
          Sign out
        </button>
      </div>
      <LoanLedger userId={session.user.id} />
    </div>
  );
}

export default App;
