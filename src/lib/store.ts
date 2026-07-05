import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  BodyweightEntry,
  Exercise,
  Food,
  FoodEntry,
  MealKey,
  MuscleGroup,
  PlanDay,
  Routine,
  SetEntry,
  Settings,
  TrainingGoal,
  WeeklyPlan,
  Workout,
  WorkoutExercise,
} from './types'
import { EXERCISE_LIBRARY } from './exercises'
import { addDays, dateKey, epley1RM, uid, weekStart } from './util'

export interface ForgeState {
  settings: Settings
  customExercises: Exercise[]
  routines: Routine[]
  history: Workout[]
  active: Workout | null
  foods: Food[]
  nutrition: Record<string, FoodEntry[]>
  bodyweight: BodyweightEntry[]
  plan: WeeklyPlan | null
  rest: { endsAt: number | null; total: number }

  setSettings: (patch: Partial<Settings>) => void
  addCustomExercise: (name: string, muscle: Exercise['muscle']) => Exercise
  saveRoutine: (routine: Routine) => void
  deleteRoutine: (id: string) => void

  startWorkout: (routineId?: string) => void
  renameActive: (name: string) => void
  addExerciseToActive: (exerciseId: string) => void
  removeExerciseFromActive: (weId: string) => void
  addSet: (weId: string) => void
  updateSet: (weId: string, setId: string, patch: Partial<SetEntry>) => void
  removeSet: (weId: string, setId: string) => void
  toggleSetDone: (weId: string, setId: string) => void
  finishWorkout: () => Workout | null
  discardWorkout: () => void
  deleteWorkout: (id: string) => void

  startRest: (seconds: number) => void
  clearRest: () => void

  addFood: (food: Omit<Food, 'id'>) => Food
  updateFood: (id: string, patch: Partial<Omit<Food, 'id'>>) => void
  deleteFood: (id: string) => void
  logFood: (date: string, entry: Omit<FoodEntry, 'id'>) => void
  updateFoodEntry: (date: string, id: string, patch: Partial<FoodEntry>) => void
  deleteFoodEntry: (date: string, id: string) => void
  copyMeal: (fromDate: string, toDate: string, meal: MealKey) => number
  copyDay: (fromDate: string, toDate: string) => number

  logBodyweight: (date: string, kg: number) => void
  deleteBodyweight: (date: string) => void

  setPlan: (plan: WeeklyPlan | null) => void
  updatePlanDay: (index: number, day: PlanDay) => void
  clearPlan: () => void

  importData: (data: unknown) => string | null
  resetAll: () => void
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'lb',
  goals: { kcal: 2200, protein: 150, carbs: 250, fat: 70 },
  restSec: 90,
  onboarded: false,
}

const emptyData = {
  settings: DEFAULT_SETTINGS,
  customExercises: [] as Exercise[],
  routines: [] as Routine[],
  history: [] as Workout[],
  active: null as Workout | null,
  foods: [] as Food[],
  nutrition: {} as Record<string, FoodEntry[]>,
  bodyweight: [] as BodyweightEntry[],
  plan: null as WeeklyPlan | null,
  rest: { endsAt: null as number | null, total: 90 },
}

const PERSIST_KEYS = [
  'settings',
  'customExercises',
  'routines',
  'history',
  'active',
  'foods',
  'nutrition',
  'bodyweight',
  'plan',
] as const

export const useStore = create<ForgeState>()(
  persist(
    (set, get) => ({
      ...structuredClone(emptyData),

      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      addCustomExercise: (name, muscle) => {
        const ex: Exercise = { id: 'custom-' + uid(), name: name.trim(), muscle, custom: true }
        set((s) => ({ customExercises: [...s.customExercises, ex] }))
        return ex
      },

      saveRoutine: (routine) =>
        set((s) => {
          const i = s.routines.findIndex((r) => r.id === routine.id)
          const routines = [...s.routines]
          if (i >= 0) routines[i] = routine
          else routines.push(routine)
          return { routines }
        }),

      deleteRoutine: (id) =>
        set((s) => ({ routines: s.routines.filter((r) => r.id !== id) })),

      startWorkout: (routineId) => {
        if (get().active) return
        const routine = routineId
          ? get().routines.find((r) => r.id === routineId)
          : undefined
        const exercises: WorkoutExercise[] = routine
          ? routine.exercises.map((re) => ({
              id: uid(),
              exerciseId: re.exerciseId,
              sets: re.sets.map((st) => ({
                id: uid(),
                reps: st.reps,
                weightKg: st.weightKg,
                done: false,
              })),
            }))
          : []
        set({
          active: {
            id: uid(),
            name: routine?.name ?? defaultWorkoutName(),
            startedAt: Date.now(),
            exercises,
          },
        })
      },

      renameActive: (name) =>
        set((s) => (s.active ? { active: { ...s.active, name } } : {})),

      addExerciseToActive: (exerciseId) =>
        set((s) => {
          if (!s.active) return {}
          const we: WorkoutExercise = {
            id: uid(),
            exerciseId,
            sets: [{ id: uid(), reps: 0, weightKg: 0, done: false }],
          }
          return { active: { ...s.active, exercises: [...s.active.exercises, we] } }
        }),

      removeExerciseFromActive: (weId) =>
        set((s) =>
          s.active
            ? { active: { ...s.active, exercises: s.active.exercises.filter((e) => e.id !== weId) } }
            : {},
        ),

      addSet: (weId) =>
        set((s) => {
          if (!s.active) return {}
          return {
            active: {
              ...s.active,
              exercises: s.active.exercises.map((e) => {
                if (e.id !== weId) return e
                const last = e.sets[e.sets.length - 1]
                return {
                  ...e,
                  sets: [
                    ...e.sets,
                    {
                      id: uid(),
                      reps: last?.reps ?? 0,
                      weightKg: last?.weightKg ?? 0,
                      done: false,
                    },
                  ],
                }
              }),
            },
          }
        }),

      updateSet: (weId, setId, patch) =>
        set((s) => {
          if (!s.active) return {}
          return {
            active: {
              ...s.active,
              exercises: s.active.exercises.map((e) =>
                e.id === weId
                  ? { ...e, sets: e.sets.map((st) => (st.id === setId ? { ...st, ...patch } : st)) }
                  : e,
              ),
            },
          }
        }),

      removeSet: (weId, setId) =>
        set((s) => {
          if (!s.active) return {}
          return {
            active: {
              ...s.active,
              exercises: s.active.exercises.map((e) =>
                e.id === weId ? { ...e, sets: e.sets.filter((st) => st.id !== setId) } : e,
              ),
            },
          }
        }),

      toggleSetDone: (weId, setId) => {
        const s = get()
        if (!s.active) return
        const we = s.active.exercises.find((e) => e.id === weId)
        const st = we?.sets.find((x) => x.id === setId)
        if (!st) return
        const nowDone = !st.done
        s.updateSet(weId, setId, { done: nowDone })
        if (nowDone && s.settings.restSec > 0) {
          s.startRest(s.settings.restSec)
          if ('vibrate' in navigator) navigator.vibrate?.(20)
        }
      },

      finishWorkout: () => {
        const s = get()
        if (!s.active) return null
        // keep only sets with actual work logged
        const exercises = s.active.exercises
          .map((e) => ({ ...e, sets: e.sets.filter((st) => st.reps > 0 || st.weightKg > 0) }))
          .filter((e) => e.sets.length > 0)
        const finished: Workout = { ...s.active, exercises, endedAt: Date.now() }
        set({
          history: [finished, ...s.history],
          active: null,
          rest: { endsAt: null, total: s.settings.restSec },
        })
        return finished
      },

      discardWorkout: () =>
        set((s) => ({ active: null, rest: { endsAt: null, total: s.settings.restSec } })),

      deleteWorkout: (id) =>
        set((s) => ({ history: s.history.filter((w) => w.id !== id) })),

      startRest: (seconds) =>
        set({ rest: { endsAt: Date.now() + seconds * 1000, total: seconds } }),

      clearRest: () => set((s) => ({ rest: { endsAt: null, total: s.rest.total } })),

      addFood: (food) => {
        const f: Food = { ...food, id: uid() }
        set((s) => ({ foods: [f, ...s.foods] }))
        return f
      },

      updateFood: (id, patch) =>
        set((s) => ({ foods: s.foods.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),

      deleteFood: (id) => set((s) => ({ foods: s.foods.filter((f) => f.id !== id) })),

      logFood: (date, entry) =>
        set((s) => ({
          nutrition: {
            ...s.nutrition,
            [date]: [...(s.nutrition[date] ?? []), { ...entry, id: uid() }],
          },
        })),

      copyMeal: (fromDate, toDate, meal) => {
        const src = (get().nutrition[fromDate] ?? []).filter((e) => e.meal === meal)
        if (src.length === 0) return 0
        set((s) => ({
          nutrition: {
            ...s.nutrition,
            [toDate]: [
              ...(s.nutrition[toDate] ?? []),
              ...src.map((e) => ({ ...e, id: uid() })),
            ],
          },
        }))
        return src.length
      },

      copyDay: (fromDate, toDate) => {
        const src = get().nutrition[fromDate] ?? []
        if (src.length === 0) return 0
        set((s) => ({
          nutrition: {
            ...s.nutrition,
            [toDate]: [
              ...(s.nutrition[toDate] ?? []),
              ...src.map((e) => ({ ...e, id: uid() })),
            ],
          },
        }))
        return src.length
      },

      updateFoodEntry: (date, id, patch) =>
        set((s) => ({
          nutrition: {
            ...s.nutrition,
            [date]: (s.nutrition[date] ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
          },
        })),

      deleteFoodEntry: (date, id) =>
        set((s) => ({
          nutrition: {
            ...s.nutrition,
            [date]: (s.nutrition[date] ?? []).filter((e) => e.id !== id),
          },
        })),

      logBodyweight: (date, kg) =>
        set((s) => {
          const rest = s.bodyweight.filter((b) => b.date !== date)
          return { bodyweight: [...rest, { date, kg }].sort((a, b) => a.date.localeCompare(b.date)) }
        }),

      deleteBodyweight: (date) =>
        set((s) => ({ bodyweight: s.bodyweight.filter((b) => b.date !== date) })),

      setPlan: (plan) => set({ plan }),

      updatePlanDay: (index, day) =>
        set((s) => {
          if (!s.plan || index < 0 || index > 6) return {}
          const days = [...s.plan.days]
          days[index] = day
          const daysPerWeek = days.filter((d) => d.kind !== 'rest').length
          return { plan: { ...s.plan, days, daysPerWeek } }
        }),

      clearPlan: () => set({ plan: null }),

      importData: (data) => {
        if (typeof data !== 'object' || data === null) return 'Invalid file.'
        const d = data as Record<string, unknown>
        if ((d.app !== 'hammerlog' && d.app !== 'forgelog') || typeof d.data !== 'object' || d.data === null)
          return 'Not a Hammerlog export file.'
        const payload = d.data as Record<string, unknown>
        const next: Record<string, unknown> = {}
        for (const key of PERSIST_KEYS) {
          if (key in payload) next[key] = payload[key]
        }
        if (!('settings' in next)) return 'Export file is missing settings.'
        set({ ...structuredClone(emptyData), ...(next as Partial<ForgeState>) })
        return null
      },

      resetAll: () => set(structuredClone(emptyData)),
    }),
    {
      name: 'forgelog-data',
      version: 1,
      partialize: (s) => Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]])),
    },
  ),
)

function defaultWorkoutName(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Morning Workout'
  if (h < 17) return 'Afternoon Workout'
  return 'Evening Workout'
}

// ---------- Derived helpers ----------

export function useAllExercises(): Exercise[] {
  const custom = useStore((s) => s.customExercises)
  return [...EXERCISE_LIBRARY, ...custom].sort((a, b) => a.name.localeCompare(b.name))
}

export function exerciseName(id: string, custom: Exercise[]): string {
  return (
    EXERCISE_LIBRARY.find((e) => e.id === id)?.name ??
    custom.find((e) => e.id === id)?.name ??
    'Unknown exercise'
  )
}

export function workoutVolumeKg(w: Workout): number {
  return w.exercises.reduce(
    (sum, e) => sum + e.sets.reduce((s2, st) => s2 + st.reps * st.weightKg, 0),
    0,
  )
}

export function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((sum, e) => sum + e.sets.length, 0)
}

/** Most recent logged sets for an exercise, from history. */
export function lastPerformance(history: Workout[], exerciseId: string): SetEntry[] | null {
  for (const w of history) {
    for (const e of w.exercises) {
      if (e.exerciseId === exerciseId && e.sets.length > 0) return e.sets
    }
  }
  return null
}

export function exportPayload(): string {
  const s = useStore.getState()
  const data = Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]]))
  return JSON.stringify(
    { app: 'hammerlog', version: 1, exportedAt: new Date().toISOString(), data },
    null,
    2,
  )
}

// ---------- Personal records ----------

export interface PR {
  exerciseId: string
  name: string
  e1rmKg: number
  prevKg: number | null
}

/** Best estimated 1RM for an exercise across history (optionally excluding one workout). */
export function bestE1RMInHistory(
  history: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string,
): number | null {
  let best: number | null = null
  for (const w of history) {
    if (w.id === excludeWorkoutId) continue
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue
      for (const st of e.sets) {
        if (st.reps <= 0 || st.weightKg <= 0) continue
        const v = epley1RM(st.weightKg, st.reps)
        if (best === null || v > best) best = v
      }
    }
  }
  return best
}

/** Exercises in this workout whose best e1RM beats everything in prior history. */
export function computePRs(workout: Workout, history: Workout[], custom: Exercise[]): PR[] {
  const bestByEx = new Map<string, number>()
  for (const e of workout.exercises) {
    for (const st of e.sets) {
      if (st.reps <= 0 || st.weightKg <= 0) continue
      const v = epley1RM(st.weightKg, st.reps)
      bestByEx.set(e.exerciseId, Math.max(bestByEx.get(e.exerciseId) ?? 0, v))
    }
  }
  const prs: PR[] = []
  for (const [exerciseId, best] of bestByEx) {
    const prev = bestE1RMInHistory(history, exerciseId, workout.id)
    if (best > (prev ?? 0) + 0.01) {
      prs.push({ exerciseId, name: exerciseName(exerciseId, custom), e1rmKg: best, prevKg: prev })
    }
  }
  return prs.sort((a, b) => b.e1rmKg - a.e1rmKg)
}

// ---------- Streak / consistency ----------

/** Consecutive days ending today (or yesterday, if today is still empty) with any activity. */
export function activityStreak(
  history: Workout[],
  nutrition: Record<string, FoodEntry[]>,
  bodyweight: BodyweightEntry[],
): number {
  const active = new Set<string>()
  for (const w of history) active.add(dateKey(new Date(w.startedAt)))
  for (const [k, entries] of Object.entries(nutrition)) if ((entries?.length ?? 0) > 0) active.add(k)
  for (const b of bodyweight) active.add(b.date)

  let cursor = dateKey()
  if (!active.has(cursor)) cursor = addDays(cursor, -1) // today still open — don't break the chain yet
  let streak = 0
  while (active.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export interface WeekDot {
  key: string
  trained: boolean
  isToday: boolean
  future: boolean
}

/** Mon–Sun dots for the current week, marking days a workout was done. */
export function weekTrainingDots(history: Workout[]): WeekDot[] {
  const start = weekStart(new Date())
  const today = dateKey()
  const trained = new Set(history.map((w) => dateKey(new Date(w.startedAt))))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const key = dateKey(d)
    return { key, trained: trained.has(key), isToday: key === today, future: key > today }
  })
}

// ---------- Suggestions & recency ----------

/** The routine least-recently trained (never-trained first), for a "Next up" prompt. */
export function suggestNextRoutine(
  routines: Routine[],
  history: Workout[],
): { routine: Routine; lastTs: number | null } | null {
  if (routines.length === 0) return null
  const lastByName = new Map<string, number>()
  for (const w of history) {
    lastByName.set(w.name, Math.max(lastByName.get(w.name) ?? 0, w.startedAt))
  }
  let best: { routine: Routine; lastTs: number | null } | null = null
  for (const r of routines) {
    const lastTs = lastByName.get(r.name) ?? null
    if (!best) {
      best = { routine: r, lastTs }
      continue
    }
    if (lastTs === null && best.lastTs !== null) best = { routine: r, lastTs }
    else if (lastTs !== null && best.lastTs !== null && lastTs < best.lastTs)
      best = { routine: r, lastTs }
  }
  return best
}

/** Saved foods ordered by most-recent logged use (unused foods keep their order, last). */
export function sortFoodsByRecentUse(
  foods: Food[],
  nutrition: Record<string, FoodEntry[]>,
): Food[] {
  const lastUsed = new Map<string, string>()
  for (const [date, entries] of Object.entries(nutrition)) {
    for (const e of entries) {
      const prev = lastUsed.get(e.name)
      if (!prev || date > prev) lastUsed.set(e.name, date)
    }
  }
  return [...foods].sort((a, b) => (lastUsed.get(b.name) ?? '').localeCompare(lastUsed.get(a.name) ?? ''))
}

/** Latest logged day strictly before `beforeDate` (for "copy yesterday"). */
export function mostRecentLoggedDay(
  nutrition: Record<string, FoodEntry[]>,
  beforeDate: string,
): string | null {
  let best: string | null = null
  for (const [date, entries] of Object.entries(nutrition)) {
    if (date >= beforeDate || (entries?.length ?? 0) === 0) continue
    if (best === null || date > best) best = date
  }
  return best
}

// ---------- Weekly training plan ----------

export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAYS_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

type Session = { label: string; muscles: MuscleGroup[] }

const S: Record<string, Session> = {
  full: { label: 'Full Body', muscles: ['chest', 'back', 'legs', 'shoulders', 'arms'] },
  upper: { label: 'Upper', muscles: ['chest', 'back', 'shoulders', 'arms'] },
  lower: { label: 'Lower', muscles: ['legs', 'core'] },
  push: { label: 'Push', muscles: ['chest', 'shoulders', 'arms'] },
  pull: { label: 'Pull', muscles: ['back', 'arms'] },
  legs: { label: 'Legs', muscles: ['legs', 'core'] },
  chest: { label: 'Chest', muscles: ['chest'] },
  back: { label: 'Back', muscles: ['back'] },
  shoulders: { label: 'Shoulders', muscles: ['shoulders', 'arms'] },
  arms: { label: 'Arms', muscles: ['arms'] },
}

/** Which weekday indexes (Mon=0) are training days, spaced for recovery. */
const PLACEMENT: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
}

/** The ordered sessions for a given volume + goal. */
function splitFor(daysPerWeek: number, goal: TrainingGoal): Session[] {
  const hyper = goal === 'hypertrophy'
  switch (daysPerWeek) {
    case 2:
      return [S.full, S.full]
    case 3:
      return hyper ? [S.push, S.pull, S.legs] : [S.full, S.full, S.full]
    case 4:
      return [S.upper, S.lower, S.upper, S.lower]
    case 5:
      return hyper
        ? [S.chest, S.back, S.legs, S.shoulders, S.arms]
        : [S.upper, S.lower, S.push, S.pull, S.legs]
    case 6:
      return [S.push, S.pull, S.legs, S.push, S.pull, S.legs]
    default:
      return [S.full, S.full, S.full]
  }
}

/** Today's weekday index with Monday = 0. */
export function planTodayIndex(): number {
  return (new Date().getDay() + 6) % 7
}

export function muscleOfExercise(exerciseId: string, custom: Exercise[]): MuscleGroup {
  return (
    EXERCISE_LIBRARY.find((e) => e.id === exerciseId)?.muscle ??
    custom.find((e) => e.id === exerciseId)?.muscle ??
    'other'
  )
}

/**
 * Build an optimized weekly split from a training frequency + goal. Where the
 * user already has a matching routine, the day links to it; otherwise the day
 * is a muscle-focus that can suggest exercises on the fly.
 */
export function generatePlan(
  daysPerWeek: number,
  goal: TrainingGoal,
  routines: Routine[],
): WeeklyPlan {
  const n = Math.max(2, Math.min(6, Math.round(daysPerWeek)))
  const sessions = splitFor(n, goal)
  const slots = PLACEMENT[n] ?? PLACEMENT[3]

  const days: PlanDay[] = Array.from({ length: 7 }, () => ({ kind: 'rest', label: 'Rest' }) as PlanDay)

  const matchRoutine = (label: string): Routine | undefined => {
    const sl = label.toLowerCase()
    return routines.find((r) => {
      const rn = r.name.toLowerCase()
      return rn.includes(sl) || sl.includes(rn.replace(/day/g, '').trim())
    })
  }

  sessions.forEach((session, i) => {
    const slot = slots[i]
    if (slot === undefined) return
    const routine = matchRoutine(session.label)
    days[slot] = routine
      ? { kind: 'routine', label: routine.name, routineId: routine.id }
      : { kind: 'muscle', label: session.label, muscles: session.muscles }
  })

  return { days, goal, daysPerWeek: n }
}

export interface PlanStatus {
  sessionsPlanned: number
  sessionsDone: number
  muscles: { muscle: MuscleGroup; trained: boolean }[]
}

/** This week's plan adherence: sessions done vs planned, and per-muscle coverage. */
export function weeklyPlanStatus(
  plan: WeeklyPlan,
  history: Workout[],
  routines: Routine[],
  custom: Exercise[],
): PlanStatus {
  const start = weekStart(new Date())
  const weekKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return dateKey(d)
  })
  const inWeek = (ts: number) => {
    const k = dateKey(new Date(ts))
    return k >= weekKeys[0] && k <= weekKeys[6]
  }
  const trainedDays = new Set(
    history.filter((w) => inWeek(w.startedAt)).map((w) => dateKey(new Date(w.startedAt))),
  )
  const todayIdx = planTodayIndex()

  let sessionsPlanned = 0
  let sessionsDone = 0
  const planned = new Set<MuscleGroup>()
  plan.days.forEach((d, i) => {
    if (d.kind === 'rest') return
    sessionsPlanned++
    if (i <= todayIdx && trainedDays.has(weekKeys[i])) sessionsDone++
    if (d.kind === 'muscle') d.muscles?.forEach((m) => planned.add(m))
    else if (d.kind === 'routine') {
      routines
        .find((r) => r.id === d.routineId)
        ?.exercises.forEach((e) => planned.add(muscleOfExercise(e.exerciseId, custom)))
    }
  })

  const trainedMuscles = new Set<MuscleGroup>()
  history.forEach((w) => {
    if (!inWeek(w.startedAt)) return
    w.exercises.forEach((e) => trainedMuscles.add(muscleOfExercise(e.exerciseId, custom)))
  })

  const muscles = [...planned]
    .sort()
    .map((m) => ({ muscle: m, trained: trainedMuscles.has(m) }))

  return { sessionsPlanned, sessionsDone, muscles }
}

/** Top exercises across the target muscles (compounds first), round-robin. */
export function suggestExercisesForMuscles(
  muscles: MuscleGroup[],
  count: number,
  custom: Exercise[],
): Exercise[] {
  const pool = [...EXERCISE_LIBRARY, ...custom]
  const byMuscle = muscles.map((m) => pool.filter((e) => e.muscle === m))
  const out: Exercise[] = []
  let i = 0
  while (out.length < count && byMuscle.some((list) => list.length > 0) && i < 200) {
    const list = byMuscle[i % byMuscle.length]
    const ex = list.shift()
    if (ex && !out.includes(ex)) out.push(ex)
    i++
  }
  return out
}
