"use client";

import { useActionState, useState } from "react";
import type { Settings } from "@/config/defaults";
import { saveSettingsAction } from "@/app/actions";

const gbp = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  const [costs, setCosts] = useState(settings.costs.map((c) => ({ ...c, usd: String(c.usdPerMonth) })));
  const [fx, setFx] = useState(String(settings.usdToGbp));

  const totalUsd = costs.reduce((s, c) => s + (Number(c.usd) || 0), 0);
  const totalGbp = totalUsd * (Number(fx) || 0);

  return (
    <form action={action}>
      <section className="card">
        <h2>Monthly costs</h2>
        <p className="help">
          USD per month. Costs billed on other cycles are converted to a monthly equivalent (e.g. every 4 weeks × 13 ÷ 12).
          Spend for any period is pro-rated by day.
        </p>
        <div className="table-wrap" style={{ border: "none" }}>
          <table className="cost-table">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>Item</th>
                <th>Basis</th>
                <th style={{ width: 140, textAlign: "right" }}>USD / month</th>
                <th style={{ width: 110, textAlign: "right" }}>GBP / month</th>
                <th style={{ width: 70 }} />
              </tr>
            </thead>
            <tbody>
              {costs.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input type="hidden" name={`cost_key_${i}`} value={c.key} />
                    <input type="text" name={`cost_label_${i}`} value={c.label} aria-label="Item"
                      onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  </td>
                  <td>
                    <input type="text" name={`cost_basis_${i}`} value={c.basis} aria-label="Basis"
                      onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, basis: e.target.value } : x)))} />
                  </td>
                  <td className="num">
                    <input type="number" step="0.01" min="0" name={`cost_usd_${i}`} value={c.usd} aria-label="USD per month"
                      onChange={(e) => setCosts(costs.map((x, j) => (j === i ? { ...x, usd: e.target.value } : x)))} />
                  </td>
                  <td style={{ textAlign: "right" }}>{gbp((Number(c.usd) || 0) * (Number(fx) || 0))}</td>
                  <td>
                    <button type="button" className="link" onClick={() => setCosts(costs.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td style={{ textAlign: "right" }}>{usd(totalUsd)}</td>
                <td style={{ textAlign: "right" }}>{gbp(totalGbp)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setCosts([...costs, { key: "", label: "", basis: "", usdPerMonth: 0, usd: "" }])}>
            Add a cost
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Currency and dates</h2>
        <div className="form-grid">
          <label className="field">
            USD → GBP rate
            <input type="number" step="0.0001" min="0" name="usdToGbp" value={fx} onChange={(e) => setFx(e.target.value)} />
          </label>
          <label className="field">
            Cost start date
            <input type="date" name="costStartDate" defaultValue={settings.costStartDate} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Definitions</h2>
        <p className="help">Category names must match Smartlead exactly (case doesn’t matter). Separate with commas.</p>
        <div className="form-grid">
          <label className="field wide">
            Positive categories
            <input type="text" name="positiveCategories" defaultValue={settings.positiveCategories.join(", ")} />
          </label>
          <label className="field">
            Download category
            <input type="text" name="downloadCategory" defaultValue={settings.downloadCategory} />
          </label>
          <label className="field">
            Out-of-office categories (excluded from replies)
            <input type="text" name="oooCategories" defaultValue={settings.oooCategories.join(", ")} />
          </label>
          <label className="field">
            Highlight bounce rate above (%)
            <input type="number" step="0.1" min="0" name="bounceAlertPct" defaultValue={settings.bounceAlertPct} />
          </label>
        </div>
      </section>

      <div className="actions">
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state?.ok && <span className="ok-msg">✓ {state.ok}</span>}
        {state?.error && <span className="err-msg">{state.error}</span>}
      </div>
    </form>
  );
}
