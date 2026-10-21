"use client";

import { useEffect, useMemo, useState } from "react";
import { exerciseCatalog, muscleGroups, makeSetId, makeWorkoutExerciseId, type ExerciseDefinition, type WorkoutExercise, type WorkoutSet } from "@/lib/exercises";
import { getSupabaseAuthHeaders } from "@/lib/supabase-browser";

type Workout = { date: string; exercises: WorkoutExercise[] };
type WorkoutCardProps = { selectedDate: string; authUserId: string | null };
type PanelMode = "add" | "view";

const localDateKey = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const previousDate = (date: string) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() - 1); return localDateKey(value); };
const emptyWorkout = (date: string): Workout => ({ date, exercises: [] });

export default function WorkoutCard({ selectedDate, authUserId }: WorkoutCardProps) {
  const [workout, setWorkout] = useState<Workout>(() => emptyWorkout(selectedDate));
  const [previousWorkout, setPreviousWorkout] = useState<Workout | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState<(typeof muscleGroups)[number]>("All");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadedDate, setLoadedDate] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    async function loadWorkouts() {
      if (!selectedDate) return;
      setDirty(false);
      if (!authUserId) {
        setWorkout(emptyWorkout(selectedDate));
        setPreviousWorkout(null);
        setLoadedDate(selectedDate);
        return;
      }
      const stored = localStorage.getItem(`compound-workout-${selectedDate}`) ?? localStorage.getItem(`calorie-workout-${selectedDate}`);
      setWorkout(stored ? JSON.parse(stored) : emptyWorkout(selectedDate));
      setLoadedDate(selectedDate);
      const prior = previousDate(selectedDate);
      const storedPrior = localStorage.getItem(`compound-workout-${prior}`) ?? localStorage.getItem(`calorie-workout-${prior}`);
      setPreviousWorkout(storedPrior ? JSON.parse(storedPrior) : null);
      try {
        const headers = await getSupabaseAuthHeaders();
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`/api/workouts?date=${selectedDate}`, { headers, cache: "no-store" }),
          fetch(`/api/workouts?date=${prior}`, { headers, cache: "no-store" }),
        ]);
        const currentData = await currentResponse.json();
        const previousData = await previousResponse.json();
        if (currentData.workout) { setWorkout(currentData.workout); localStorage.setItem(`compound-workout-${selectedDate}`, JSON.stringify(currentData.workout)); }
        if (previousData.workout) { setPreviousWorkout(previousData.workout); localStorage.setItem(`compound-workout-${prior}`, JSON.stringify(previousData.workout)); }
      } catch { setMessage("Using this device's workout copy until sync is available."); }
    }
    void loadWorkouts();
  }, [selectedDate, authUserId]);
  useEffect(() => {
    if (selectedDate && loadedDate === selectedDate) localStorage.setItem(`compound-workout-${selectedDate}`, JSON.stringify(workout));
  }, [selectedDate, loadedDate, workout]);

  const filteredExercises = useMemo(() => exerciseCatalog.filter((exercise) => (muscle === "All" || exercise.muscleGroup === muscle) && exercise.name.toLowerCase().includes(search.toLowerCase())), [muscle, search]);
  const previousFor = (exerciseId: string) => previousWorkout?.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.sets.map((set) => ({ reps: set.reps, weightKg: set.weightKg }));

  function addExercise(exercise: ExerciseDefinition) {
    if (workout.exercises.some((item) => item.exerciseId === exercise.id)) {
      setMessage(`${exercise.name} is already in this workout. Edit its current sets above.`);
      return;
    }
    const prior = previousFor(exercise.id);
    setWorkout((current) => ({ ...current, exercises: [...current.exercises, { id: makeWorkoutExerciseId(), exerciseId: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup, previousSets: prior, sets: [{ id: makeSetId(), reps: "", weightKg: "" }] }] }));
    setDirty(true);
    setSearch(""); setPanelMode("view");
  }

  function updateSet(exerciseId: string, setId: string, patch: Partial<WorkoutSet>) {
    setWorkout((current) => ({ ...current, exercises: current.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) } : exercise) }));
    setDirty(true);
  }
  function addSet(exerciseId: string) { setWorkout((current) => ({ ...current, exercises: current.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, sets: [...exercise.sets, { id: makeSetId(), reps: "", weightKg: "" }] } : exercise) })); setDirty(true); }
  function deleteSet(exerciseId: string, setId: string) { setWorkout((current) => ({ ...current, exercises: current.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) } : exercise) })); setDirty(true); }
  function deleteExercise(exerciseId: string) { setWorkout((current) => ({ ...current, exercises: current.exercises.filter((exercise) => exercise.id !== exerciseId) })); setDirty(true); }

  async function saveWorkout() {
    setSaving(true); setMessage("");
    if (!authUserId) { setMessage("Saved on this device. Sign in to sync workouts."); setDirty(false); setSaving(false); return; }
    try {
      const response = await fetch("/api/workouts", { method: "POST", headers: { "Content-Type": "application/json", ...(await getSupabaseAuthHeaders()) }, body: JSON.stringify({ date: selectedDate, exercises: workout.exercises }) });
      const data = await response.json();
      if (!response.ok || !data.persisted) throw new Error(data.error ?? "Workout sync failed.");
      setMessage("Workout saved."); setDirty(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Workout sync failed. Saved on this device."); }
    finally { setSaving(false); }
  }

  return <section className="workout-card" aria-label="Exercise tracking"><div className="workout-card-header"><div><p className="section-kicker">Movement</p><h2>Workout</h2><p className="workout-meta">{workout.exercises.length ? `${workout.exercises.length} exercise${workout.exercises.length === 1 ? "" : "s"} for ${selectedDate}` : "Build today's session"}</p></div><div className="workout-actions"><button className="workout-secondary" onClick={() => { setPanelMode("add"); setPanelOpen(true); }}>+ Add exercise</button></div></div>{workout.exercises.length > 0 && <div className="workout-preview">{workout.exercises.slice(0, 3).map((exercise) => <div className="workout-preview-row" key={exercise.id}><span>{exercise.name}</span><span>{exercise.sets.filter((set) => set.reps || set.weightKg).map((set) => `${set.reps ? `${set.reps} reps` : "- reps"}${set.weightKg ? ` - ${set.weightKg}kg` : ""}`).join(", ") || "Not logged"}</span></div>)}</div>}{message && <p className="workout-message">{message}</p>}{panelOpen && <div className="workout-overlay"><section className="workout-panel"><div className="workout-panel-header"><div><p className="section-kicker">{selectedDate}</p><h2>{panelMode === "add" ? "Add exercise" : "Exercises"}</h2></div><button className="close-button" onClick={() => setPanelOpen(false)} aria-label="Close exercises">×</button></div>{panelMode === "view" && <><div className="workout-editor">{workout.exercises.length === 0 && <p className="workout-empty">No exercises added yet.</p>}{workout.exercises.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} onAddSet={addSet} onDeleteSet={deleteSet} onDelete={deleteExercise} onUpdateSet={updateSet} />)}</div>{dirty && <div className="workout-panel-actions"><button className="workout-secondary" onClick={() => { setDirty(false); setPanelOpen(false); }}>Done</button><button className="track-button compact" onClick={saveWorkout} disabled={saving}>{saving ? "Saving..." : "Save workout"}</button></div>}</>}<div className="exercise-picker"><div className="exercise-picker-heading"><h3>{panelMode === "add" ? "Choose an exercise" : "Add another exercise"}</h3><span>{filteredExercises.length} matches</span></div><input className="exercise-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" /><div className="muscle-filters">{muscleGroups.map((group) => <button className={muscle === group ? "selected" : ""} onClick={() => setMuscle(group)} key={group}>{group}</button>)}</div><div className="exercise-results">{filteredExercises.map((exercise) => <button className="exercise-result" onClick={() => workout.exercises.some((item) => item.exerciseId === exercise.id) ? setPanelMode("view") : addExercise(exercise)} key={exercise.id}><span><strong>{exercise.name}</strong><small>{exercise.muscleGroup} · {exercise.equipment}</small></span><span>{workout.exercises.some((item) => item.exerciseId === exercise.id) ? "Edit" : "+"}</span></button>)}</div></div></section></div>}</section>;
}

function ExerciseRow({ exercise, onAddSet, onDeleteSet, onDelete, onUpdateSet }: { exercise: WorkoutExercise; onAddSet: (id: string) => void; onDeleteSet: (exerciseId: string, setId: string) => void; onDelete: (id: string) => void; onUpdateSet: (exerciseId: string, setId: string, patch: Partial<WorkoutSet>) => void }) {
  return <article className="exercise-row"><div className="exercise-row-header"><div><strong>{exercise.name}</strong><small>{exercise.muscleGroup}</small></div><button onClick={() => onDelete(exercise.id)} aria-label={`Delete ${exercise.name}`}>×</button></div><div className="set-header"><span>Set</span><span>Reps</span><span>Weight kg</span><span /></div>{exercise.sets.map((set, index) => <div className="set-row" key={set.id}><span>{index + 1}</span><input value={set.reps} placeholder={exercise.previousSets?.[index]?.reps ?? "reps"} onChange={(event) => onUpdateSet(exercise.id, set.id, { reps: event.target.value })} aria-label={`${exercise.name} set ${index + 1} reps`} /><input value={set.weightKg} placeholder={exercise.previousSets?.[index]?.weightKg ?? "optional"} onChange={(event) => onUpdateSet(exercise.id, set.id, { weightKg: event.target.value })} aria-label={`${exercise.name} set ${index + 1} weight`} /><button onClick={() => onDeleteSet(exercise.id, set.id)} aria-label={`Delete set ${index + 1}`}>×</button></div>)}<button className="add-set-button" onClick={() => onAddSet(exercise.id)}>+ Add set</button></article>;
}
