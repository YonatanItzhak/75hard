import { describe, expect, it } from "vitest"
import { exportState, importState, loadState, saveState, type StorageLike } from "./storage.ts"
import { defaultSettings, freshState, setCheck, setValue } from "./streak.ts"

function memory(initial?: string): StorageLike & { raw(): string | null } {
  const values = new Map<string, string>()
  if (initial != null) values.set("seventy-five-v1", initial)
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    raw() {
      return values.get("seventy-five-v1") ?? null
    },
  }
}

describe("storage", () => {
  it("round-trips a day of progress", () => {
    const today = "2026-11-06"
    let state = freshState(today)
    state = {
      ...state,
      onboarded: true,
      settings: { ...defaultSettings(), calorieTarget: 1800 },
    }
    state = setCheck(state, today, "workout", true)
    state = setValue(state, today, "tea", 4)
    const store = memory()
    saveState(store, state)

    expect(loadState(store, today)).toEqual(state)
    expect(importState(exportState(state), today)).toEqual(state)
  })

  it("starts clean when the saved data is unusable", () => {
    const today = "2026-11-06"
    const loaded = loadState(memory("{"), today)
    expect(loaded.onboarded).toBe(false)
    expect(loaded.current.startedOn).toBe(today)
    expect(loaded.current.sealedCount).toBe(0)
  })

  it("rejects a backup that is not a round", () => {
    expect(() => importState("{}", "2026-11-06")).toThrow()
    expect(() => importState("null", "2026-11-06")).toThrow()
  })
})