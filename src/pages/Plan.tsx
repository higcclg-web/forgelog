import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, Segmented, SectionTitle, Sheet } from '../components/ui'
import {
  exerciseName,
  generatePlan,
  planTodayIndex,
  suggestExercisesForMuscles,
  useStore,
  WEEKDAYS_FULL,
  WEEKDAYS_SHORT,
  weeklyPlanStatus,
} from '../lib/store'
import { MUSCLE_GROUPS } from '../lib/exercises'
import type { MuscleGroup, PlanDay, PlanDayKind, Routine, TrainingGoal, WeeklyPlan } from '../lib/types'
import { haptic } from '../lib/util'

/** Muscles offered in the picker — 'other' is a catch-all, never a training target. */
const PICKABLE_MUSCLES = MUSCLE_GROUPS.filter((m): m is Exclude<MuscleGroup, 'other'> => m !== 'other')

const GOAL_OPTIONS: { value: TrainingGoal; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy' },
  { value: 'general', label: 'General' },
]

const DAY_COUNTS = [2, 3, 4, 5, 6] as const

/** "Chest & Shoulders" from ['chest','shoulders']; readable for any count. */
function labelForMuscles(muscles: MuscleGroup[]): string {
  const parts = muscles.map((m) => m[0].toUpperCase() + m.slice(1))
  if (parts.length === 0) return 'Training'
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`
}

export default function PlanTab() {
  const plan = useStore((s) => s.plan)
  const routines = useStore((s) => s.routines)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)

  return (
    <div className="pt-4">
      {plan ? (
        <PlanView
          plan={plan}
          onRegenerate={() => setGeneratorOpen(true)}
          onEditDay={(i) => setEditIndex(i)}
        />
      ) : (
        <EmptyState
          icon="🗓️"
          title="Plan your week"
          text="Build an optimized split around your goal and training days — then hit start each day."
          action={
            <Button
              variant="primary"
              onClick={() => {
                haptic()
                setGeneratorOpen(true)
              }}
            >
              Build my plan
            </Button>
          }
        />
      )}

      {generatorOpen && (
        <GeneratorSheet
          plan={plan}
          routines={routines}
          onClose={() => setGeneratorOpen(false)}
        />
      )}

      {plan && editIndex !== null && (
        <DayEditorSheet
          key={editIndex}
          index={editIndex}
          day={plan.days[editIndex]}
          onClose={() => setEditIndex(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Weekly view                                                        */
/* ------------------------------------------------------------------ */

function PlanView({
  plan,
  onRegenerate,
  onEditDay,
}: {
  plan: WeeklyPlan
  onRegenerate: () => void
  onEditDay: (index: number) => void
}) {
  const routines = useStore((s) => s.routines)
  const history = useStore((s) => s.history)
  const custom = useStore((s) => s.customExercises)
  const clearPlan = useStore((s) => s.clearPlan)

  const todayIdx = planTodayIndex()
  const status = useMemo(
    () => weeklyPlanStatus(plan, history, routines, custom),
    [plan, history, routines, custom],
  )

  return (
    <div className="space-y-6">
      <TodayCard day={plan.days[todayIdx]} todayIdx={todayIdx} />

      {/* Adherence strip */}
      <div>
        <div className="flex items-baseline justify-between px-1 mb-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
            This week
          </h2>
          <span className="text-[13px] tnum text-ink-dim">
            <span className="text-[17px] font-extrabold text-ink">{status.sessionsDone}</span>
            <span className="text-ink-faint"> / {status.sessionsPlanned}</span> sessions
          </span>
        </div>
        <Card className="p-3.5">
          {status.muscles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {status.muscles.map(({ muscle, trained }) => (
                <span
                  key={muscle}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-semibold capitalize ${
                    trained
                      ? 'bg-ember text-black'
                      : 'bg-surface-2 text-ink-faint border border-line'
                  }`}
                >
                  {muscle}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">No muscles targeted yet — edit a day to add some.</p>
          )}
          <p className="text-[11px] text-ink-faint mt-2.5">
            Ember chips are muscles you&apos;ve already trained this week.
          </p>
        </Card>
      </div>

      {/* 7-day list */}
      <div>
        <SectionTitle>Your split</SectionTitle>
        <div className="space-y-2">
          {plan.days.map((day, i) => (
            <DayRow
              key={i}
              day={day}
              index={i}
              isToday={i === todayIdx}
              routineName={dayRoutineName(day, routines)}
              onEdit={() => onEditDay(i)}
            />
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex gap-2">
        <Button
          variant="surface"
          className="flex-1"
          onClick={() => {
            haptic()
            onRegenerate()
          }}
        >
          Regenerate
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (window.confirm('Clear your weekly plan? Your workout history stays.')) {
              haptic()
              clearPlan()
            }
          }}
        >
          Clear plan
        </Button>
      </div>
    </div>
  )
}

function dayRoutineName(day: PlanDay, routines: Routine[]): string | null {
  if (day.kind !== 'routine' || !day.routineId) return null
  return routines.find((r) => r.id === day.routineId)?.name ?? day.label
}

/* ------------------------------------------------------------------ */
/*  Today card                                                         */
/* ------------------------------------------------------------------ */

function TodayCard({ day, todayIdx }: { day: PlanDay; todayIdx: number }) {
  const custom = useStore((s) => s.customExercises)
  const startWorkout = useStore((s) => s.startWorkout)
  const renameActive = useStore((s) => s.renameActive)
  const addExerciseToActive = useStore((s) => s.addExerciseToActive)

  const weekday = WEEKDAYS_FULL[todayIdx]

  if (day.kind === 'rest') {
    return (
      <Card className="ember-in p-5 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
          Today · {weekday}
        </p>
        <p className="text-[22px] font-extrabold mt-1">Rest day 💤</p>
        <p className="text-[14px] text-ink-dim mt-1.5">Recover hard — growth happens between sessions.</p>
      </Card>
    )
  }

  const start = () => {
    haptic()
    if (day.kind === 'routine' && day.routineId) {
      startWorkout(day.routineId)
    } else {
      startWorkout()
      renameActive(day.label)
      for (const ex of suggestExercisesForMuscles(day.muscles ?? [], 5, custom)) {
        addExerciseToActive(ex.id)
      }
    }
  }

  const detail =
    day.kind === 'muscle' && day.muscles && day.muscles.length > 0
      ? day.muscles.map((m) => m[0].toUpperCase() + m.slice(1)).join(' · ')
      : 'Saved routine'

  return (
    <Card className="ember-in p-5 border-ember/40 bg-ember/5">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-ember">
        Today · {weekday}
      </p>
      <p className="text-[26px] font-extrabold leading-tight mt-1">{day.label}</p>
      <p className="text-[14px] text-ink-dim mt-1">{detail}</p>
      <Button variant="primary" className="w-full mt-4 py-3.5 text-[16px]" onClick={start}>
        Start {day.label}
      </Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Day row                                                            */
/* ------------------------------------------------------------------ */

function DayRow({
  day,
  index,
  isToday,
  routineName,
  onEdit,
}: {
  day: PlanDay
  index: number
  isToday: boolean
  routineName: string | null
  onEdit: () => void
}) {
  const rest = day.kind === 'rest'
  const sub =
    day.kind === 'muscle' && day.muscles && day.muscles.length > 0
      ? day.muscles.map((m) => m[0].toUpperCase() + m.slice(1)).join(' · ')
      : day.kind === 'routine'
        ? routineName ?? 'Routine'
        : 'Recover'

  return (
    <button onClick={onEdit} className="w-full text-left tap">
      <Card
        className={`flex items-center gap-3 p-3.5 active:bg-surface-2/60 ${
          isToday ? 'ring-1 ring-ember/60' : ''
        }`}
      >
        <div
          className={`w-11 shrink-0 text-center text-[13px] font-bold uppercase tracking-wide ${
            isToday ? 'text-ember' : rest ? 'text-ink-faint' : 'text-ink-dim'
          }`}
        >
          {WEEKDAYS_SHORT[index]}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-[15px] truncate ${rest ? 'text-ink-dim' : 'text-ink'}`}>
            {day.label}
          </p>
          <p className="text-[13px] text-ink-faint truncate mt-0.5">{sub}</p>
        </div>
        {isToday && (
          <span className="shrink-0 rounded-full bg-ember px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black">
            Today
          </span>
        )}
      </Card>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Generator sheet                                                    */
/* ------------------------------------------------------------------ */

function GeneratorSheet({
  plan,
  routines,
  onClose,
}: {
  plan: WeeklyPlan | null
  routines: Routine[]
  onClose: () => void
}) {
  const setPlan = useStore((s) => s.setPlan)
  const [days, setDays] = useState<number>(plan?.daysPerWeek ?? 4)
  const [goal, setGoal] = useState<TrainingGoal>(plan?.goal ?? 'general')

  const preview = useMemo(() => generatePlan(days, goal, routines), [days, goal, routines])

  return (
    <Sheet open onClose={onClose} title={plan ? 'Regenerate plan' : 'Build your plan'}>
      <div className="space-y-5">
        <div>
          <span className="block text-[13px] text-ink-dim mb-2 font-medium">Days per week</span>
          <Segmented
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={DAY_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>

        <div>
          <span className="block text-[13px] text-ink-dim mb-2 font-medium">Goal</span>
          <Segmented value={goal} onChange={setGoal} options={GOAL_OPTIONS} />
        </div>

        {/* Live preview */}
        <div>
          <span className="block text-[13px] text-ink-dim mb-2 font-medium">Your week</span>
          <Card className="p-2">
            {preview.days.map((d, i) => {
              const rest = d.kind === 'rest'
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-2 py-2 border-b border-line/60 last:border-0"
                >
                  <span
                    className={`w-9 shrink-0 text-[12px] font-bold uppercase tracking-wide ${
                      rest ? 'text-ink-faint' : 'text-ink-dim'
                    }`}
                  >
                    {WEEKDAYS_SHORT[i]}
                  </span>
                  <span
                    className={`flex-1 text-[14px] truncate ${
                      rest ? 'text-ink-faint' : 'font-semibold text-ink'
                    }`}
                  >
                    {d.label}
                  </span>
                </div>
              )
            })}
          </Card>
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            setPlan(preview)
            haptic()
            onClose()
          }}
        >
          Create plan
        </Button>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Day editor sheet                                                   */
/* ------------------------------------------------------------------ */

const KIND_OPTIONS: { value: PlanDayKind; label: string }[] = [
  { value: 'rest', label: 'Rest' },
  { value: 'muscle', label: 'Muscle' },
  { value: 'routine', label: 'Routine' },
]

function DayEditorSheet({
  index,
  day,
  onClose,
}: {
  index: number
  day: PlanDay
  onClose: () => void
}) {
  const routines = useStore((s) => s.routines)
  const custom = useStore((s) => s.customExercises)
  const updatePlanDay = useStore((s) => s.updatePlanDay)

  const [kind, setKind] = useState<PlanDayKind>(day.kind)
  const [muscles, setMuscles] = useState<MuscleGroup[]>(day.muscles ?? [])
  const [routineId, setRoutineId] = useState<string | undefined>(
    day.routineId ?? routines[0]?.id,
  )

  const toggleMuscle = (m: MuscleGroup) => {
    haptic()
    setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  const canSave =
    kind === 'rest' || (kind === 'muscle' && muscles.length > 0) || (kind === 'routine' && !!routineId)

  const save = () => {
    let next: PlanDay
    if (kind === 'rest') {
      next = { kind: 'rest', label: 'Rest' }
    } else if (kind === 'muscle') {
      // Keep the picker order for a readable label.
      const ordered = PICKABLE_MUSCLES.filter((m) => muscles.includes(m))
      next = { kind: 'muscle', label: labelForMuscles(ordered), muscles: ordered }
    } else {
      const routine = routines.find((r) => r.id === routineId)
      if (!routine) return
      next = { kind: 'routine', label: routine.name, routineId: routine.id }
    }
    updatePlanDay(index, next)
    haptic()
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={WEEKDAYS_FULL[index]}>
      <div className="space-y-5">
        <Segmented value={kind} onChange={setKind} options={KIND_OPTIONS} />

        {kind === 'muscle' && (
          <div>
            <span className="block text-[13px] text-ink-dim mb-2 font-medium">Target muscles</span>
            <div className="flex flex-wrap gap-2">
              {PICKABLE_MUSCLES.map((m) => {
                const on = muscles.includes(m)
                return (
                  <button
                    key={m}
                    onClick={() => toggleMuscle(m)}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold capitalize tap transition-colors ${
                      on ? 'bg-ember text-black' : 'bg-surface-2 text-ink-dim border border-line'
                    }`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
            {muscles.length > 0 && (
              <p className="text-[13px] text-ink-faint mt-3">
                Saves as{' '}
                <span className="text-ink font-semibold">
                  {labelForMuscles(PICKABLE_MUSCLES.filter((m) => muscles.includes(m)))}
                </span>
              </p>
            )}
          </div>
        )}

        {kind === 'routine' && (
          <div>
            <span className="block text-[13px] text-ink-dim mb-2 font-medium">Pick a routine</span>
            {routines.length === 0 ? (
              <div className="rounded-xl bg-surface-2 border border-line px-3.5 py-4 text-[13px] text-ink-faint">
                No routines yet. Build one in the Routines tab, then link it here.
              </div>
            ) : (
              <div className="space-y-2">
                {routines.map((r) => {
                  const on = routineId === r.id
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRoutineId(r.id)}
                      className={`w-full flex items-center justify-between rounded-xl px-3.5 py-3 text-left tap transition-colors ${
                        on
                          ? 'bg-ember/10 border border-ember/50'
                          : 'bg-surface-2 border border-line'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[15px] truncate">{r.name}</p>
                        <p className="text-[12px] text-ink-faint truncate mt-0.5">
                          {r.exercises.length === 0
                            ? 'Empty routine'
                            : r.exercises
                                .map((e) => exerciseName(e.exerciseId, custom))
                                .join(' · ')}
                        </p>
                      </div>
                      {on && (
                        <span className="shrink-0 ml-2 text-ember">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M5 13l4 4L19 7"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {kind === 'rest' && (
          <p className="text-[13px] text-ink-faint px-1">
            A recovery day — no session scheduled. Rest is where you grow.
          </p>
        )}

        <Button variant="primary" className="w-full" disabled={!canSave} onClick={save}>
          Save {WEEKDAYS_FULL[index]}
        </Button>
      </div>
    </Sheet>
  )
}
