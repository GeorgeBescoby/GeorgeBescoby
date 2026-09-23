"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CostItem, Settings } from "@/config/defaults";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { getMainDb } from "@/lib/db";
import { getSettings, resetSettings, saveSettings, setDataMode, validateSettings, type DataMode } from "@/lib/settings";
import { runSync } from "@/lib/smartlead/sync";

async function requireSession() {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) throw new Error("Not signed in");
}

export type ActionState = { ok?: string; error?: string } | null;

export async function refreshNowAction(_prev: ActionState): Promise<ActionState> {
  await requireSession();
  if (!process.env.SMARTLEAD_API_KEY) return { error: "SMARTLEAD_API_KEY isn't set." };
  const result = await runSync(await getMainDb(), "manual");
  revalidatePath("/", "layout");
  return result.ok ? { ok: result.message } : { error: result.message };
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  const db = await getMainDb();
  const current = await getSettings(db);

  const costs: CostItem[] = [];
  for (let i = 0; form.has(`cost_label_${i}`); i++) {
    const label = String(form.get(`cost_label_${i}`) ?? "").trim();
    const usd = String(form.get(`cost_usd_${i}`) ?? "").trim();
    if (!label && !usd) continue; // blank "add a cost" row
    costs.push({
      key: String(form.get(`cost_key_${i}`) || label.toLowerCase().replace(/\W+/g, "_")),
      label,
      basis: String(form.get(`cost_basis_${i}`) ?? "").trim(),
      usdPerMonth: Number(usd),
    });
  }

  const next: Settings = {
    ...current,
    costs,
    usdToGbp: Number(form.get("usdToGbp")),
    costStartDate: String(form.get("costStartDate") ?? ""),
    positiveCategories: list(form.get("positiveCategories")),
    downloadCategory: String(form.get("downloadCategory") ?? "").trim(),
    oooCategories: list(form.get("oooCategories")),
    bounceAlertPct: Number(form.get("bounceAlertPct")),
  };
  // A download is always a positive reply.
  if (next.downloadCategory && !next.positiveCategories.some((c) => c.toLowerCase() === next.downloadCategory.toLowerCase())) {
    next.positiveCategories.push(next.downloadCategory);
  }

  const v = validateSettings(next);
  if (!v.ok) return { error: v.error };
  await saveSettings(db, v.settings);
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

export async function resetSettingsAction(): Promise<void> {
  await requireSession();
  await resetSettings(await getMainDb());
  revalidatePath("/", "layout");
  redirect(`/settings?reset=${Date.now()}`); // new key -> form re-reads the defaults
}

export async function setDataModeAction(form: FormData): Promise<void> {
  await requireSession();
  const mode: DataMode = form.get("mode") === "live" ? "live" : "mock";
  await setDataMode(await getMainDb(), mode);
  revalidatePath("/", "layout");
}
