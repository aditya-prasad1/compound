create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  description text not null,
  meal jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.meal_entries enable row level security;

create policy "Users can read their own meal entries"
  on public.meal_entries for select
  using (auth.uid() = user_id);

create policy "Users can create their own meal entries"
  on public.meal_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own meal entries"
  on public.meal_entries for delete
  using (auth.uid() = user_id);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, workout_date)
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id text not null,
  exercise_name text not null,
  muscle_group text not null,
  position integer not null default 0
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number integer not null,
  reps text not null default '',
  weight_kg text not null default ''
);

alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;

create policy "Users can manage their own workouts"
  on public.workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own workout exercises"
  on public.workout_exercises for all
  using (exists (select 1 from public.workouts where workouts.id = workout_exercises.workout_id and workouts.user_id = auth.uid()))
  with check (exists (select 1 from public.workouts where workouts.id = workout_exercises.workout_id and workouts.user_id = auth.uid()));

create policy "Users can manage their own workout sets"
  on public.workout_sets for all
  using (exists (select 1 from public.workout_exercises join public.workouts on workouts.id = workout_exercises.workout_id where workout_exercises.id = workout_sets.workout_exercise_id and workouts.user_id = auth.uid()))
  with check (exists (select 1 from public.workout_exercises join public.workouts on workouts.id = workout_exercises.workout_id where workout_exercises.id = workout_sets.workout_exercise_id and workouts.user_id = auth.uid()));
