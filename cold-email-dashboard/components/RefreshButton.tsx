"use client";

import { useActionState } from "react";
import { refreshNowAction } from "@/app/actions";

export function RefreshButton() {
  const [state, action, pending] = useActionState(refreshNowAction, null);
  return (
    <form action={action} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="submit" disabled={pending} title="Pull the latest numbers from Smartlead">
        {pending ? "Refreshing… (1–3 min)" : "Refresh now"}
      </button>
      {state?.error && <span className="err-msg">{state.error}</span>}
      {state?.ok && !pending && <span className="meta">{state.ok}</span>}
    </form>
  );
}
