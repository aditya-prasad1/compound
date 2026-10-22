export type MuscleGroup = "Chest" | "Back" | "Shoulders" | "Arms" | "Legs" | "Core";

export type ExerciseDefinition = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string;
};

export type WorkoutSet = {
  id: string;
  reps: string;
  weightKg: string;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  sets: WorkoutSet[];
  previousSets?: Array<{ reps: string; weightKg: string }>;
};

export const muscleGroups: Array<"All" | MuscleGroup> = ["All", "Chest", "Back", "Shoulders", "Arms", "Legs", "Core"];

export const exerciseCatalog: ExerciseDefinition[] = [
  // Chest
  { id: "dumbbell-press", name: "Dumbbell Press", muscleGroup: "Chest", equipment: "Dumbbells" },
  { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", muscleGroup: "Chest", equipment: "Dumbbells" },
  { id: "bench-press", name: "Bench Press", muscleGroup: "Chest", equipment: "Barbell" },
  { id: "incline-bench-press", name: "Incline Bench Press", muscleGroup: "Chest", equipment: "Barbell" },
  { id: "incline-chest-fly", name: "Incline Chest Fly", muscleGroup: "Chest", equipment: "Dumbbells" },
  { id: "chest-fly", name: "Chest Fly", muscleGroup: "Chest", equipment: "Dumbbells" },
  { id: "pec-deck-fly", name: "Pec Deck Fly", muscleGroup: "Chest", equipment: "Machine" },
  { id: "chest-press", name: "Chest Press", muscleGroup: "Chest", equipment: "Machine" },

  // Triceps
  { id: "triceps-pushdown", name: "Triceps Pushdown", muscleGroup: "Arms", equipment: "Cable" },
  { id: "dumbbell-kickbacks", name: "Dumbbell Kickbacks", muscleGroup: "Arms", equipment: "Dumbbells" },
  { id: "skull-crushers", name: "Skull Crushers", muscleGroup: "Arms", equipment: "Barbell" },
  { id: "triceps-overhead-extension", name: "Triceps Overhead Extension", muscleGroup: "Arms", equipment: "Dumbbells" },

  // Back
  { id: "bent-over-row", name: "Bent Over Row", muscleGroup: "Back", equipment: "Barbell" },
  { id: "lat-pulldown", name: "Lat Pulldown", muscleGroup: "Back", equipment: "Cable" },
  { id: "chest-supported-row", name: "Chest-Supported Row", muscleGroup: "Back", equipment: "Machine" },
  { id: "dumbbell-row", name: "Dumbbell Row", muscleGroup: "Back", equipment: "Dumbbells" },
  { id: "t-bar-row", name: "T-Bar Row", muscleGroup: "Back", equipment: "Machine" },

  // Biceps and Forearms
  { id: "incline-dumbbell-curl", name: "Incline Dumbbell Curl", muscleGroup: "Arms", equipment: "Dumbbells" },
  { id: "dumbbell-curl", name: "Dumbbell Curl", muscleGroup: "Arms", equipment: "Dumbbells" },
  { id: "hammer-curl", name: "Hammer Curl", muscleGroup: "Arms", equipment: "Dumbbells" },
  { id: "concentration-curl", name: "Concentration Curl", muscleGroup: "Arms", equipment: "Dumbbells" },
  { id: "reverse-curl", name: "Reverse Curl", muscleGroup: "Arms", equipment: "Barbell" },
];

export const makeSetId = () => `set-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const makeWorkoutExerciseId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}`;
