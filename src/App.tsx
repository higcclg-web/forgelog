import { lazy, Suspense, useState } from 'react'
import { useStore } from './lib/store'
import { TabBar, type Tab } from './components/TabBar'
import { RestTimer } from './components/RestTimer'
import { Onboarding } from './components/Onboarding'
import { ErrorBoundary } from './components/ErrorBoundary'
import Home from './pages/Home'
import WorkoutPage from './pages/Workout'
import NutritionPage from './pages/Nutrition'
import SettingsPage from './pages/Settings'

// Charts (recharts) are heavy and only needed on the Progress tab — load on demand.
const ProgressPage = lazy(() => import('./pages/Progress'))

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const onboarded = useStore((s) => s.settings.onboarded)

  if (!onboarded) return <Onboarding />

  return (
    <div className="min-h-dvh bg-bg">
      <main className="max-w-lg mx-auto px-4 pb-40 pt-[calc(env(safe-area-inset-top)+20px)]">
        <ErrorBoundary key={tab}>
          {tab === 'home' && <Home go={setTab} />}
          {tab === 'workout' && <WorkoutPage />}
          {tab === 'nutrition' && <NutritionPage />}
          {tab === 'progress' && (
            <Suspense
              fallback={<div className="py-20 text-center text-ink-faint text-sm">Loading charts…</div>}
            >
              <ProgressPage />
            </Suspense>
          )}
          {tab === 'settings' && <SettingsPage />}
        </ErrorBoundary>
      </main>
      <RestTimer />
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
