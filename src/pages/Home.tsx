import { useEffect, useState } from 'react'
import type { Tab } from '../components/TabBar'
import { Card, SectionTitle, Button } from '../components/ui'
import { Ring, MacroBar } from '../components/Ring'
import {
  useStore,
  workoutSetCount,
  workoutVolumeKg,
  activityStreak,
  weekTrainingDots,
  suggestNextRoutine,
  planTodayIndex,
  suggestExercisesForMuscles,
  WEEKDAYS_FULL,
} from '../lib/store'
import { useCountUp } from '../lib/hooks'
import {
  dateKey,
  fmtInt,
  fmtClock,
  fmtDay,
  fromKg,
  displayWeight,
  toKg,
  parseNum,
  weekStart,
  haptic,
} from '../lib/util'

export default function Home({ go }: { go: (tab: Tab) => void }) {
  const s = useStore()
  const unit = s.settings.unit
  const goals = s.settings.goals

  const today = dateKey()
  const now = new Date()

  // ---------- Today's fuel ----------
  const entries = s.nutrition[today] ?? []
  const totals = entries.reduce(
    (acc, e) => {
      acc.kcal += e.kcal * e.qty
      acc.protein += e.protein * e.qty
      acc.carbs += e.carbs * e.qty
      acc.fat += e.fat * e.qty
      return acc
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const kcalLeft = goals.kcal - totals.kcal
  const over = kcalLeft < 0
  const kcalDisplay = useCountUp(Math.abs(Math.round(kcalLeft)))
  const proteinLeft = Math.max(0, Math.round(goals.protein - totals.protein))
  const proteinHit = goals.protein > 0 && totals.protein >= goals.protein

  // ---------- Streak + week consistency ----------
  const streak = activityStreak(s.history, s.nutrition, s.bodyweight)
  const dots = weekTrainingDots(s.history)

  // ---------- Training ----------
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!s.active) return
    const tick = () => setElapsed(Math.floor((Date.now() - s.active!.startedAt) / 1000))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [s.active])

  const activeSetsDone = s.active
    ? s.active.exercises.reduce((n, e) => n + e.sets.filter((st) => st.done).length, 0)
    : 0

  const suggestion = suggestNextRoutine(s.routines, s.history)
  const trainedToday = s.history.some((w) => dateKey(new Date(w.startedAt)) === today)

  const startWorkout = (routineId?: string) => {
    haptic()
    s.startWorkout(routineId)
    go('workout')
  }

  // ---------- Today's plan ----------
  const todayIdx = planTodayIndex()
  const todayPlan = s.plan ? s.plan.days[todayIdx] : null
  const startTodayPlan = () => {
    if (!todayPlan || todayPlan.kind === 'rest') return
    haptic()
    if (todayPlan.kind === 'routine' && todayPlan.routineId) {
      s.startWorkout(todayPlan.routineId)
    } else if (todayPlan.kind === 'muscle' && todayPlan.muscles) {
      s.startWorkout()
      s.renameActive(todayPlan.label)
      for (const ex of suggestExercisesForMuscles(todayPlan.muscles, 5, s.customExercises)) {
        s.addExerciseToActive(ex.id)
      }
    }
    go('workout')
  }

  // ---------- This week ----------
  const thisWeekStart = weekStart(now).getTime()
  const lastWeekStart = weekStart(new Date(thisWeekStart - 1)).getTime()
  const weekWorkouts = s.history.filter(
    (w) => weekStart(new Date(w.startedAt)).getTime() === thisWeekStart,
  )
  const lastWeekWorkouts = s.history.filter(
    (w) => weekStart(new Date(w.startedAt)).getTime() === lastWeekStart,
  )
  const weekSets = weekWorkouts.reduce((n, w) => n + workoutSetCount(w), 0)
  const weekVolumeKg = weekWorkouts.reduce((n, w) => n + workoutVolumeKg(w), 0)
  const lastWeekVolumeKg = lastWeekWorkouts.reduce((n, w) => n + workoutVolumeKg(w), 0)
  const volumeDelta = weekVolumeKg - lastWeekVolumeKg
  // Only show a delta when there's a prior week to compare against.
  const showVolumeDelta = lastWeekVolumeKg > 0 && Math.abs(volumeDelta) > 0.5

  const workoutsUp = useCountUp(weekWorkouts.length)
  const setsUp = useCountUp(weekSets)
  const volumeUp = useCountUp(fromKg(weekVolumeKg, unit))

  // ---------- Bodyweight ----------
  const latestBw = s.bodyweight.length ? s.bodyweight[s.bodyweight.length - 1] : null
  const [bwInput, setBwInput] = useState('')
  const logBw = () => {
    const kg = toKg(parseNum(bwInput), unit)
    if (kg > 0) {
      haptic()
      s.logBodyweight(today, kg)
      setBwInput('')
    }
  }

  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div>
      {/* Header */}
      <header className="flex items-end justify-between pt-2 mb-3">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-1.5">
          <Flame />
          <span>
            Hammer<span className="text-ember">log</span>
          </span>
        </h1>
        <span className="text-[13px] text-ink-dim font-medium pb-0.5">{dateLabel}</span>
      </header>

      {/* Streak + week consistency HUD */}
      <div className="flex items-center justify-between gap-3 mb-5 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none shrink-0">🔥</span>
          {streak > 0 ? (
            <span className="text-[15px] font-bold text-ink leading-tight">
              <span className="tnum text-ember">{streak}</span>
              <span className="text-ink-dim font-semibold">-day streak</span>
            </span>
          ) : (
            <span className="text-[13px] font-semibold text-ink-dim leading-tight">
              Start your streak today
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" aria-label="This week's training">
          {dots.map((d) => (
            <span
              key={d.key}
              className={`h-2 w-2 rounded-full ${
                d.trained
                  ? 'bg-ember shadow-[0_0_5px_rgba(255,106,31,0.6)]'
                  : d.isToday
                    ? 'ring-2 ring-ember ring-inset bg-transparent'
                    : d.future
                      ? 'bg-line/60'
                      : 'bg-surface-2'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Today's fuel */}
      <SectionTitle>Today's Fuel</SectionTitle>
      <Card>
        <button
          onClick={() => go('nutrition')}
          className="w-full text-left p-4 flex items-center gap-4 active:opacity-80 transition-opacity"
        >
          <Ring value={totals.kcal} goal={goals.kcal} size={132} stroke={12}>
            <span
              className={`text-[26px] font-extrabold tnum leading-none ${
                over ? 'text-bad' : 'text-ink'
              }`}
            >
              {fmtInt(kcalDisplay)}
            </span>
            <span className="text-[11px] text-ink-faint mt-1 font-medium">
              {over ? 'over' : 'kcal left'}
            </span>
          </Ring>
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <MacroBar
              label="Protein"
              value={totals.protein}
              goal={goals.protein}
              color="var(--color-protein)"
            />
            <MacroBar
              label="Carbs"
              value={totals.carbs}
              goal={goals.carbs}
              color="var(--color-carbs)"
            />
            <MacroBar label="Fat" value={totals.fat} goal={goals.fat} color="var(--color-fat)" />
          </div>
          <Chevron />
        </button>
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[13px] font-semibold tnum">
            {proteinHit ? (
              <span className="text-ember">Protein goal hit 🔥</span>
            ) : (
              <>
                <span className="text-protein">{fmtInt(proteinLeft)}g protein</span>
                <span className="text-ink-dim font-medium"> left today</span>
              </>
            )}
          </p>
        </div>
      </Card>

      {/* Training */}
      <SectionTitle>Training</SectionTitle>
      <Card className="p-4">
        {s.active ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-ember pulse-ember" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ember" />
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ember">
                Workout in progress
              </span>
            </div>
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-lg font-bold truncate pr-3">{s.active.name}</span>
              <span className="text-xl font-extrabold tnum text-ink shrink-0">
                {fmtClock(elapsed)}
              </span>
            </div>
            <div className="text-[13px] text-ink-dim mb-4 tnum">
              {activeSetsDone} {activeSetsDone === 1 ? 'set' : 'sets'} done
            </div>
            <Button className="w-full" onClick={() => go('workout')}>
              Resume Workout
            </Button>
          </>
        ) : todayPlan && todayPlan.kind !== 'rest' ? (
          <>
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ember mb-0.5">
                Today · {WEEKDAYS_FULL[todayIdx]}
              </p>
              <p className="text-lg font-bold text-ink truncate">{todayPlan.label}</p>
              <p className="text-[13px] text-ink-dim mt-0.5">
                {trainedToday
                  ? 'Trained today 💪 — nice work'
                  : todayPlan.kind === 'muscle' && todayPlan.muscles
                    ? todayPlan.muscles.map((m) => m[0].toUpperCase() + m.slice(1)).join(' · ')
                    : 'On your plan for today'}
              </p>
            </div>
            <Button className="w-full" onClick={startTodayPlan}>
              Start {todayPlan.label}
            </Button>
          </>
        ) : todayPlan && todayPlan.kind === 'rest' ? (
          <div className="text-center py-1">
            <p className="text-[15px] font-bold text-ink">Rest day 💤</p>
            <p className="text-[13px] text-ink-dim mt-1 mb-3">
              Recovery is on the plan today — you can still train if you want.
            </p>
            <Button variant="surface" className="w-full" onClick={() => startWorkout()}>
              Start a Workout
            </Button>
          </div>
        ) : suggestion ? (
          <>
            <div className="mb-3">
              {trainedToday ? (
                <p className="text-[15px] font-bold text-ink">Trained today 💪</p>
              ) : (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-0.5">
                  Next up
                </p>
              )}
              <p className="text-lg font-bold text-ink truncate">{suggestion.routine.name}</p>
              <p className="text-[13px] text-ink-dim mt-0.5">
                {trainedToday
                  ? 'Next session tomorrow'
                  : lastTrainedLabel(suggestion.lastTs)}
              </p>
            </div>
            <Button className="w-full" onClick={() => startWorkout(suggestion.routine.id)}>
              Start {suggestion.routine.name}
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={() => startWorkout()}>
            Start Workout
          </Button>
        )}
        {!s.active && s.routines.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {s.routines
              .filter((r) => !suggestion || r.id !== suggestion.routine.id)
              .slice(0, 3)
              .map((r) => (
                <button
                  key={r.id}
                  onClick={() => startWorkout(r.id)}
                  className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-ink-dim active:bg-line tap"
                >
                  {r.name}
                </button>
              ))}
          </div>
        )}
      </Card>

      {!s.active && !s.plan && (
        <button
          onClick={() => go('workout')}
          className="w-full text-center text-[13px] text-ember font-semibold mt-2.5 py-1 tap"
        >
          📅 Set up your weekly plan
        </button>
      )}

      {/* This week */}
      <SectionTitle>This Week</SectionTitle>
      <Card className="flex divide-x divide-line/60">
        <WeekTile label="Workouts" value={fmtInt(workoutsUp)} />
        <WeekTile label="Sets" value={fmtInt(setsUp)} />
        <WeekTile
          label="Volume"
          value={fmtInt(volumeUp)}
          suffix={unit}
          delta={showVolumeDelta ? volumeDelta : undefined}
        />
      </Card>

      {/* Bodyweight */}
      <SectionTitle>Bodyweight</SectionTitle>
      <Card className="p-4">
        {latestBw ? (
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-extrabold tnum">{displayWeight(latestBw.kg, unit)}</span>
            <span className="text-lg font-semibold text-ink-dim">{unit}</span>
            <span className="text-[13px] text-ink-faint ml-auto">{fmtDay(latestBw.date)}</span>
          </div>
        ) : (
          <p className="text-[14px] text-ink-dim mb-3">Log your first weigh-in to track trends.</p>
        )}
        <div className="flex items-stretch gap-2">
          <div className="flex-1 flex items-center rounded-xl bg-surface-2 border border-line focus-within:border-ember/70 transition-colors">
            <input
              className="w-full bg-transparent px-3.5 py-3 outline-none text-ink placeholder:text-ink-faint tnum"
              inputMode="decimal"
              value={bwInput}
              placeholder={latestBw ? displayWeight(latestBw.kg, unit) : unit}
              onChange={(e) => setBwInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') logBw()
              }}
            />
            <span className="pr-3.5 text-ink-faint text-[14px] shrink-0">{unit}</span>
          </div>
          <Button variant="surface" onClick={logBw} disabled={parseNum(bwInput) <= 0}>
            Log
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** "last trained {N}d ago" or "not yet trained" for the prescriptive CTA caption. */
function lastTrainedLabel(lastTs: number | null): string {
  if (lastTs === null) return 'Not yet trained'
  const days = Math.floor((Date.now() - lastTs) / 86_400_000)
  if (days <= 0) return 'Last trained today'
  if (days === 1) return 'Last trained yesterday'
  return `Last trained ${days}d ago`
}

function WeekTile({
  label,
  value,
  suffix,
  delta,
}: {
  label: string
  value: string
  suffix?: string
  delta?: number
}) {
  const up = (delta ?? 0) > 0
  return (
    <div className="flex-1 py-4 px-2 text-center">
      <div className="text-xl font-extrabold tnum">
        {value}
        {suffix && <span className="text-[13px] font-semibold text-ink-dim ml-0.5">{suffix}</span>}
      </div>
      <div className="flex items-center justify-center gap-1 mt-1">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint font-semibold">
          {label}
        </span>
        {delta !== undefined && (
          <span
            className={`text-[10px] font-bold tnum leading-none ${up ? 'text-good' : 'text-bad'}`}
          >
            {up ? '▲' : '▼'}
          </span>
        )}
      </div>
    </div>
  )
}

function Flame() {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true">
      <path
        d="M10 1.5c.6 3.4-1.8 4.7-3.6 6.6C4.4 10.2 3 12.3 3 14.8 3 19 6.1 22 10 22s7-3 7-7.2c0-2.3-1-4.2-2.4-5.8-.5 1.3-1.4 2-2.4 2.4.7-2.3.3-6.3-2.2-9.9Z"
        fill="var(--color-ember)"
      />
      <path
        d="M10 22c-2.2 0-3.8-1.6-3.8-3.7 0-1.9 1.3-3.1 2.3-4.2.4 1 1 1.4 1.7 1.7-.3-1.6.4-2.8 1-3.6 1 .9 2.4 2.4 2.4 4.5C13.6 20.2 12.1 22 10 22Z"
        fill="var(--color-ember-hi)"
      />
    </svg>
  )
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-ink-faint shrink-0">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
