export const ROUND_LENGTH = 75

export const HABIT_IDS = [
  "workout",
  "steps",
  "water",
  "calories",
  "tea",
  "lemon",
  "milky",
  "sugar",
  "snacks",
  "reading",
  "fermented",
  "protein",
  "natural",
] as const

export type HabitId = (typeof HABIT_IDS)[number]

export interface Settings {
  calorieTarget: number | null
  proteinMin: number
  stepGoal: number
  waterMl: number
  pages: number
}

export interface DayLog {
  date: string
  checks: Partial<Record<HabitId, boolean>>
  values: Partial<Record<HabitId, number>>
  sealed: boolean
}

export type RoundEnd = "missed" | "completed"

export interface Round {
  id: string
  startedOn: string
  days: DayLog[]
  sealedCount: number
  endedOn?: string
  endReason?: RoundEnd
}

export interface Treat {
  weekStart: string
  used: boolean
}

export interface Notice {
  kind: "reset" | "completed"
  sealedCount: number
  endedOn: string
}

export interface AppState {
  settings: Settings
  onboarded: boolean
  current: Round
  history: Round[]
  best: number
  treat: Treat
  homeScreenHintDismissed: boolean
  notice: Notice | null
}
