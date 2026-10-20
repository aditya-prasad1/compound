import { NextResponse } from "next/server";
import { mealSchema } from "@/lib/nutrition";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/supabase-server-auth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from") ?? searchParams.get("startDate");
  const to = searchParams.get("to") ?? searchParams.get("endDate");
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const user = await getAuthenticatedUser(request);

  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ entries: [], persisted: false });
  if (!user) return unauthorizedResponse();

  const query = new URLSearchParams({ user_id: `eq.${user.id}`, order: "entry_date.asc,created_at.asc", select: "id,description,meal,entry_date,created_at" });
  if (date) {
    query.set("entry_date", `eq.${date}`);
  } else if (from && to) {
    query.append("entry_date", `gte.${from}`);
    query.append("entry_date", `lte.${to}`);
  } else if (from) {
    query.append("entry_date", `gte.${from}`);
  } else if (to) {
    query.append("entry_date", `lte.${to}`);
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/meal_entries?${query}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    cache: "no-store",
  });
  if (!response.ok) return NextResponse.json({ error: "Could not load history." }, { status: 502 });
  const rows = await response.json();
  return NextResponse.json({ entries: rows, persisted: true });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const meal = mealSchema.parse(body.meal);
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const user = await getAuthenticatedUser(request);
    if (supabaseUrl && serviceRoleKey && !user) return unauthorizedResponse();
    if (supabaseUrl && serviceRoleKey && user) {
      const response = await fetch(`${supabaseUrl}/rest/v1/meal_entries`, {
        method: "POST",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: user.id, entry_date: date, description: body.description ?? "Meal", meal, idempotency_key: body.idempotencyKey }),
      });
      if (!response.ok) return NextResponse.json({ error: "Could not save the entry." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, persisted: Boolean(supabaseUrl && serviceRoleKey && user) });
  } catch {
    return NextResponse.json({ error: "Invalid meal entry." }, { status: 400 });
  }
}
