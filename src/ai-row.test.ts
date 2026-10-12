//· ai-row tests ·
// La fila del ✦ (iPhone y Mac) y sus atajos, sin pantalla.

import { describe, expect, test } from "bun:test"

import { type AiRow, nextRow, rewriteShortcut } from "./ai-row"
import { FAILURE_MESSAGES } from "./rewrite"

const CLOSED: AiRow = { kind: "closed" }
const MODES: AiRow = { kind: "modes" }
const BUSY: AiRow = { kind: "busy", mode: "fix" }
const MESSAGE: AiRow = { kind: "message", text: "algo" }

const key = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
})

describe("rewriteShortcut", () => {
  test("⌘⇧C corrige y ⌘⇧A aclara, con la tecla como llega con ⇧", () => {
    expect(rewriteShortcut(key("C", { metaKey: true, shiftKey: true }))).toBe("fix")
    expect(rewriteShortcut(key("c", { metaKey: true, shiftKey: true }))).toBe("fix")
    expect(rewriteShortcut(key("A", { metaKey: true, shiftKey: true }))).toBe("clarify")
  })
  test("sin ⌘ o sin ⇧, nada: ⌘C copia y ⇧C escribe", () => {
    expect(rewriteShortcut(key("c", { metaKey: true }))).toBeNull()
    expect(rewriteShortcut(key("C", { shiftKey: true }))).toBeNull()
    expect(rewriteShortcut(key("x", { metaKey: true, shiftKey: true }))).toBeNull()
  })
})

describe("nextRow", () => {
  test("lanzar un modo la pone a trabajar, abierta o cerrada", () => {
    for (const row of [CLOSED, MODES, MESSAGE])
      expect(nextRow(row, { type: "start", mode: "clarify" }, "ready")).toEqual({ kind: "busy", mode: "clarify" })
  })
  test("ocupada, no lanza otra ni se cierra", () => {
    expect(nextRow(BUSY, { type: "start", mode: "clarify" }, "ready")).toBe(BUSY)
    expect(nextRow(BUSY, { type: "toggle" }, "ready")).toBe(BUSY)
    expect(nextRow(BUSY, { type: "close" }, "ready")).toBe(BUSY)
  })
  test("con el modelo sin preparar, dice por qué en vez de lanzar", () => {
    const notReady: AiRow = { kind: "message", text: FAILURE_MESSAGES.notReady }
    expect(nextRow(CLOSED, { type: "start", mode: "fix" }, "notReady")).toEqual(notReady)
    expect(nextRow(CLOSED, { type: "toggle" }, "notReady")).toEqual(notReady)
  })
  test("bien o sin nada que hacer, se cierra; mal, el aviso", () => {
    expect(nextRow(BUSY, { type: "result", result: { ok: true, text: "Hola" } }, "ready")).toEqual(CLOSED)
    expect(nextRow(BUSY, { type: "result", result: null }, "ready")).toEqual(CLOSED)
    expect(nextRow(BUSY, { type: "result", result: { ok: false, reason: "tooLong" } }, "ready")).toEqual({
      kind: "message",
      text: FAILURE_MESSAGES.tooLong,
    })
  })
  test("el ✦ abre los modos y los vuelve a cerrar", () => {
    expect(nextRow(CLOSED, { type: "toggle" }, "ready")).toEqual(MODES)
    expect(nextRow(MODES, { type: "toggle" }, "ready")).toEqual(CLOSED)
    expect(nextRow(MESSAGE, { type: "toggle" }, "ready")).toEqual(CLOSED)
  })
})
