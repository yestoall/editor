//· lists tests ·
// Las listas al escribir, sobre un EditorState sin DOM.

import { EditorSelection, EditorState } from "@codemirror/state"
import { describe, expect, test } from "bun:test"

import type { TransactionSpec } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

import { continueList, LIST_COMMANDS, removeEmptyItem } from "./lists"

// el texto con el cursor en «|»
const at = (marked: string) =>
  EditorState.create({ doc: marked.replace("|", ""), selection: EditorSelection.cursor(marked.indexOf("|")) })

// lo que queda, con el cursor en «|»; null si la tecla sigue la de serie
const run = (make: typeof continueList, marked: string) => {
  const state = at(marked)
  const spec = make(state)
  if (!spec) return null
  const next = state.update(spec).state
  const head = next.selection.main.head
  return next.doc.toString().slice(0, head) + "|" + next.doc.toString().slice(head)
}

describe("Intro en una lista", () => {
  test("sigue la viñeta", () => {
    expect(run(continueList, "- leche|")).toBe("- leche\n- |")
    expect(run(continueList, "* pan|")).toBe("* pan\n* |")
    expect(run(continueList, "• huevos|")).toBe("• huevos\n• |")
  })

  test("las numeradas, con el número siguiente", () => {
    expect(run(continueList, "1. uno|")).toBe("1. uno\n2. |")
    expect(run(continueList, "9) nueve|")).toBe("9) nueve\n10) |")
  })

  test("con su sangría y sus espacios", () => {
    expect(run(continueList, "  - dentro|")).toBe("  - dentro\n  - |")
  })

  test("a mitad de línea, lo de detrás baja a la nueva con su viñeta", () => {
    expect(run(continueList, "- leche| y pan")).toBe("- leche\n- | y pan")
  })

  test("en una viñeta vacía, la quita y la lista se cierra", () => {
    expect(run(continueList, "- leche\n- |")).toBe("- leche\n|")
    // sin el espacio, que el teclado del iPhone se come al pulsar Intro
    expect(run(continueList, "- leche\n-|")).toBe("- leche\n|")
    expect(run(continueList, "1. uno\n2.|")).toBe("1. uno\n|")
    expect(run(continueList, "- leche\n  - |")).toBe("- leche\n|")
  })

  test("sin lista, o antes de la viñeta, el Intro de siempre", () => {
    expect(run(continueList, "texto|")).toBeNull()
    expect(run(continueList, "|- leche")).toBeNull()
    expect(run(continueList, "-sin espacio|")).toBeNull()
    expect(run(continueList, "1.5 litros|")).toBeNull()
  })
})

describe("Borrar en una viñeta vacía", () => {
  test("justo detrás, la quita entera", () => {
    expect(run(removeEmptyItem, "- leche\n- |")).toBe("- leche\n|")
    expect(run(removeEmptyItem, "- leche\n2. |")).toBe("- leche\n|")
    expect(run(removeEmptyItem, "- leche\n-|")).toBe("- leche\n|")
  })

  test("con texto, o en otro sitio, el Borrar de siempre", () => {
    expect(run(removeEmptyItem, "- leche|")).toBeNull()
    expect(run(removeEmptyItem, "texto|")).toBeNull()
  })
})

// Mientras el modelo del iPhone piensa (rewrite) el editor está en solo
// lectura, pero iOS vuelve a lanzar Intro y Borrar como teclas sintéticas que
// llegan al keymap: las listas no deben tocar el texto
describe("en solo lectura", () => {
  test("Intro y Borrar dejan la tecla a la de serie, sin tocar el texto", () => {
    for (const [command, marked] of [
      [LIST_COMMANDS.enter, "- algo|"],
      [LIST_COMMANDS.backspace, "- algo\n- |"],
    ] as const) {
      let state = EditorState.create({
        doc: marked.replace("|", ""),
        extensions: [EditorState.readOnly.of(true)],
        selection: EditorSelection.cursor(marked.indexOf("|")),
      })
      const before = state.doc.toString()
      const view = { state, dispatch: (spec: TransactionSpec) => (state = state.update(spec).state) } as unknown as EditorView
      expect(command(view)).toBe(false)
      expect(state.doc.toString()).toBe(before)
    }
  })
})
