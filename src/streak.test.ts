import { describe, expect, it } from "vitest"
import { addDays, weekStart } from "./dates.ts"
import { HABITS, allRequiredMet, dayProgress, goalFor, itemProgress } from "./habits.ts"
import {
  defaultSettings,
  emptyDay,
  freshState,
  newRound,
  resetCopy,
  restoreOffer,
  restoreYesterday,
  roundPosition,
  setCheck,
  settle,
  startAnother,
  toggleTreat,
  updateToday,
} from "./streak.ts"
import type { AppState, DayLog, HabitId, Settings } from "./types.ts"

const today = "2026-11-06"

function settings(): Settings {
  return { ...defaultSettings(), calorieTarget: 1800 }
}

function fill(day: DayLog, goals: Settings, overrides: Partial<Record<HabitId, number | boolean>> = {}): DayLog {
  const checks = { ...day.checks }
  const values = { ...day.values }
  for (const habit of HABITS) {
    if (habit.kind === "check") checks[habit.id] = true
    else values[habit.id] = goalFor(habit.id, goals) ?? 1
  }
  for (const [id, value] of Object.entries(overrides) as Array<[HabitId, number | boolean]>) {
    if (typeof value === "boolean") checks[id] = value
    else values[id] = value
  }
  return { ...day, checks, values }
}

function seal(state: AppState, date: string, goals = settings(), overrides?: Partial<Record<HabitId, number | boolean>>) {
  return updateToday(state, date, (day) => fill(day, goals, overrides))
}

describe("dates", () => {
  it("keeps weeks starting on Monday", () => {
    expect(weekStart("2026-11-06")).toBe("2026-11-02")
    expect(weekStart("2026-11-02")).toBe("2026-11-02")
    expect(weekStart("2026-11-08")).toBe("2026-11-02")
    expect(weekStart("2026-11-09")).toBe("2026-11-09")
  })

  it("crosses month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01")
  })
})

describe("daily progress", () => {
  it("has 13 required habits and leaves the treat out of them", () => {
    expect(HABITS).toHaveLength(13)
    expect(HABITS.some((habit) => habit.id === ("treat" as HabitId))).toBe(false)
  })

  it("gives a half-done counter half of its share", () => {
    const day = emptyDay(today)
    day.values.steps = 6000
    expect(itemProgress("steps", day, settings())).toBeCloseTo(0.6)
    expect(dayProgress(day, settings())).toBeCloseTo(0.6 / 13)
  })

  it("seals calories only inside the target", () => {
    const goals = settings()
    const under = emptyDay(today)
    under.values.calories = 1500
    const exact = emptyDay(today)
    exact.values.calories = 1800
    const over = emptyDay(today)
    over.values.calories = 1801
    const empty = emptyDay(today)
    const noTarget = emptyDay(today)
    noTarget.values.calories = 1500

    expect(itemProgress("calories", under, goals)).toBe(1)
    expect(itemProgress("calories", exact, goals)).toBe(1)
    expect(itemProgress("calories", over, goals)).toBe(0)
    expect(itemProgress("calories", empty, goals)).toBe(0)
    expect(itemProgress("calories", noTarget, defaultSettings())).toBe(0)
  })

  it("records tea by the cup and seals at one", () => {
    const none = emptyDay(today)
    const one = emptyDay(today)
    one.values.tea = 1
    const many = emptyDay(today)
    many.values.tea = 6
    expect(itemProgress("tea", none, settings())).toBe(0)
    expect(itemProgress("tea", one, settings())).toBe(1)
    expect(itemProgress("tea", many, settings())).toBe(1)
  })

  it("seals protein at the minimum, including above the aim", () => {
    const day = emptyDay(today)
    day.values.protein = 85
    expect(itemProgress("protein", day, settings())).toBe(1)
  })

  it("seals a day only when every required habit is met", () => {
    const goals = settings()
    let state = { ...freshState(today), settings: goals, onboarded: true }
    state = seal(state, today, goals, { workout: false })
    expect(state.current.days[0]?.sealed).toBe(false)
    expect(state.current.sealedCount).toBe(0)

    state = setCheck(state, today, "workout", true)
    expect(state.current.days[0]?.sealed).toBe(true)
    expect(state.current.sealedCount).toBe(1)
    expect(roundPosition(state.current, today)).toEqual({ dayNumber: 1, toGo: 74, todaySealed: true })

    state = setCheck(state, today, "workout", false)
    expect(state.current.days[0]?.sealed).toBe(false)
    expect(state.current.sealedCount).toBe(0)
    expect(roundPosition(state.current, today)).toEqual({ dayNumber: 1, toGo: 75, todaySealed: false })
  })
})

describe("settle", () => {
  it("is stable when nothing has changed", () => {
    const state = freshState(today)
    expect(settle(state, today)).toBe(state)
  })

  it("carries a sealed day into the next morning", () => {
    const goals = settings()
    const monday = "2026-11-02"
    let state = { ...freshState(monday), settings: goals, onboarded: true }
    state = seal(state, monday)
    const tuesday = settle(state, "2026-11-03")

    expect(tuesday.history).toHaveLength(0)
    expect(tuesday.current.sealedCount).toBe(1)
    expect(tuesday.current.days.map((day) => day.date)).toEqual(["2026-11-02", "2026-11-03"])
    expect(roundPosition(tuesday.current, "2026-11-03")).toEqual({
      dayNumber: 2,
      toGo: 74,
      todaySealed: false,
    })
    expect(settle(tuesday, "2026-11-03")).toBe(tuesday)
  })

  it("resets the round when a day was missed", () => {
    const goals = settings()
    const monday = "2026-11-02"
    let state = { ...freshState(monday), settings: goals, onboarded: true }
    state = seal(state, monday)
    const wednesday = settle(state, "2026-11-04")

    expect(wednesday.current.startedOn).toBe("2026-11-04")
    expect(wednesday.current.sealedCount).toBe(0)
    expect(wednesday.history[0]).toMatchObject({
      sealedCount: 1,
      endReason: "missed",
      endedOn: "2026-11-03",
    })
    expect(wednesday.notice).toEqual({ kind: "reset", sealedCount: 1, endedOn: "2026-11-03" })
    expect(wednesday.best).toBe(1)
    expect(resetCopy(1)).toBe("This round ended on day 1. Today starts a new 75.")
    expect(settle(wednesday, "2026-11-04")).toBe(wednesday)
  })

  it("resets even if the app was never opened for the missed day", () => {
    const state = freshState("2026-11-02")
    const later = settle(state, "2026-11-04")
    expect(later.current.startedOn).toBe("2026-11-04")
    expect(later.history[0]?.sealedCount).toBe(0)
    expect(resetCopy(0)).toBe("Yesterday wasn't finished. Today starts a new 75.")
  })

  it("lets her restore yesterday and keep the round going", () => {
    const goals = settings()
    const monday = "2026-11-02"
    const tuesday = "2026-11-03"
    const wednesday = "2026-11-04"
    let state = { ...freshState(monday), settings: goals, onboarded: true }
    state = seal(state, monday)
    state = settle(state, tuesday)
    state = setCheck(state, tuesday, "workout", true)
    state = settle(state, wednesday)

    const offer = restoreOffer(state, wednesday)
    expect(offer?.endedOn).toBe(tuesday)
    expect(offer?.missed).toContain("steps")
    expect(offer?.missed).not.toContain("workout")

    state = setCheck(state, wednesday, "workout", true)
    const restored = restoreYesterday(state, wednesday)
    expect(restored.notice).toBeNull()
    expect(restored.current.startedOn).toBe(monday)
    expect(restored.current.sealedCount).toBe(2)
    expect(restored.current.days.find((day) => day.date === tuesday)?.sealed).toBe(true)
    expect(restored.current.days.find((day) => day.date === wednesday)?.checks.workout).toBe(true)
    expect(restored.current.days.find((day) => day.date === wednesday)?.sealed).toBe(false)
    expect(restored.history.some((round) => round.endReason === "missed")).toBe(false)
    expect(roundPosition(restored.current, wednesday)).toEqual({
      dayNumber: 3,
      toGo: 73,
      todaySealed: false,
    })
    expect(settle(restored, wednesday)).toBe(restored)
    expect(restoreYesterday(restored, wednesday)).toBe(restored)
  })

  it("does not restore a gap longer than yesterday", () => {
    const goals = settings()
    let state = { ...freshState("2026-11-02"), settings: goals, onboarded: true }
    state = seal(state, "2026-11-02")
    state = settle(state, "2026-11-06")
    expect(restoreOffer(state, "2026-11-06")).toBeNull()
  })

  it("finishes the round when the restored day is day 75", () => {
    const goals = settings()
    const start = "2026-01-01"
    const missed = addDays(start, 74)
    const opened = addDays(start, 75)
    const days = Array.from({ length: 74 }, (_, index) => {
      const done = fill(emptyDay(addDays(start, index)), goals)
      return { ...done, sealed: true }
    })
    const state: AppState = {
      ...freshState(opened),
      settings: goals,
      onboarded: true,
      history: [{
        id: "run",
        startedOn: start,
        days,
        sealedCount: 74,
        endedOn: missed,
        endReason: "missed",
      }],
      notice: { kind: "reset", sealedCount: 74, endedOn: missed },
      current: newRound(opened),
    }
    expect(restoreOffer(state, opened)?.missed).toHaveLength(13)
    const restored = restoreYesterday(state, opened)
    expect(restored.current.endReason).toBe("completed")
    expect(restored.current.sealedCount).toBe(75)
    expect(restored.notice?.kind).toBe("completed")
  })

  it("keeps the best round after a shorter one", () => {
    const goals = settings()
    let state = { ...freshState("2026-11-02"), settings: goals, onboarded: true }
    state = seal(state, "2026-11-02")
    state = settle(state, "2026-11-03")
    state = seal(state, "2026-11-03")
    state = settle(state, "2026-11-05")
    expect(state.best).toBe(2)

    state = seal(state, "2026-11-05")
    state = settle(state, "2026-11-07")
    expect(state.best).toBe(2)
    expect(state.history).toHaveLength(2)
    expect(state.history[0]?.sealedCount).toBe(1)
  })
})

describe("the weekly treat", () => {
  it("does not change the seal or the daily bar", () => {
    const goals = settings()
    let state = { ...freshState(today), settings: goals, onboarded: true }
    state = seal(state, today)
    const progress = dayProgress(state.current.days[0]!, goals)
    const used = toggleTreat(state, today)

    expect(progress).toBe(1)
    expect(used.current).toBe(state.current)
    expect(used.treat.used).toBe(true)
    expect(allRequiredMet(used.current.days[0]!, goals)).toBe(true)
    expect(settle(used, today)).toBe(used)
  })

  it("becomes available again on Monday without breaking a sealed run", () => {
    const goals = settings()
    const friday = "2026-11-06"
    let state = { ...freshState(friday), settings: goals, onboarded: true }
    state = seal(state, friday)
    state = toggleTreat(state, friday)
    state = settle(state, "2026-11-07")
    state = seal(state, "2026-11-07")
    state = settle(state, "2026-11-08")
    state = seal(state, "2026-11-08")

    const monday = settle(state, "2026-11-09")
    expect(monday.current.endReason).toBeUndefined()
    expect(monday.current.sealedCount).toBe(3)
    expect(monday.treat).toEqual({ weekStart: "2026-11-09", used: false })
  })
})

describe("finishing 75 days", () => {
  it("waits instead of starting the next round", () => {
    const goals = settings()
    const start = "2026-01-01"
    const last = addDays(start, 74)
    const days = Array.from({ length: 74 }, (_, index) => {
      const date = addDays(start, index)
      const done = fill(emptyDay(date), goals)
      return { ...done, sealed: allRequiredMet(done, goals) }
    })
    days.push(emptyDay(last))
    let state: AppState = {
      ...freshState(last),
      settings: goals,
      onboarded: true,
      current: { id: "run", startedOn: start, days, sealedCount: 74 },
    }

    expect(days.every((day, index) => index === 74 || day.sealed)).toBe(true)
    state = seal(state, last)
    expect(state.current.endReason).toBe("completed")
    expect(state.current.sealedCount).toBe(75)
    expect(state.best).toBe(75)
    expect(state.notice?.kind).toBe("completed")
    expect(roundPosition(state.current, last)).toEqual({ dayNumber: 75, toGo: 0, todaySealed: true })

    const tomorrow = settle(state, addDays(last, 1))
    expect(tomorrow.current).toBe(state.current)
    expect(tomorrow.history).toHaveLength(1)

    const another = startAnother(tomorrow, addDays(last, 1))
    expect(another.current.endReason).toBeUndefined()
    expect(another.current.startedOn).toBe(addDays(last, 1))
    expect(another.current.sealedCount).toBe(0)
    expect(another.history).toHaveLength(1)
  })

  it("completes a finished round opened the next day", () => {
    const goals = settings()
    const start = "2026-01-01"
    const days = Array.from({ length: 75 }, (_, index) => {
      const done = fill(emptyDay(addDays(start, index)), goals)
      return { ...done, sealed: true }
    })
    const state: AppState = {
      ...freshState(addDays(start, 75)),
      settings: goals,
      onboarded: true,
      current: { id: "run", startedOn: start, days, sealedCount: 75 },
    }
    const settled = settle(state, addDays(start, 75))
    expect(settled.current.endReason).toBe("completed")
    expect(settled.current.days).toHaveLength(75)
    expect(settled.current.sealedCount).toBe(75)
    expect(settle(settled, addDays(start, 75))).toBe(settled)
  })
})
