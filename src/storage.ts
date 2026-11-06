import { weekStart } from "./dates.ts"
import { freshState, settle } from "./streak.ts"
import {
  HABIT_IDS,
  type AppState,
  type DayLog,
  type HabitId,
  type Notice,
  type Round,
  type Settings,
  type Treat,
} from "./types.ts"

const STORAGE_KEY = "seventy-five-v1"

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadState(storage: StorageLike, today: string): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return freshState(today)
    return settle(parseState(JSON.parse(raw), today), today)
  } catch {
    return freshState(today)
  }
}

export function saveState(storage: StorageLike, state: AppState): void {
  storage.setItem(STORAGE_KEY, exportState(state))
}

export function exportState(state: AppState): string {
  return JSON.stringify(state)
}

export function importState(json: string, today: string): AppState {
  return settle(parseState(JSON.parse(json), today), today)
}

function parseState(value: unknown, today: string): AppState {
  if (!value || typeof value !== "object") throw new Error("Invalid backup")
  const raw = value as Partial<AppState>
  if (!raw.current) throw new Error("Invalid backup")
  return {
    settings: parseSettings(raw.settings),
    onboarded: raw.onboarded === true,
    current: parseRound(raw.current),
    history: Array.isArray(raw.history) ? raw.history.slice(0, 100).map(parseRound) : [],
    best: typeof raw.best === "number" && raw.best >= 0 ? Math.min(75, Math.floor(raw.best)) : 0,
    treat: parseTreat(raw.treat, today),
    homeScreenHintDismissed: raw.homeScreenHintDismissed === true,
    notice: parseNotice(raw.notice),
  }
}

function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") throw new Error("Invalid settings")
  const raw = value as Partial<Settings>
  return {
    calorieTarget: raw.calorieTarget == null ? null : requireGoal(raw.calorieTarget, 20000),
    proteinMin: requireGoal(raw.proteinMin, 500),
    stepGoal: requireGoal(raw.stepGoal, 200000),
    waterMl: requireGoal(raw.waterMl, 8000),
    pages: requireGoal(raw.pages, 80),
  }
}

function requireGoal(value: unknown, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error("Invalid goal")
  }
  return value
}

function parseRound(value: unknown): Round {
  if (!value || typeof value !== "object") throw new Error("Invalid round")
  const raw = value as Partial<Round>
  if (typeof raw.id !== "string" || typeof raw.startedOn !== "string" || !Array.isArray(raw.days)) {
    throw new Error("Invalid round")
  }
  if (raw.days.length > 80) throw new Error("Invalid round")
  const endReason = raw.endReason === "missed" || raw.endReason === "completed" ? raw.endReason : undefined
  return {
    id: raw.id,
    startedOn: raw.startedOn,
    days: raw.days.map(parseDay),
    sealedCount: typeof raw.sealedCount === "number" ? raw.sealedCount : 0,
    endedOn: typeof raw.endedOn === "string" ? raw.endedOn : undefined,
    endReason,
  }
}

function parseDay(value: unknown): DayLog {
  if (!value || typeof value !== "object") throw new Error("Invalid day")
  const raw = value as Partial<DayLog>
  if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error("Invalid day")
  return {
    date: raw.date,
    checks: parseChecks(raw.checks),
    values: parseValues(raw.values),
    sealed: raw.sealed === true,
  }
}

function parseChecks(value: unknown): DayLog["checks"] {
  if (!value || typeof value !== "object") return {}
  const checks: DayLog["checks"] = {}
  for (const id of HABIT_IDS) {
    if ((value as Partial<Record<HabitId, unknown>>)[id] === true) checks[id] = true
    if ((value as Partial<Record<HabitId, unknown>>)[id] === false) checks[id] = false
  }
  return checks
}

function parseValues(value: unknown): DayLog["values"] {
  if (!value || typeof value !== "object") return {}
  const values: DayLog["values"] = {}
  for (const id of HABIT_IDS) {
    const entry = (value as Partial<Record<HabitId, unknown>>)[id]
    if (typeof entry === "number" && Number.isFinite(entry) && entry >= 0) values[id] = entry
  }
  return values
}

function parseTreat(value: unknown, today: string): Treat {
  if (!value || typeof value !== "object") return { weekStart: weekStart(today), used: false }
  const raw = value as Partial<Treat>
  if (typeof raw.weekStart !== "string") return { weekStart: weekStart(today), used: false }
  return { weekStart: raw.weekStart, used: raw.used === true }
}

function parseNotice(value: unknown): Notice | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Partial<Notice>
  if (raw.kind !== "reset" && raw.kind !== "completed") return null
  if (typeof raw.sealedCount !== "number" || typeof raw.endedOn !== "string") return null
  return { kind: raw.kind, sealedCount: raw.sealedCount, endedOn: raw.endedOn }
}
