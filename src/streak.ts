import { addDays, isDateKey, weekStart } from "./dates.ts"
import { HABITS, allRequiredMet, habitById, itemProgress } from "./habits.ts"
import {
  ROUND_LENGTH,
  type AppState,
  type DayLog,
  type HabitId,
  type Notice,
  type Round,
  type RoundEnd,
  type Settings,
  type Treat,
} from "./types.ts"

export function defaultSettings(): Settings {
  return {
    calorieTarget: null,
    proteinMin: 70,
    stepGoal: 10000,
    waterMl: 1500,
    pages: 5,
  }
}

export function emptyDay(date: string): DayLog {
  return { date, checks: {}, values: {}, sealed: false }
}

export function newRound(today: string): Round {
  return {
    id: crypto.randomUUID(),
    startedOn: today,
    days: [emptyDay(today)],
    sealedCount: 0,
  }
}

export function freshState(today: string): AppState {
  return {
    settings: defaultSettings(),
    onboarded: false,
    current: newRound(today),
    history: [],
    best: 0,
    treat: { weekStart: weekStart(today), used: false },
    homeScreenHintDismissed: false,
    notice: null,
  }
}

export function resetCopy(sealedCount: number): string {
  if (sealedCount > 0) {
    return `This round ended on day ${sealedCount}. Today starts a new 75.`
  }
  return "Yesterday wasn't finished. Today starts a new 75."
}

export function roundPosition(round: Round, today: string): {
  dayNumber: number
  toGo: number
  todaySealed: boolean
} {
  if (round.endReason === "completed") {
    return { dayNumber: ROUND_LENGTH, toGo: 0, todaySealed: true }
  }
  const todaySealed = round.days.some((day) => day.date === today && day.sealed)
  const dayNumber = todaySealed ? Math.max(round.sealedCount, 1) : round.sealedCount + 1
  return {
    dayNumber: Math.min(dayNumber, ROUND_LENGTH),
    toGo: Math.max(ROUND_LENGTH - round.sealedCount, 0),
    todaySealed,
  }
}

export function setCheck(state: AppState, today: string, id: HabitId, checked: boolean): AppState {
  return updateToday(state, today, (day) => {
    if (Boolean(day.checks[id]) === checked) return day
    return { ...day, checks: { ...day.checks, [id]: checked } }
  })
}

export function setValue(state: AppState, today: string, id: HabitId, value: number): AppState {
  const max = habitById(id).max
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0
  return updateToday(state, today, (day) => {
    if ((day.values[id] ?? 0) === safe) return day
    return { ...day, values: { ...day.values, [id]: safe } }
  })
}

export function applySettings(state: AppState, settings: Settings, today: string): AppState {
  const next = { ...state, settings }
  if (next.current.endReason === "completed") return next
  return updateToday(next, today, (day) => day)
}

export function completeOnboarding(state: AppState, calorieTarget: number, today: string): AppState {
  return applySettings({ ...state, onboarded: true }, { ...state.settings, calorieTarget }, today)
}

export function unmetHabits(day: DayLog | undefined, settings: Settings): HabitId[] {
  return HABITS.filter((habit) => !day || itemProgress(habit.id, day, settings) < 1).map((habit) => habit.id)
}

export function restoreOffer(state: AppState, today: string): { endedOn: string; missed: HabitId[] } | null {
  if (state.notice?.kind !== "reset") return null
  if (state.notice.endedOn !== addDays(today, -1)) return null
  const round = missedRound(state, state.notice.endedOn)
  if (!round) return null
  const day = round.days.find((entry) => entry.date === round.endedOn)
  return { endedOn: state.notice.endedOn, missed: unmetHabits(day, state.settings) }
}

export function restoreYesterday(state: AppState, today: string): AppState {
  const offer = restoreOffer(state, today)
  if (!offer) return state
  const round = missedRound(state, offer.endedOn)
  if (!round) return state

  const existing = round.days.find((day) => day.date === offer.endedOn) ?? emptyDay(offer.endedOn)
  const restored: DayLog = { ...existing, date: offer.endedOn, sealed: true }
  const todayLog = state.current.days.find((day) => day.date === today) ?? emptyDay(today)
  const days = [...round.days.filter((day) => day.date !== offer.endedOn), restored, todayLog]
    .sort((a, b) => a.date.localeCompare(b.date))
  const continued: Round = {
    id: round.id,
    startedOn: round.startedOn,
    days,
    sealedCount: countSealed(days),
  }
  const next: AppState = {
    ...state,
    notice: null,
    history: state.history.filter((entry) => entry.id !== round.id),
    current: continued,
  }
  if (countSealed(days.filter((day) => day.date < today)) >= ROUND_LENGTH) {
    return completeRound(next, offer.endedOn)
  }
  return updateToday(next, today, (day) => day)
}

function missedRound(state: AppState, endedOn: string): Round | undefined {
  return state.history.find((round) => round.endReason === "missed" && round.endedOn === endedOn)
}

export function dismissNotice(state: AppState): AppState {
  if (!state.notice) return state
  return { ...state, notice: null }
}

export function dismissHomeHint(state: AppState): AppState {
  if (state.homeScreenHintDismissed) return state
  return { ...state, homeScreenHintDismissed: true }
}

export function toggleTreat(state: AppState, today: string): AppState {
  const week = weekStart(today)
  const base = state.treat.weekStart === week ? state.treat : { weekStart: week, used: false }
  return { ...state, treat: { weekStart: week, used: !base.used } }
}

export function startAnother(state: AppState, today: string): AppState {
  if (state.current.endReason !== "completed") return state
  return {
    ...state,
    current: newRound(today),
    notice: null,
    treat: refreshTreat(state.treat, today),
  }
}

export function settle(state: AppState, today: string): AppState {
  if (!isDateKey(today)) return state

  const treat = refreshTreat(state.treat, today)
  let next = treat === state.treat ? state : { ...state, treat }

  if (next.current.endReason === "completed") return next
  if (today < next.current.startedOn) return next

  const yesterday = addDays(today, -1)
  if (next.current.startedOn <= yesterday) {
    const missed = firstGap(next.current, yesterday)
    if (missed) {
      const ended = finishRound(next.current, missed, "missed")
      return {
        ...next,
        current: newRound(today),
        history: [ended, ...next.history],
        best: Math.max(next.best, ended.sealedCount),
        notice: resetNotice(ended.sealedCount, missed),
      }
    }
  }

  const sealedBeforeToday = countSealed(next.current.days.filter((day) => day.date < today))
  if (sealedBeforeToday >= ROUND_LENGTH) {
    return completeRound(next, sealedDayBefore(next.current, today) ?? next.current.startedOn)
  }

  const days = ensureToday(next.current.days, today)
  const sealedCount = countSealed(days)
  if (days !== next.current.days || sealedCount !== next.current.sealedCount) {
    next = { ...next, current: { ...next.current, days, sealedCount } }
  }

  return updateToday(next, today, (day) => day)
}

export function updateToday(
  state: AppState,
  today: string,
  recipe: (day: DayLog) => DayLog,
): AppState {
  if (state.current.endReason === "completed") return state
  const index = state.current.days.findIndex((day) => day.date === today)
  if (index < 0) return state

  const currentDay = state.current.days[index]
  const edited = recipe(currentDay)
  const nextDay: DayLog = {
    date: today,
    checks: edited.checks,
    values: edited.values,
    sealed: allRequiredMet(edited, state.settings),
  }
  const days = sameDay(currentDay, nextDay)
    ? state.current.days
    : state.current.days.map((day, dayIndex) => (dayIndex === index ? nextDay : day))
  const sealedCount = countSealed(days)

  if (nextDay.sealed && sealedCount >= ROUND_LENGTH) {
    const endedOn = today
    const base = days === state.current.days ? state : { ...state, current: { ...state.current, days, sealedCount } }
    return completeRound(base, endedOn)
  }

  if (days === state.current.days) return state
  return { ...state, current: { ...state.current, days, sealedCount } }
}

function completeRound(state: AppState, endedOn: string): AppState {
  const ended: Round = { ...finishRound(state.current, endedOn, "completed"), sealedCount: ROUND_LENGTH }
  const alreadyKept = state.history.some((round) => round.id === ended.id)
  const notice: Notice = state.notice?.kind === "completed"
    ? state.notice
    : { kind: "completed", sealedCount: ROUND_LENGTH, endedOn }
  return {
    ...state,
    current: ended,
    history: alreadyKept ? state.history : [ended, ...state.history],
    best: Math.max(state.best, ROUND_LENGTH),
    notice,
  }
}

function finishRound(round: Round, endedOn: string, endReason: RoundEnd): Round {
  return {
    ...round,
    endedOn,
    endReason,
    sealedCount: countSealed(round.days),
  }
}

function resetNotice(sealedCount: number, endedOn: string): Notice {
  return { kind: "reset", sealedCount, endedOn }
}

function refreshTreat(treat: Treat, today: string): Treat {
  const week = weekStart(today)
  if (treat.weekStart === week) return treat
  return { weekStart: week, used: false }
}

function firstGap(round: Round, yesterday: string): string | null {
  let cursor = round.startedOn
  while (cursor <= yesterday) {
    const log = round.days.find((day) => day.date === cursor)
    if (!log?.sealed) return cursor
    cursor = addDays(cursor, 1)
  }
  return null
}

function sealedDayBefore(round: Round, today: string): string | null {
  const match = [...round.days].reverse().find((day) => day.sealed && day.date < today)
  return match?.date ?? null
}

function ensureToday(days: DayLog[], today: string): DayLog[] {
  if (days.some((day) => day.date === today)) return days
  return [...days, emptyDay(today)]
}

function countSealed(days: DayLog[]): number {
  return days.reduce((count, day) => count + (day.sealed ? 1 : 0), 0)
}

function sameDay(a: DayLog, b: DayLog): boolean {
  return a.date === b.date
    && a.sealed === b.sealed
    && sameRecord(a.checks, b.checks)
    && sameRecord(a.values, b.values)
}

function sameRecord(
  left: Partial<Record<HabitId, boolean | number>>,
  right: Partial<Record<HabitId, boolean | number>>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key as HabitId] === right[key as HabitId])
}
