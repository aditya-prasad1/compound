import { z } from "zod";

export const itemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  estimation_method: z.enum(["database_or_ai_estimate", "ai_estimate"]),
  assumptions: z.array(z.string()),
});

export const mealSchema = z.object({
  items: z.array(itemSchema).min(1),
  totals: z.object({
    calories: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
  }),
  assumptions: z.array(z.string()),
  needs_clarification: z.boolean(),
});

export type Meal = z.infer<typeof mealSchema>;
export type MealItem = z.infer<typeof itemSchema>;

export type Targets = { calories: number; protein: number; carbs: number; fat: number };

export function localDateKey(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function getTargets(calories: number, proteinGoal?: number | null): Targets {
  if (!proteinGoal) return { calories, carbs: Math.round((calories * 0.5) / 4), protein: Math.round((calories * 0.2) / 4), fat: Math.round((calories * 0.3) / 9) };
  const proteinCalories = Math.min(calories, proteinGoal * 4);
  const remainingCalories = calories - proteinCalories;
  return { calories, protein: Math.round(proteinGoal), carbs: Math.round((remainingCalories * 0.625) / 4), fat: Math.round((remainingCalories * 0.375) / 9) };
}

export function calculateTotals(items: MealItem[]): Meal["totals"] {
  return items.reduce(
    (totals, item) => ({
      calories: totals.calories + item.calories,
      protein_g: totals.protein_g + item.protein_g,
      carbs_g: totals.carbs_g + item.carbs_g,
      fat_g: totals.fat_g + item.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

const catalog: Record<string, Omit<MealItem, "name" | "quantity" | "unit" | "assumptions">> = {
  egg: { calories: 78, protein_g: 6.3, carbs_g: 0.6, fat_g: 5.3, estimation_method: "database_or_ai_estimate" },
  banana: { calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, estimation_method: "database_or_ai_estimate" },
  roti: { calories: 110, protein_g: 3.5, carbs_g: 18, fat_g: 3, estimation_method: "ai_estimate" },
  milk: { calories: 61, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.3, estimation_method: "database_or_ai_estimate" },
  paneer: { calories: 265, protein_g: 18.3, carbs_g: 6.1, fat_g: 20.8, estimation_method: "ai_estimate" },
  rice: { calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, estimation_method: "database_or_ai_estimate" },
  dal: { calories: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4, estimation_method: "ai_estimate" },
  idli: { calories: 58, protein_g: 2, carbs_g: 12, fat_g: 0.2, estimation_method: "ai_estimate" },
  dosa: { calories: 168, protein_g: 4, carbs_g: 29, fat_g: 4, estimation_method: "ai_estimate" },
  poha: { calories: 180, protein_g: 4, carbs_g: 30, fat_g: 5, estimation_method: "ai_estimate" },
  rajma: { calories: 127, protein_g: 8.7, carbs_g: 22.8, fat_g: 0.5, estimation_method: "ai_estimate" },
};

function quantityFor(text: string, word: string) {
  const match = text.match(new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?)\\s*(?:x|×)?\\s*${word}`, "i"));
  return match ? Number(match[1]) : 1;
}

export function demoEstimate(message: string): Meal {
  const text = message.toLowerCase();
  const matches: MealItem[] = [];
  const aliases: Array<[string, string, string]> = [
    ["eggs?", "egg", "piece"], ["rotis?|chapatis?", "roti", "piece"], ["bananas?", "banana", "piece"],
    ["milk", "milk", "ml"], ["paneer", "paneer", "g"], ["rice", "rice", "g"], ["dal", "dal", "g"],
    ["idlis?", "idli", "piece"], ["dosas?", "dosa", "piece"], ["poha", "poha", "g"], ["rajma", "rajma", "g"],
  ];
  for (const [pattern, key, unit] of aliases) {
    if (new RegExp(`\\b${pattern}\\b`, "i").test(text)) {
      const base = catalog[key];
      const quantity = quantityFor(text, pattern.split("?")[0]);
      const multiplier = unit === "ml" ? Math.max(quantity, 100) / 100 : unit === "g" ? Math.max(quantity, 100) / 100 : quantity;
      matches.push({ name: key === "roti" ? "Roti" : key[0].toUpperCase() + key.slice(1), quantity, unit, ...base, calories: Math.round(base.calories * multiplier), protein_g: Number((base.protein_g * multiplier).toFixed(1)), carbs_g: Number((base.carbs_g * multiplier).toFixed(1)), fat_g: Number((base.fat_g * multiplier).toFixed(1)), assumptions: [unit === "piece" ? "Typical serving size" : `Estimated for ${quantity}${unit}`] });
    }
  }
  if (!matches.length) {
    matches.push({ name: "Mixed meal", quantity: 1, unit: "serving", calories: 350, protein_g: 14, carbs_g: 45, fat_g: 12, estimation_method: "ai_estimate", assumptions: ["Estimated as a typical home-style serving"] });
  }
  return { items: matches, totals: calculateTotals(matches), assumptions: ["Values are estimates; adjust quantities or assumptions in chat."], needs_clarification: false };
}
