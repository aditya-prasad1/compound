import { NextResponse } from "next/server";
import { calculateTotals, demoEstimate, mealSchema } from "@/lib/nutrition";

const systemPrompt = `You are a nutrition estimation assistant for compound. Interpret food messages into JSON only. Recognize Indian foods including roti, dal, rice, paneer, poha, idli, dosa, rajma and hostel meals. Include quantity, unit, calories, protein_g, carbs_g, fat_g, estimation_method, assumptions, totals, assumptions, and needs_clarification. Use estimates, never claim an unverified database record. Prefer a conservative lower-bound estimate within the plausible range: use the smaller reasonable serving when quantity is ambiguous, assume minimal cooking oil, and do not add ghee, butter, sauces, sugar, or sides unless the user says they were included. Do not undercount a clearly specified quantity. Record every material assumption so the user can correct it. Ask for clarification only when it materially changes the result.`;

function parseModelJson(content: unknown) {
  if (typeof content !== "string") throw new Error("The model returned no text.");
  const unfenced = content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("The model returned invalid JSON.");
    return JSON.parse(unfenced.slice(start, end + 1));
  }
}

function normalizeModelMeal(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("The model returned an invalid meal.");
  const raw = value as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map((item) => {
    if (!item || typeof item !== "object") throw new Error("The model returned an invalid item.");
    const rawItem = item as Record<string, unknown>;
    const assumptions = rawItem.assumptions;
    const servingSize = String(rawItem.serving_size ?? "");
    const inferredUnit = /\bml\b/i.test(servingSize) ? "ml" : /\bg\b/i.test(servingSize) ? "g" : "piece";
    return {
      ...rawItem,
      name: rawItem.name ?? rawItem.food ?? rawItem.food_item ?? rawItem.item,
      unit: rawItem.unit ?? inferredUnit,
      calories: rawItem.calories ?? rawItem.kcal,
      protein_g: rawItem.protein_g ?? rawItem.protein,
      carbs_g: rawItem.carbs_g ?? rawItem.carbs ?? rawItem.carbohydrates_g,
      fat_g: rawItem.fat_g ?? rawItem.fat,
      estimation_method: rawItem.estimation_method === "database_or_ai_estimate" ? "database_or_ai_estimate" : "ai_estimate",
      assumptions: Array.isArray(assumptions) ? assumptions : assumptions ? [String(assumptions)] : [],
    };
  });
  const clarification = raw.needs_clarification;
  return {
    ...raw,
    items,
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions : raw.assumptions ? [String(raw.assumptions)] : [],
    needs_clarification: Array.isArray(clarification) ? clarification.length > 0 : Boolean(clarification),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string; context?: string };
    const message = body.message?.trim();
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

    if (!process.env.LLM_API_KEY) {
      return NextResponse.json({ meal: demoEstimate(message), source: "demo", reply: "Here is an estimate. You can correct any quantity before logging." });
    }

    const configuredUrl = process.env.LLM_API_URL ?? "https://api.openai.com/v1/chat/completions";
    const llmUrl = /\/chat\/completions\/?$/i.test(configuredUrl) ? configuredUrl : `${configuredUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const response = await fetch(llmUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `${body.context ?? ""}\n${message}` }],
      }),
    });
    if (!response.ok) return NextResponse.json({ error: "The nutrition service is unavailable. Try again." }, { status: 502 });
    const payload = await response.json();
    const parsed = normalizeModelMeal(parseModelJson(payload.choices?.[0]?.message?.content));
    const checked = mealSchema.parse(parsed);
    const meal = { ...checked, totals: calculateTotals(checked.items) };
    return NextResponse.json({ meal, source: "llm", reply: meal.needs_clarification ? "One detail could change this estimate. What quantity or preparation should I use?" : "Here is an estimate. You can correct any quantity before logging." });
  } catch {
    return NextResponse.json({ error: "I could not interpret that meal. Please try a little more detail." }, { status: 422 });
  }
}
