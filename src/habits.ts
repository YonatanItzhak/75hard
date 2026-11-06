import type { DayLog, HabitId, Settings } from "./types.ts"

export const WATER_POUR_ML = 250

export type HabitControl = "toggle" | "number" | "water" | "stepper"

export interface HabitDef {
  id: HabitId
  title: string
  kind: "check" | "count"
  control: HabitControl
  max: number
}

export const HABITS: HabitDef[] = [
  { id: "workout", title: "Workout", kind: "check", control: "toggle", max: 1 },
  { id: "steps", title: "Steps", kind: "count", control: "number", max: 200000 },
  { id: "water", title: "Water", kind: "count", control: "water", max: 8000 },
  { id: "calories", title: "Calories", kind: "count", control: "number", max: 20000 },
  { id: "tea", title: "Tea", kind: "count", control: "stepper", max: 30 },
  { id: "lemon", title: "Lemon and ginger", kind: "check", control: "toggle", max: 1 },
  { id: "milky", title: "A milky drink", kind: "check", control: "toggle", max: 1 },
  { id: "sugar", title: "No processed sugar", kind: "check", control: "toggle", max: 1 },
  { id: "snacks", title: "Simple snacks", kind: "check", control: "toggle", max: 1 },
  { id: "reading", title: "Read", kind: "count", control: "stepper", max: 80 },
  { id: "fermented", title: "Fermented food", kind: "check", control: "toggle", max: 1 },
  { id: "protein", title: "Protein", kind: "count", control: "number", max: 500 },
  { id: "natural", title: "Natural foods", kind: "check", control: "toggle", max: 1 },
]

const HABIT_BY_ID = new Map(HABITS.map((habit) => [habit.id, habit]))

export function habitById(id: HabitId): HabitDef {
  const habit = HABIT_BY_ID.get(id)
  if (!habit) throw new Error(`Unknown habit ${id}`)
  return habit
}

export function formatWater(ml: number): string {
  const liters = ml / 1000
  if (Number.isInteger(liters)) return String(liters)
  return liters.toFixed(2).replace(/0$/, "")
}

export function habitDetail(id: HabitId, settings: Settings): string {
  switch (id) {
    case "workout":
      return "Even 10 minutes"
    case "steps":
      return `${settings.stepGoal.toLocaleString("en-US")} or more`
    case "water":
      return `${formatWater(settings.waterMl)} liters or more`
    case "calories":
      return settings.calorieTarget
        ? `At or under ${settings.calorieTarget.toLocaleString("en-US")}`
        : "Set your target"
    case "tea":
      return "Cups today. One seals the day."
    case "lemon":
      return "Hot water, every day"
    case "milky":
      return "Coffee, matcha, or similar"
    case "sugar":
      return "None today"
    case "snacks":
      return "Only tea, vegetables, or a fruit"
    case "reading":
      return `Done at ${settings.pages} pages`
    case "fermented":
      return "Something for your gut"
    case "protein":
      return `Aim ${settings.proteinMin}–${settings.proteinMin + 10} g`
    case "natural":
      return "As much as you can"
  }
}

export function goalFor(id: HabitId, settings: Settings): number | null {
  switch (id) {
    case "steps":
      return settings.stepGoal
    case "water":
      return settings.waterMl
    case "calories":
      return settings.calorieTarget
    case "reading":
      return settings.pages
    case "protein":
      return settings.proteinMin
    case "tea":
      return 1
    default:
      return 1
  }
}

export function itemProgress(id: HabitId, day: DayLog, settings: Settings): number {
  const habit = habitById(id)
  if (habit.kind === "check") return day.checks[id] ? 1 : 0

  const goal = goalFor(id, settings)
  const value = day.values[id] ?? 0
  // Under the target counts. Going over does not, and an empty log does not.
  if (id === "calories") {
    if (goal == null || goal <= 0) return 0
    return value > 0 && value <= goal ? 1 : 0
  }
  if (goal == null || goal <= 0) return 0
  if (value >= goal) return 1
  if (value <= 0) return 0
  return value / goal
}

export function dayProgress(day: DayLog, settings: Settings): number {
  const total = HABITS.reduce((sum, habit) => sum + itemProgress(habit.id, day, settings), 0)
  return total / HABITS.length
}

export function allRequiredMet(day: DayLog, settings: Settings): boolean {
  return HABITS.every((habit) => itemProgress(habit.id, day, settings) >= 1)
}
