import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  FullScreen,
  Segmented,
  Sheet,
} from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import PlanTab from './Plan'
import {
  bestE1RMInHistory,
  computePRs,
  exerciseName,
  lastPerformance,
  useStore,
  workoutSetCount,
  workoutVolumeKg,
} from '../lib/store'
import type {
  Exercise,
  Routine,
  RoutineExercise,
  Unit,
  Workout,
  WorkoutExercise,
} from '../lib/types'
import {
  dateKey,
  displayWeight,
  epley1RM,
  fmtDay,
  fmtDuration,
  fmtInt,
  fromKg,
  haptic,
  parseNum,
  toKg,
  uid,
} from '../lib/util'

type SubTab = 'plan' | 'train' | 'routines' | 'history'

/** Built-in starter routines, shown when the user has none of their own. */
const STARTER_TEMPLATES: { name: string; exerciseIds: string[] }[] = [
  {
    name: 'Full Body',
    exerciseIds: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'leg-curl'],
  },
  {
    name: 'Upper / Lower',
    exerciseIds: ['bench-press', 'barbell-row', 'overhead-press', 'lat-pulldown', 'db-curl'],
  },
  {
    name: 'Push Pull Legs',
    exerciseIds: ['bench-press', 'incline-bench-press', 'overhead-press', 'tricep-pushdown'],
  },
]

/** m:ss, or h:mm:ss when at least an hour. */
function fmtElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function WorkoutPage() {
  const active = useStore((s) => s.active)
  if (active) return <LiveSession />
  return <BrowseView />
}

/* ------------------------------------------------------------------ */
/*  Browse (Train / Routines / History)                                */
/* ------------------------------------------------------------------ */

function BrowseView() {
  const [tab, setTab] = useState<SubTab>('plan')
  return (
    <div className="pt-4">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'plan', label: 'Plan' },
          { value: 'train', label: 'Start' },
          { value: 'routines', label: 'Routines' },
          { value: 'history', label: 'History' },
        ]}
      />
      <div className="mt-5">
        {tab === 'plan' && <PlanTab />}
        {tab === 'train' && <TrainTab />}
        {tab === 'routines' && <RoutinesTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  )
}

function TrainTab() {
  const routines = useStore((s) => s.routines)
  const custom = useStore((s) => s.customExercises)
  const startWorkout = useStore((s) => s.startWorkout)
  const addExerciseToActive = useStore((s) => s.addExerciseToActive)
  const saveRoutine = useStore((s) => s.saveRoutine)

  function startTemplate(tpl: { name: string; exerciseIds: string[] }) {
    haptic()
    startWorkout()
    for (const id of tpl.exerciseIds) addExerciseToActive(id)
    // startWorkout picks a time-of-day name; give the started template its own.
    useStore.getState().renameActive(tpl.name)
  }

  function saveTemplate(tpl: { name: string; exerciseIds: string[] }) {
    haptic()
    saveRoutine({
      id: uid(),
      name: tpl.name,
      exercises: tpl.exerciseIds.map((exerciseId) => ({
        exerciseId,
        sets: [{ reps: 8, weightKg: 0 }],
      })),
    })
  }

  return (
    <div className="space-y-6">
      <Button
        variant="primary"
        className="w-full py-4 text-[17px]"
        onClick={() => {
          haptic()
          startWorkout()
        }}
      >
        Start Empty Workout
      </Button>

      {routines.length === 0 ? (
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint px-1 mb-2">
            Starter Routines
          </h2>
          <div className="space-y-2">
            {STARTER_TEMPLATES.map((tpl) => (
              <Card key={tpl.name} className="p-3.5">
                <p className="font-semibold text-[15px] truncate">{tpl.name}</p>
                <p className="text-[13px] text-ink-faint mt-0.5 truncate">
                  {tpl.exerciseIds
                    .map((id) => exerciseName(id, custom))
                    .join(' · ')}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="primary"
                    className="flex-1 py-2.5"
                    onClick={() => startTemplate(tpl)}
                  >
                    Start
                  </Button>
                  <Button
                    variant="surface"
                    className="shrink-0 py-2.5"
                    onClick={() => saveTemplate(tpl)}
                  >
                    Save as routine
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint px-1 mb-2">
            Quick Start
          </h2>
          <div className="space-y-2">
            {routines.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[15px] truncate">{r.name}</p>
                  <p className="text-[13px] text-ink-faint">
                    {r.exercises.length}{' '}
                    {r.exercises.length === 1 ? 'exercise' : 'exercises'} ·{' '}
                    {routineSetTotal(r)} sets
                  </p>
                </div>
                <Button
                  variant="surface"
                  className="shrink-0 py-2.5"
                  onClick={() => {
                    haptic()
                    startWorkout(r.id)
                  }}
                >
                  Start
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function routineSetTotal(r: Routine): number {
  return r.exercises.reduce((sum, e) => sum + e.sets.length, 0)
}

/* ------------------------------------------------------------------ */
/*  Routines list + editor                                             */
/* ------------------------------------------------------------------ */

function RoutinesTab() {
  const routines = useStore((s) => s.routines)
  const [editing, setEditing] = useState<Routine | null>(null)

  function newDraft() {
    setEditing({ id: uid(), name: '', exercises: [] })
  }

  return (
    <div className="space-y-4">
      <Button variant="surface" className="w-full" onClick={newDraft}>
        ＋ New Routine
      </Button>

      {routines.length === 0 ? (
        <EmptyState icon="📋" text="No routines yet. Create one to plan your sessions." />
      ) : (
        <div className="space-y-2">
          {routines.map((r) => (
            <button
              key={r.id}
              onClick={() => setEditing(structuredCloneRoutine(r))}
              className="w-full text-left"
            >
              <Card className="p-3.5 active:bg-surface-2/60">
                <p className="font-semibold text-[15px] truncate">{r.name}</p>
                <p className="text-[13px] text-ink-faint mt-0.5">
                  {r.exercises.length}{' '}
                  {r.exercises.length === 1 ? 'exercise' : 'exercises'} ·{' '}
                  {routineSetTotal(r)} sets
                </p>
              </Card>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <RoutineEditor
          key={editing.id}
          initial={editing}
          existing={routines.some((r) => r.id === editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function structuredCloneRoutine(r: Routine): Routine {
  return {
    id: r.id,
    name: r.name,
    exercises: r.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets.map((st) => ({ reps: st.reps, weightKg: st.weightKg })),
    })),
  }
}

function RoutineEditor({
  initial,
  existing,
  onClose,
}: {
  initial: Routine
  existing: boolean
  onClose: () => void
}) {
  const unit = useStore((s) => s.settings.unit)
  const custom = useStore((s) => s.customExercises)
  const saveRoutine = useStore((s) => s.saveRoutine)
  const deleteRoutine = useStore((s) => s.deleteRoutine)

  const [name, setName] = useState(initial.name)
  const [exercises, setExercises] = useState<RoutineExercise[]>(initial.exercises)
  const [picking, setPicking] = useState(false)

  function save() {
    saveRoutine({ id: initial.id, name: name.trim(), exercises })
    onClose()
  }

  function addExercise(exerciseId: string) {
    setExercises((prev) => [
      ...prev,
      { exerciseId, sets: [{ reps: 8, weightKg: 0 }] },
    ])
  }

  function removeExercise(idx: number) {
    setExercises((prev) => prev.filter((_, i) => i !== idx))
  }

  function addSet(idx: number) {
    setExercises((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e
        const last = e.sets[e.sets.length - 1]
        return {
          ...e,
          sets: [...e.sets, { reps: last?.reps ?? 8, weightKg: last?.weightKg ?? 0 }],
        }
      }),
    )
  }

  function removeSet(idx: number, setIdx: number) {
    setExercises((prev) =>
      prev.map((e, i) =>
        i === idx ? { ...e, sets: e.sets.filter((_, j) => j !== setIdx) } : e,
      ),
    )
  }

  function setWeight(idx: number, setIdx: number, str: string) {
    const weightKg = toKg(parseNum(str), unit)
    setExercises((prev) =>
      prev.map((e, i) =>
        i === idx
          ? {
              ...e,
              sets: e.sets.map((st, j) => (j === setIdx ? { ...st, weightKg } : st)),
            }
          : e,
      ),
    )
  }

  function setReps(idx: number, setIdx: number, str: string) {
    const reps = Math.round(parseNum(str))
    setExercises((prev) =>
      prev.map((e, i) =>
        i === idx
          ? {
              ...e,
              sets: e.sets.map((st, j) => (j === setIdx ? { ...st, reps } : st)),
            }
          : e,
      ),
    )
  }

  return (
    <FullScreen
      title={existing ? 'Edit Routine' : 'New Routine'}
      onBack={onClose}
      action={
        <button
          onClick={save}
          disabled={name.trim().length === 0}
          className="text-ember font-bold text-[15px] disabled:opacity-40"
        >
          Save
        </button>
      }
    >
      <div className="space-y-4">
        <Field
          label="Routine name"
          type="text"
          value={name}
          onChange={setName}
          placeholder="Push Day, Leg Day…"
        />

        {exercises.map((e, idx) => (
          <Card key={idx} className="p-3.5">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-[15px] min-w-0 truncate pr-2">
                {exerciseName(e.exerciseId, custom)}
              </p>
              <button
                onClick={() => removeExercise(idx)}
                aria-label="Remove exercise"
                className="shrink-0 w-8 h-8 rounded-full bg-surface-2 text-ink-faint flex items-center justify-center text-sm active:text-bad"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {e.sets.map((st, setIdx) => (
                <div key={setIdx} className="flex items-center gap-2">
                  <span className="w-6 text-center text-[13px] tnum text-ink-faint shrink-0">
                    {setIdx + 1}
                  </span>
                  <div className="flex-1">
                    <Field
                      suffix={unit}
                      value={st.weightKg > 0 ? displayWeight(st.weightKg, unit) : ''}
                      onChange={(v) => setWeight(idx, setIdx, v)}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Field
                      suffix="reps"
                      value={st.reps > 0 ? String(st.reps) : ''}
                      onChange={(v) => setReps(idx, setIdx, v)}
                      placeholder="0"
                    />
                  </div>
                  <button
                    onClick={() => removeSet(idx, setIdx)}
                    aria-label="Remove set"
                    className="shrink-0 w-8 h-8 rounded-full text-ink-faint flex items-center justify-center text-sm active:text-bad"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => addSet(idx)}
              className="mt-2.5 text-[14px] font-semibold text-ember active:opacity-70"
            >
              ＋ Add Set
            </button>
          </Card>
        ))}

        <Button variant="surface" className="w-full" onClick={() => setPicking(true)}>
          ＋ Add Exercise
        </Button>

        {existing && (
          <Button
            variant="danger"
            className="w-full mt-2"
            onClick={() => {
              if (window.confirm('Delete this routine?')) {
                deleteRoutine(initial.id)
                onClose()
              }
            }}
          >
            Delete Routine
          </Button>
        )}
      </div>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={addExercise}
      />
    </FullScreen>
  )
}

/* ------------------------------------------------------------------ */
/*  History list + detail                                              */
/* ------------------------------------------------------------------ */

function HistoryTab() {
  const history = useStore((s) => s.history)
  const unit = useStore((s) => s.settings.unit)
  const [detail, setDetail] = useState<Workout | null>(null)

  if (history.length === 0) {
    return <EmptyState icon="🏋️" text="No workouts yet. Your finished sessions land here." />
  }

  return (
    <div className="space-y-2">
      {history.map((w) => (
        <button key={w.id} onClick={() => setDetail(w)} className="w-full text-left">
          <Card className="p-3.5 active:bg-surface-2/60">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold text-[15px] truncate">{w.name}</p>
              <span className="text-[12px] text-ink-faint shrink-0 tnum">
                {fmtDay(dateKey(new Date(w.startedAt)))}
              </span>
            </div>
            <p className="text-[13px] text-ink-faint mt-1 tnum">
              {w.endedAt ? fmtDuration(w.endedAt - w.startedAt) : '—'} ·{' '}
              {workoutSetCount(w)} sets ·{' '}
              {fmtInt(fromKg(workoutVolumeKg(w), unit))} {unit}
            </p>
          </Card>
        </button>
      ))}

      {detail && (
        <WorkoutDetail workout={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}

function WorkoutDetail({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const unit = useStore((s) => s.settings.unit)
  const custom = useStore((s) => s.customExercises)
  const deleteWorkout = useStore((s) => s.deleteWorkout)

  const volume = workoutVolumeKg(workout)
  const sets = workoutSetCount(workout)

  return (
    <FullScreen title={workout.name} onBack={onClose}>
      <div className="space-y-4">
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat
              label="Duration"
              value={workout.endedAt ? fmtDuration(workout.endedAt - workout.startedAt) : '—'}
            />
            <Stat label="Sets" value={String(sets)} />
            <Stat label={`Volume`} value={`${fmtInt(fromKg(volume, unit))}`} sub={unit} />
          </div>
          <p className="text-center text-[13px] text-ink-faint mt-3 tnum">
            {fmtDay(dateKey(new Date(workout.startedAt)))}
          </p>
        </Card>

        {workout.exercises.map((e) => {
          const best = e.sets.reduce(
            (mx, st) => Math.max(mx, epley1RM(st.weightKg, st.reps)),
            0,
          )
          return (
            <Card key={e.id} className="p-3.5">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <p className="font-semibold text-[15px] truncate">
                  {exerciseName(e.exerciseId, custom)}
                </p>
                {best > 0 && (
                  <span className="text-[12px] text-ink-faint shrink-0 tnum">
                    {displayWeight(best, unit)} {unit} e1RM
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {e.sets.map((st, i) => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between text-[14px] tnum"
                  >
                    <span className="text-ink-faint w-6">{i + 1}</span>
                    <span className="text-ink-dim">
                      {st.reps} × {displayWeight(st.weightKg, unit)} {unit}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )
        })}

        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (window.confirm('Delete this workout permanently?')) {
              deleteWorkout(workout.id)
              onClose()
            }
          }}
        >
          Delete Workout
        </Button>
      </div>
    </FullScreen>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[19px] font-extrabold tnum leading-tight">
        {value}
        {sub && <span className="text-[12px] font-semibold text-ink-faint ml-0.5">{sub}</span>}
      </p>
      <p className="text-[11px] uppercase tracking-wider text-ink-faint mt-0.5">{label}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Live session                                                       */
/* ------------------------------------------------------------------ */

function LiveSession() {
  const active = useStore((s) => s.active) as Workout
  const custom = useStore((s) => s.customExercises)
  const history = useStore((s) => s.history)
  const unit = useStore((s) => s.settings.unit)
  const renameActive = useStore((s) => s.renameActive)
  const removeExerciseFromActive = useStore((s) => s.removeExerciseFromActive)
  const addExerciseToActive = useStore((s) => s.addExerciseToActive)
  const addSet = useStore((s) => s.addSet)
  const removeSet = useStore((s) => s.removeSet)
  const updateSet = useStore((s) => s.updateSet)
  const toggleSetDone = useStore((s) => s.toggleSetDone)
  const finishWorkout = useStore((s) => s.finishWorkout)
  const discardWorkout = useStore((s) => s.discardWorkout)
  const saveRoutine = useStore((s) => s.saveRoutine)

  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - active.startedAt) / 1000),
  )
  const [picking, setPicking] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - active.startedAt) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [active.startedAt])

  const doneCount = useMemo(
    () =>
      active.exercises.reduce(
        (n, e) => n + e.sets.filter((st) => st.done).length,
        0,
      ),
    [active.exercises],
  )
  const totalSets = useMemo(
    () => active.exercises.reduce((n, e) => n + e.sets.length, 0),
    [active.exercises],
  )

  return (
    <div className="pt-4 space-y-4">
      {/* Header */}
      <div>
        <input
          type="text"
          value={active.name}
          onChange={(e) => renameActive(e.target.value)}
          aria-label="Workout name"
          className="w-full bg-transparent outline-none text-[22px] font-extrabold text-ink placeholder:text-ink-faint"
          placeholder="Workout name"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[15px] tnum text-ember font-bold">
            {fmtElapsed(elapsed)}
          </span>
          <span className="text-[13px] tnum text-ink-faint">
            {doneCount} / {totalSets} sets done
          </span>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => setFinishOpen(true)}
          >
            Finish
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm('Discard this workout? This cannot be undone.')) {
                haptic()
                discardWorkout()
              }
            }}
          >
            Discard
          </Button>
        </div>
      </div>

      {/* Exercises */}
      {active.exercises.map((we) => (
        <ExerciseCard
          key={we.id}
          we={we}
          unit={unit}
          name={exerciseName(we.exerciseId, custom)}
          prev={lastPerformance(history, we.exerciseId)}
          historyBest={bestE1RMInHistory(history, we.exerciseId)}
          onRemove={() => {
            if (window.confirm('Remove this exercise?')) removeExerciseFromActive(we.id)
          }}
          onAddSet={() => addSet(we.id)}
          onRemoveSet={(setId) => removeSet(we.id, setId)}
          onUpdateSet={(setId, patch) => updateSet(we.id, setId, patch)}
          onToggleDone={(setId) => toggleSetDone(we.id, setId)}
        />
      ))}

      {active.exercises.length === 0 && (
        <div className="text-center py-6 text-ink-faint text-[14px]">
          No exercises yet — add your first one to get going.
        </div>
      )}

      <Button variant="surface" className="w-full" onClick={() => setPicking(true)}>
        ＋ Add Exercise
      </Button>

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={addExerciseToActive}
      />

      <FinishSheet
        open={finishOpen}
        active={active}
        unit={unit}
        history={history}
        custom={custom}
        onClose={() => setFinishOpen(false)}
        onConfirm={(saveAsRoutine, routineName) => {
          haptic()
          const w = finishWorkout()
          if (saveAsRoutine && w) {
            saveRoutine({
              id: uid(),
              name: routineName.trim() || w.name,
              exercises: w.exercises.map((e) => ({
                exerciseId: e.exerciseId,
                sets: e.sets.map((st) => ({ reps: st.reps, weightKg: st.weightKg })),
              })),
            })
          }
          setFinishOpen(false)
        }}
      />
    </div>
  )
}

function ExerciseCard({
  we,
  unit,
  name,
  prev,
  historyBest,
  onRemove,
  onAddSet,
  onRemoveSet,
  onUpdateSet,
  onToggleDone,
}: {
  we: WorkoutExercise
  unit: Unit
  name: string
  prev: ReturnType<typeof lastPerformance>
  historyBest: number | null
  onRemove: () => void
  onAddSet: () => void
  onRemoveSet: (setId: string) => void
  onUpdateSet: (setId: string, patch: { reps?: number; weightKg?: number }) => void
  onToggleDone: (setId: string) => void
}) {
  // The single done set whose e1RM beats every earlier set this session AND
  // beats the best in history is the PR. Only that set gets the PR pill.
  const prSetId = useMemo(() => {
    const threshold = historyBest ?? 0
    let bestSoFar = 0
    let prId: string | null = null
    for (const st of we.sets) {
      if (!st.done) continue
      const e1 = epley1RM(st.weightKg, st.reps)
      if (e1 <= 0) continue
      if (e1 > bestSoFar && e1 > threshold + 0.01) {
        bestSoFar = e1
        prId = st.id
      } else if (e1 > bestSoFar) {
        bestSoFar = e1
      }
    }
    return prId
  }, [we.sets, historyBest])

  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <p className="font-semibold text-[15px] min-w-0 truncate pr-2">{name}</p>
        <button
          onClick={onRemove}
          aria-label="Remove exercise"
          className="shrink-0 w-8 h-8 rounded-full bg-surface-2 text-ink-faint flex items-center justify-center text-sm active:text-bad"
        >
          ✕
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        <span className="w-6 text-center shrink-0">Set</span>
        <span className="w-12 text-center shrink-0">Prev</span>
        <span className="flex-1 text-center">{unit.toUpperCase()}</span>
        <span className="flex-1 text-center">Reps</span>
        <span className="w-9 text-center shrink-0">✓</span>
        <span className="w-6 shrink-0" />
      </div>

      <div className="space-y-1.5">
        {we.sets.map((st, i) => (
          <SetRow
            key={st.id}
            index={i + 1}
            weightKg={st.weightKg}
            reps={st.reps}
            done={st.done}
            unit={unit}
            isPR={st.id === prSetId}
            prevSet={prev?.[i] ?? null}
            onCommit={(patch) => onUpdateSet(st.id, patch)}
            onCopyPrev={(patch) => onUpdateSet(st.id, patch)}
            onToggleDone={() => onToggleDone(st.id)}
            onRemove={() => onRemoveSet(st.id)}
          />
        ))}
      </div>

      <button
        onClick={onAddSet}
        className="mt-2.5 text-[14px] font-semibold text-ember active:opacity-70"
      >
        ＋ Add Set
      </button>
    </Card>
  )
}

function SetRow({
  index,
  weightKg,
  reps,
  done,
  unit,
  isPR,
  prevSet,
  onCommit,
  onCopyPrev,
  onToggleDone,
  onRemove,
}: {
  index: number
  weightKg: number
  reps: number
  done: boolean
  unit: Unit
  isPR: boolean
  prevSet: { reps: number; weightKg: number } | null
  onCommit: (patch: { reps?: number; weightKg?: number }) => void
  onCopyPrev: (patch: { reps: number; weightKg: number }) => void
  onToggleDone: () => void
  onRemove: () => void
}) {
  const [wStr, setWStr] = useState(weightKg > 0 ? displayWeight(weightKg, unit) : '')
  const [rStr, setRStr] = useState(reps > 0 ? String(reps) : '')

  // Re-sync local strings when the store value changes from outside this row
  // (e.g. tapping PREV, steppers, or addSet pre-copying numbers).
  const lastW = useRef(weightKg)
  const lastR = useRef(reps)
  useEffect(() => {
    if (weightKg !== lastW.current) {
      lastW.current = weightKg
      setWStr(weightKg > 0 ? displayWeight(weightKg, unit) : '')
    }
  }, [weightKg, unit])
  useEffect(() => {
    if (reps !== lastR.current) {
      lastR.current = reps
      setRStr(reps > 0 ? String(reps) : '')
    }
  }, [reps])

  // Fire the ember bloom once when a set first becomes a PR.
  const [flare, setFlare] = useState(false)
  const wasPR = useRef(false)
  useEffect(() => {
    if (isPR && !wasPR.current) {
      setFlare(true)
      const t = setTimeout(() => setFlare(false), 560)
      wasPR.current = true
      return () => clearTimeout(t)
    }
    if (!isPR) wasPR.current = false
  }, [isPR])

  function commitWeight() {
    const kg = toKg(parseNum(wStr), unit)
    lastW.current = kg
    onCommit({ weightKg: kg })
  }
  function commitReps() {
    const r = Math.round(parseNum(rStr))
    lastR.current = r
    onCommit({ reps: r })
  }

  function handleToggleDone() {
    // Toggling this set ON while it's the PR set earns the stronger buzz.
    if (!done && isPR) haptic([15, 40, 15])
    onToggleDone()
  }

  const prevLabel = prevSet
    ? `${displayWeight(prevSet.weightKg, unit)}×${prevSet.reps}`
    : '—'

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg py-1 px-1 transition-colors ${
        done ? 'bg-good/10' : ''
      } ${flare ? 'forge-flare' : ''}`}
    >
      <span className="w-6 text-center text-[14px] tnum text-ink-faint shrink-0 relative">
        {index}
        {isPR && (
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-ember px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-black leading-none">
            PR
          </span>
        )}
      </span>
      <button
        onClick={() => {
          if (prevSet) onCopyPrev({ reps: prevSet.reps, weightKg: prevSet.weightKg })
        }}
        disabled={!prevSet}
        className="w-12 text-center text-[12px] tnum text-ink-faint shrink-0 active:text-ink disabled:opacity-100 truncate"
      >
        {prevLabel}
      </button>
      <input
        inputMode="decimal"
        value={wStr}
        onChange={(e) => setWStr(e.target.value)}
        onBlur={commitWeight}
        placeholder={prevSet ? displayWeight(prevSet.weightKg, unit) : '0'}
        aria-label="Weight"
        className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line focus:border-ember/70 outline-none text-center py-2.5 text-[15px] tnum transition-colors placeholder:text-ink-faint"
      />
      <input
        inputMode="decimal"
        value={rStr}
        onChange={(e) => setRStr(e.target.value)}
        onBlur={commitReps}
        placeholder={prevSet ? String(prevSet.reps) : '0'}
        aria-label="Reps"
        className="flex-1 min-w-0 rounded-lg bg-surface-2 border border-line focus:border-ember/70 outline-none text-center py-2.5 text-[15px] tnum transition-colors placeholder:text-ink-faint"
      />
      <button
        onClick={handleToggleDone}
        aria-label={done ? 'Mark set not done' : 'Mark set done'}
        className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center transition-colors ${
          done ? 'bg-good text-black' : 'bg-surface-2 text-ink-faint active:bg-line'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        onClick={onRemove}
        aria-label="Remove set"
        className="w-6 text-center text-ink-faint shrink-0 text-[13px] active:text-bad"
      >
        ✕
      </button>
    </div>
  )
}

function FinishSheet({
  open,
  active,
  unit,
  history,
  custom,
  onClose,
  onConfirm,
}: {
  open: boolean
  active: Workout
  unit: Unit
  history: Workout[]
  custom: Exercise[]
  onClose: () => void
  onConfirm: (saveAsRoutine: boolean, routineName: string) => void
}) {
  const [saveAsRoutine, setSaveAsRoutine] = useState(false)
  const [routineName, setRoutineName] = useState(active.name)

  // Keep the prefilled routine name in sync while the sheet is closed.
  useEffect(() => {
    if (!open) setRoutineName(active.name)
  }, [open, active.name])

  // history does NOT yet include the active workout, so this is the true set of PRs.
  const prs = useMemo(
    () => (open ? computePRs(active, history, custom) : []),
    [open, active, history, custom],
  )

  // Celebrate once when the sheet opens with records.
  useEffect(() => {
    if (open && prs.length > 0) haptic([15, 40, 15])
  }, [open, prs.length])

  const duration = fmtDuration(Date.now() - active.startedAt)
  const exCount = active.exercises.length
  const setCount = active.exercises.reduce(
    (n, e) => n + e.sets.filter((st) => st.reps > 0 || st.weightKg > 0).length,
    0,
  )
  const volume = fromKg(workoutVolumeKg(active), unit)

  return (
    <Sheet open={open} onClose={onClose} title="Finish Workout">
      <div className="space-y-4">
        {prs.length > 0 && (
          <div className="forge-flare rounded-xl border border-ember/40 bg-ember/10 p-3.5">
            <p className="text-[15px] font-extrabold text-ember mb-2">
              🔥 {prs.length} Personal Record{prs.length === 1 ? '' : 's'}
            </p>
            <div className="space-y-1.5">
              {prs.map((pr) => {
                const gain =
                  pr.prevKg != null
                    ? Math.round((fromKg(pr.e1rmKg, unit) - fromKg(pr.prevKg, unit)) * 10) / 10
                    : null
                return (
                  <div
                    key={pr.exerciseId}
                    className="flex items-baseline justify-between gap-2 text-[14px]"
                  >
                    <span className="font-semibold text-ink truncate min-w-0">{pr.name}</span>
                    <span className="tnum text-ink-dim shrink-0">
                      {displayWeight(pr.e1rmKg, unit)} {unit} e1RM
                      {gain != null && gain > 0 && (
                        <span className="text-ember font-semibold ml-1.5">
                          +{gain} {unit}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <SummaryCell label="Duration" value={duration} />
          <SummaryCell label="Exercises" value={String(exCount)} />
          <SummaryCell label="Sets" value={String(setCount)} />
          <SummaryCell label="Volume" value={`${fmtInt(volume)} ${unit}`} />
        </div>

        <button
          onClick={() => setSaveAsRoutine((v) => !v)}
          className="w-full flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-left"
        >
          <span
            className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center transition-colors ${
              saveAsRoutine ? 'bg-ember text-black' : 'bg-surface border border-line'
            }`}
          >
            {saveAsRoutine && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span className="font-semibold text-[15px]">Save as routine</span>
        </button>

        {saveAsRoutine && (
          <Field
            label="Routine name"
            type="text"
            value={routineName}
            onChange={setRoutineName}
            placeholder="Routine name"
          />
        )}

        <Button
          variant="primary"
          className="w-full"
          onClick={() => onConfirm(saveAsRoutine, routineName)}
        >
          Finish & Save
        </Button>
      </div>
    </Sheet>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3.5 py-3">
      <p className="text-[19px] font-extrabold tnum leading-tight">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-ink-faint mt-0.5">{label}</p>
    </div>
  )
}
