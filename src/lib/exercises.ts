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
  { id: "barbell-bench-press", name: "Barbell Bench Press", muscleGroup: "Chest", equipment: "Barbell" },
  { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", muscleGroup: "Chest", equipment: "Dumbbells" },
  { id: "push-up", name: "Push-up", muscleGroup: "Chest", equipment: "Bodyweight" },
  { id: "pull-up", name: "Pull-up", muscleGroup: "Back", equipment: "Bodyweight" },
  { id: "lat-pulldown", name: "Lat Pulldown", muscleGroup: "Back", equipment: "Cable" },
  { id: "barbell-row", name: "Barbell Row", muscleGroup: "Back", equipment: "Barbell" },
  { id: "seated-cable-row", name: "Seated Cable Row", muscleGroup: "Back", equipment: "Cable" },
  { id: "overhead-press", name: "Overhead Press", muscleGroup: "Shoulders", equipment: "Barbell" },
  { id: "lateral-raise", name: "Lateral Raise", muscleGroup: "Shoulders", equipment: "Dumbbells" },
  { id: "face-pull", name: "Face Pull", muscleGroup: "Shoulders", equipment: "Cable" },
  { id: "barbell-curl", name: "Barbell Curl", muscleGroup: "Arms", equipment: "Barbell" },
  { id: "triceps-pushdown", name: "Triceps Pushdown", muscleGroup: "Arms", equipment: "Cable" },
  { id: "hammer-curl", name: "Hammer Curl", muscleGroup: "Arms", equipment: "Dumbbells" },
  { id: "barbell-squat", name: "Barbell Squat", muscleGroup: "Legs", equipment: "Barbell" },
  { id: "leg-press", name: "Leg Press", muscleGroup: "Legs", equipment: "Machine" },
  { id: "romanian-deadlift", name: "Romanian Deadlift", muscleGroup: "Legs", equipment: "Barbell" },
  { id: "walking-lunge", name: "Walking Lunge", muscleGroup: "Legs", equipment: "Bodyweight" },
  { id: "plank", name: "Plank", muscleGroup: "Core", equipment: "Bodyweight" },
  { id: "hanging-knee-raise", name: "Hanging Knee Raise", muscleGroup: "Core", equipment: "Bodyweight" },
  { id: "cable-crunch", name: "Cable Crunch", muscleGroup: "Core", equipment: "Cable" },
];

export const makeSetId = () => `set-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const makeWorkoutExerciseId = () => `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}`;
