import { NextResponse } from "next/server";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/supabase-server-auth";

function config() {
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  if (!url || !key) throw new Error("Supabase is not configured.");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const user = await getAuthenticatedUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const workoutResponse = await supabaseRequest(`workouts?user_id=eq.${user.id}&workout_date=eq.${date}&select=id,workout_date&limit=1`, { cache: "no-store" });
    if (!workoutResponse.ok) return NextResponse.json({ error: "Could not load workout." }, { status: 502 });
    const workouts = await workoutResponse.json();
    if (!workouts[0]) return NextResponse.json({ workout: null, persisted: true });
    const exercisesResponse = await supabaseRequest(`workout_exercises?workout_id=eq.${workouts[0].id}&select=id,exercise_id,exercise_name,muscle_group,position&order=position.asc`, { cache: "no-store" });
    if (!exercisesResponse.ok) return NextResponse.json({ error: "Could not load workout exercises." }, { status: 502 });
    const exercises = await exercisesResponse.json();
    const ids = exercises.map((exercise: { id: string }) => exercise.id);
    const setsResponse = ids.length ? await supabaseRequest(`workout_sets?workout_exercise_id=in.(${ids.join(",")})&select=id,workout_exercise_id,set_number,reps,weight_kg&order=set_number.asc`, { cache: "no-store" }) : null;
    if (setsResponse && !setsResponse.ok) return NextResponse.json({ error: "Could not load workout sets." }, { status: 502 });
    const sets = setsResponse ? await setsResponse.json() : [];
    return NextResponse.json({
      workout: {
        date,
        exercises: exercises.map((exercise: { id: string; exercise_id: string; exercise_name: string; muscle_group: string }) => ({
          id: exercise.id,
          exerciseId: exercise.exercise_id,
          name: exercise.exercise_name,
          muscleGroup: exercise.muscle_group,
          sets: sets.filter((set: { workout_exercise_id: string }) => set.workout_exercise_id === exercise.id).map((set: { id: string; reps: string; weight_kg: string }) => ({ id: set.id, reps: set.reps, weightKg: set.weight_kg })),
        })),
      },
      persisted: true,
    });
  } catch {
    return NextResponse.json({ error: "Could not load workout." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { date?: string; exercises?: Array<{ exerciseId: string; name: string; muscleGroup: string; sets: Array<{ reps: string; weightKg: string }> }> };
    if (!body.date || !Array.isArray(body.exercises)) return NextResponse.json({ error: "A date and exercises are required." }, { status: 400 });
    const user = await getAuthenticatedUser(request);
    if (!user) return unauthorizedResponse();
    const workoutResponse = await supabaseRequest("workouts?on_conflict=user_id,workout_date", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ user_id: user.id, workout_date: body.date }) });
    if (!workoutResponse.ok) return NextResponse.json({ error: "Could not save workout." }, { status: 502 });
    const workout = (await workoutResponse.json())[0];
    const existingResponse = await supabaseRequest(`workout_exercises?workout_id=eq.${workout.id}&select=id`);
    if (!existingResponse.ok) return NextResponse.json({ error: "Could not update workout." }, { status: 502 });
    const existing = await existingResponse.json();
    if (existing.length) {
      const deleteResponse = await supabaseRequest(`workout_exercises?workout_id=eq.${workout.id}`, { method: "DELETE" });
      if (!deleteResponse.ok) return NextResponse.json({ error: "Could not replace workout exercises." }, { status: 502 });
    }
    for (const [position, exercise] of body.exercises.entries()) {
      const exerciseResponse = await supabaseRequest("workout_exercises", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ workout_id: workout.id, exercise_id: exercise.exerciseId, exercise_name: exercise.name, muscle_group: exercise.muscleGroup, position }) });
      if (!exerciseResponse.ok) throw new Error("Exercise save failed");
      const savedExercise = (await exerciseResponse.json())[0];
      if (exercise.sets.length) {
        const setsResponse = await supabaseRequest("workout_sets", { method: "POST", body: JSON.stringify(exercise.sets.map((set, setNumber) => ({ workout_exercise_id: savedExercise.id, set_number: setNumber, reps: set.reps, weight_kg: set.weightKg }))) });
        if (!setsResponse.ok) throw new Error("Set save failed");
      }
    }
    return NextResponse.json({ ok: true, persisted: true });
  } catch {
    return NextResponse.json({ error: "Could not save workout." }, { status: 502 });
  }
}
