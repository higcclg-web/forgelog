export type Unit = 'lb' | 'kg'

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'other'

export interface Exercise {
  id: string
  name: string
  muscle: MuscleGroup
  custom?: boolean
}

export interface SetEntry {
  id: string
  reps: number
  weightKg: number
  done: boolean
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  sets: SetEntry[]
}

export interface Workout {
  id: string
  name: string
  startedAt: number
  endedAt?: number
  exercises: WorkoutExercise[]
}

export interface RoutineSet {
  reps: number
  weightKg: number
}

export interface RoutineExercise {
  exerciseId: string
  sets: RoutineSet[]
}

export interface Routine {
  id: string
  name: string
  exercises: RoutineExercise[]
}

export interface Food {
  id: string
  name: string
  serving: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

export interface FoodEntry {
  id: string
  name: string
  meal: MealKey
  qty: number
  // per single serving
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface BodyweightEntry {
  date: string // YYYY-MM-DD
  kg: number
}

export interface Goals {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface Settings {
  unit: Unit
  goals: Goals
  restSec: number
  onboarded: boolean
}

// ---------- Weekly training plan ----------

export type TrainingGoal = 'strength' | 'hypertrophy' | 'general'

export type PlanDayKind = 'rest' | 'routine' | 'muscle'

/** One weekday in the weekly split. */
export interface PlanDay {
  kind: PlanDayKind
  label: string // e.g. "Push", "Chest & Arms", "Leg Day", "Rest"
  routineId?: string // when kind === 'routine'
  muscles?: MuscleGroup[] // when kind === 'muscle'
}

/** A 7-slot weekly plan. days[0] = Monday … days[6] = Sunday (matches weekStart). */
export interface WeeklyPlan {
  days: PlanDay[]
  goal: TrainingGoal
  daysPerWeek: number
}
