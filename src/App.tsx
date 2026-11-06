import { useEffect, useRef, useState } from "react"
import { dateKey, formatShort } from "./dates.ts"
import {
  HABITS,
  WATER_POUR_ML,
  dayProgress,
  formatWater,
  habitDetail,
  itemProgress,
  type HabitDef,
} from "./habits.ts"
import {
  applySettings,
  completeOnboarding,
  dismissHomeHint,
  dismissNotice,
  resetCopy,
  restoreOffer,
  restoreYesterday,
  roundPosition,
  setCheck,
  setValue,
  settle,
  startAnother,
  toggleTreat,
} from "./streak.ts"
import { exportState, importState, loadState, saveState } from "./storage.ts"
import { ROUND_LENGTH, type AppState, type DayLog, type HabitId, type Settings } from "./types.ts"
import "./styles.css"

type Tab = "today" | "history" | "settings"

const SETTING_FIELDS: Array<{ key: keyof Settings; label: string; hint: string; max: number }> = [
  { key: "calorieTarget", label: "Calorie target", hint: "At or under this number", max: 20000 },
  { key: "stepGoal", label: "Steps", hint: "Done at this many", max: 200000 },
  { key: "waterMl", label: "Water, in milliliters", hint: "1.5 liters is 1500", max: 8000 },
  { key: "proteinMin", label: "Protein minimum, in grams", hint: "The day seals here. 10 g above it is still the aim.", max: 500 },
  { key: "pages", label: "Pages", hint: "Reading", max: 80 },
]

export default function App() {
  const [today, setToday] = useState(() => dateKey(new Date()))
  const [state, setState] = useState(() => loadState(localStorage, dateKey(new Date())))
  const [tab, setTab] = useState<Tab>("today")
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    saveState(localStorage, state)
  }, [state])

  useEffect(() => {
    const tick = () => {
      const nextToday = dateKey(new Date())
      setToday((current) => (current === nextToday ? current : nextToday))
      setState((current) => {
        const settled = settle(current, nextToday)
        return settled === current ? current : settled
      })
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    const id = window.setInterval(tick, 30000)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  const commit = (recipe: (current: AppState, day: string) => AppState) => {
    const day = dateKey(new Date())
    setToday((current) => (current === day ? current : day))
    setState((current) => recipe(settle(current, day), day))
  }

  if (!state.onboarded || state.settings.calorieTarget == null) {
    return (
      <main className="app">
        <FirstRun
          onStart={(calories) => {
            commit((current, day) => completeOnboarding(current, calories, day))
          }}
        />
      </main>
    )
  }

  const installed = isInstalled()
  const showHint = !installed && !state.homeScreenHintDismissed
  const offer = restoreOffer(state, today)

  return (
    <main className="app">
      {tab === "today" ? (
        <TodayScreen
          state={state}
          today={today}
          showHint={showHint}
          onDismissHint={() => setState(dismissHomeHint)}
          onDismissNotice={() => setState(dismissNotice)}
          onCheck={(id) => {
            commit((current, day) => {
              const log = current.current.days.find((entry) => entry.date === day)
              return setCheck(current, day, id, !log?.checks[id])
            })
          }}
          onValue={(id, value) => commit((current, day) => setValue(current, day, id, value))}
          onAdjust={(id, delta) => {
            commit((current, day) => {
              const log = current.current.days.find((entry) => entry.date === day)
              return setValue(current, day, id, (log?.values[id] ?? 0) + delta)
            })
          }}
          onTreat={() => commit((current, day) => toggleTreat(current, day))}
          onStartAnother={() => commit((current, day) => startAnother(current, day))}
        />
      ) : null}
      {tab === "history" ? <HistoryScreen state={state} today={today} /> : null}
      {tab === "settings" ? (
        <SettingsScreen
          key={JSON.stringify(state.settings)}
          settings={state.settings}
          importError={importError}
          onChange={(settings) => commit((current, day) => applySettings(current, settings, day))}
          onExport={() => downloadBackup(state)}
          onImport={(file) => {
            const day = dateKey(new Date())
            void file.text().then((json) => {
              try {
                const next = importState(json, day)
                setToday(day)
                setState(next)
                setImportError(null)
                setTab("today")
              } catch {
                setImportError("That file isn't a 75 Hard backup.")
              }
            })
          }}
        />
      ) : null}
      {offer ? (
        <StreakEnded
          missed={offer.missed}
          onRestore={() => commit((current, day) => restoreYesterday(current, day))}
          onStartOver={() => setState(dismissNotice)}
        />
      ) : null}
      <nav className="nav" aria-label="Sections">
        <TabButton current={tab} id="today" onSelect={setTab}>Today</TabButton>
        <TabButton current={tab} id="history" onSelect={setTab}>History</TabButton>
        <TabButton current={tab} id="settings" onSelect={setTab}>Settings</TabButton>
      </nav>
    </main>
  )
}

function StreakEnded({
  missed,
  onRestore,
  onStartOver,
}: {
  missed: HabitId[]
  onRestore: () => void
  onStartOver: () => void
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="streak-ended-title">
        <p className="brand">75 Hard</p>
        <h2 id="streak-ended-title">Streak ended</h2>
        <p>Yesterday still had these open.</p>
        <ul className="missed">
          {missed.map((id) => (
            <li key={id}>{HABITS.find((habit) => habit.id === id)?.title}</li>
          ))}
        </ul>
        <button className="primary" type="button" onClick={onRestore}>
          I did it, I just forgot to tick it yesterday
        </button>
        <button className="secondary" type="button" onClick={onStartOver}>Start over</button>
      </section>
    </div>
  )
}

function FirstRun({ onStart }: { onStart: (calories: number) => void }) {
  const [value, setValue] = useState("")
  const calories = Number(value)
  const ready = Number.isInteger(calories) && calories > 0 && calories <= 20000

  return (
    <form
      className="first-run"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onStart(calories)
      }}
    >
      <p className="brand">75 Hard</p>
      <p className="lede">Miss a day, and the 75 starts over. The treat once a week is optional.</p>
      <label className="field" htmlFor="calorie-target">
        <span>Calorie target</span>
        <input
          id="calorie-target"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
        />
      </label>
      <p className="hint">The day counts when today's total is above zero and at or under this number.</p>
      <button className="primary" type="submit" disabled={!ready}>Start day 1</button>
    </form>
  )
}

function TodayScreen({
  state,
  today,
  showHint,
  onDismissHint,
  onDismissNotice,
  onCheck,
  onValue,
  onAdjust,
  onTreat,
  onStartAnother,
}: {
  state: AppState
  today: string
  showHint: boolean
  onDismissHint: () => void
  onDismissNotice: () => void
  onCheck: (id: HabitId) => void
  onValue: (id: HabitId, value: number) => void
  onAdjust: (id: HabitId, delta: number) => void
  onTreat: () => void
  onStartAnother: () => void
}) {
  if (state.current.endReason === "completed") {
    return (
      <section className="celebrate">
        <p className="brand">75 Hard</p>
        <h1>You did it.</h1>
        <p className="lede">Seventy-five days, each one sealed.</p>
        <button className="primary" type="button" onClick={onStartAnother}>Start another 75</button>
      </section>
    )
  }

  const log = state.current.days.find((day) => day.date === today) ?? {
    date: today,
    checks: {},
    values: {},
    sealed: false,
  }
  const position = roundPosition(state.current, today)
  const progress = dayProgress(log, state.settings)
  const metCount = HABITS.filter((habit) => itemProgress(habit.id, log, state.settings) >= 1).length

  return (
    <section>
      <header className="hero">
        <h1 className="day-heading">
          <span className="kicker">Day</span>
          <span className="day-count">{position.dayNumber}</span>
          <span className="day-of">of {ROUND_LENGTH}</span>
        </h1>
        <div className="bar-copy">
          <span>{state.current.sealedCount} sealed</span>
          <span>{position.toGo} to go</span>
        </div>
        <Bar value={state.current.sealedCount / ROUND_LENGTH} label="This round" />
      </header>

      {state.notice?.kind === "reset" && !restoreOffer(state, today) ? (
        <div className="notice" role="status">
          <p>{resetCopy(state.notice.sealedCount)}</p>
          <button type="button" onClick={onDismissNotice}>Okay</button>
        </div>
      ) : null}

      {showHint ? (
        <div className="hint-card">
          <p>Add 75 Hard to your Home Screen so these days stay on your phone. In Safari, tap Share, then Add to Home Screen.</p>
          <button type="button" onClick={onDismissHint}>Got it</button>
        </div>
      ) : null}

      <div className="today-head">
        <h2>Today</h2>
        <p aria-live="polite">{metCount} of {HABITS.length}</p>
      </div>
      <Bar value={progress} label="Today" />
      {position.todaySealed ? <p className="sealed-line">Today is sealed.</p> : null}

      <div className="habits">
        {HABITS.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            log={log}
            settings={state.settings}
            onCheck={onCheck}
            onValue={onValue}
            onAdjust={onAdjust}
          />
        ))}
      </div>

      <TreatCard used={state.treat.used} onToggle={onTreat} />
    </section>
  )
}

function HabitRow({
  habit,
  log,
  settings,
  onCheck,
  onValue,
  onAdjust,
}: {
  habit: HabitDef
  log: DayLog
  settings: Settings
  onCheck: (id: HabitId) => void
  onValue: (id: HabitId, value: number) => void
  onAdjust: (id: HabitId, delta: number) => void
}) {
  const progress = itemProgress(habit.id, log, settings)
  const met = progress >= 1
  const value = log.values[habit.id] ?? 0
  const over = habit.id === "calories" && settings.calorieTarget != null && value > settings.calorieTarget
  const detail = over ? "Over your target" : habitDetail(habit.id, settings)

  if (habit.control === "toggle") {
    return (
      <button
        type="button"
        className={met ? "habit met" : "habit"}
        aria-pressed={met}
        onClick={() => onCheck(habit.id)}
      >
        <span className="habit-copy">
          <span className="habit-title">{habit.title}</span>
          <span className="habit-detail">{detail}</span>
        </span>
        <span className="mark" aria-hidden="true">{met ? <CheckIcon /> : null}</span>
      </button>
    )
  }

  return (
    <div className={cls("habit", met && "met", over && "over")}>
      <div className="habit-copy">
        <span className="habit-title">{habit.title}</span>
        <span className="habit-detail">{detail}</span>
      </div>
      {habit.control === "number" ? (
        <input
          className="count-input"
          aria-label={habit.title}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={value === 0 ? "" : String(value)}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "")
            onValue(habit.id, digits === "" ? 0 : Number(digits))
          }}
        />
      ) : null}
      {habit.control === "water" ? (
        <div className="stepper">
          <button
            type="button"
            aria-label="Remove 250 milliliters"
            onClick={() => onAdjust(habit.id, -WATER_POUR_ML)}
          >
            −
          </button>
          <span className="stepper-value">{formatWater(value)} L</span>
          <button
            type="button"
            aria-label="Add 250 milliliters"
            onClick={() => onAdjust(habit.id, WATER_POUR_ML)}
          >
            +
          </button>
        </div>
      ) : null}
      {habit.control === "stepper" ? (
        <div className="stepper">
          <button
            type="button"
            aria-label={stepperLabel(habit.id, "less")}
            onClick={() => onAdjust(habit.id, -1)}
          >
            −
          </button>
          <span className="stepper-value">{value}</span>
          <button
            type="button"
            aria-label={stepperLabel(habit.id, "more")}
            onClick={() => onAdjust(habit.id, 1)}
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  )
}

function TreatCard({ used, onToggle }: { used: boolean; onToggle: () => void }) {
  return (
    <section className={used ? "treat used" : "treat"}>
      <h2>This week's treat</h2>
      <p>A cookie or a piece of cake, if you want it. Once from Monday to Sunday. Skipping it is fine.</p>
      <button type="button" aria-pressed={used} onClick={onToggle}>
        {used ? "Used this week" : "Have the treat"}
      </button>
    </section>
  )
}

function HistoryScreen({ state, today }: { state: AppState; today: string }) {
  const past = state.history.filter((round) => round.id !== state.current.id)
  const best = Math.max(state.best, state.current.sealedCount)
  return (
    <section className="history">
      <h1>History</h1>
      <p className="best">Best run · {best === 0 ? "not yet" : `${best} ${best === 1 ? "day" : "days"}`}</p>
      <h2>This round</h2>
      <div className="strip" aria-label="Days in this round">
        {state.current.days.map((day) => (
          <span
            key={day.date}
            className={cls("dot", day.sealed && "sealed", day.date === today && !day.sealed && "today")}
            title={formatShort(day.date)}
          />
        ))}
      </div>
      <h2>Past rounds</h2>
      {past.length === 0 ? (
        <p className="quiet">A missed day will land here. It won't erase your best run.</p>
      ) : (
        <ul className="past">
          {past.map((round) => (
            <li key={round.id}>
              <span>{pastLabel(round)}</span>
              <span className="quiet">{formatShort(round.endedOn ?? round.startedOn)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SettingsScreen({
  settings,
  importError,
  onChange,
  onExport,
  onImport,
}: {
  settings: Settings
  importError: string | null
  onChange: (settings: Settings) => void
  onExport: () => void
  onImport: (file: File) => void
}) {
  const [draft, setDraft] = useState(() => toDraft(settings))
  const fileRef = useRef<HTMLInputElement>(null)

  const commitField = (key: keyof Settings, max: number) => {
    const parsed = Number(draft[key])
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
      setDraft(toDraft(settings))
      return
    }
    if (parsed === settings[key]) return
    onChange({ ...settings, [key]: parsed })
  }

  return (
    <section className="settings">
      <h1>Settings</h1>
      <p className="quiet">The list stays the same. These are only the numbers a day has to reach.</p>
      {SETTING_FIELDS.map((field) => (
        <label className="field" key={field.key} htmlFor={`setting-${field.key}`}>
          <span>{field.label}</span>
          <input
            id={`setting-${field.key}`}
            inputMode="numeric"
            autoComplete="off"
            value={draft[field.key]}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "")
              setDraft((current) => ({ ...current, [field.key]: digits }))
            }}
            onBlur={() => commitField(field.key, field.max)}
          />
          <small>{field.hint}</small>
        </label>
      ))}
      <div className="backup">
        <h2>Backup</h2>
        <p className="quiet">Save a copy in case the phone clears the app.</p>
        <button className="primary" type="button" onClick={onExport}>Export backup</button>
        <button className="secondary" type="button" onClick={() => fileRef.current?.click()}>
          Import backup
        </button>
        <input
          ref={fileRef}
          className="file"
          type="file"
          accept="application/json,.json"
          aria-label="Backup file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) onImport(file)
          }}
        />
        {importError ? <p className="error" role="alert">{importError}</p> : null}
      </div>
    </section>
  )
}

function TabButton({
  current,
  id,
  onSelect,
  children,
}: {
  current: Tab
  id: Tab
  onSelect: (tab: Tab) => void
  children: string
}) {
  const selected = current === id
  return (
    <button type="button" aria-current={selected ? "page" : undefined} onClick={() => onSelect(id)}>
      {children}
    </button>
  )
}

function Bar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className="bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className="bar-fill" style={{ width: `${percent}%` }} />
    </div>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3.2 8.3 6.4 11.4 12.8 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function pastLabel(round: AppState["current"]): string {
  if (round.endReason === "completed") return `Finished 75 · ${formatShort(round.endedOn ?? round.startedOn)}`
  if (round.sealedCount > 0) return `Ended on day ${round.sealedCount}`
  return "Ended before day 1"
}

function toDraft(settings: Settings): Record<keyof Settings, string> {
  return {
    calorieTarget: settings.calorieTarget == null ? "" : String(settings.calorieTarget),
    proteinMin: String(settings.proteinMin),
    stepGoal: String(settings.stepGoal),
    waterMl: String(settings.waterMl),
    pages: String(settings.pages),
  }
}

function stepperLabel(id: HabitId, direction: "less" | "more"): string {
  if (id === "tea") return direction === "less" ? "One less cup" : "Another cup"
  return direction === "less" ? "Fewer pages" : "Another page"
}

function cls(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ")
}

function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

function downloadBackup(state: AppState) {
  const blob = new Blob([exportState(state)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "75-hard-backup.json"
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
