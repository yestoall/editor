//· gray-correction-extension tests ·
// La corrección en gris en el editor, sin DOM: el espacio deja la propuesta,
// Tab la pone, seguir escribiendo la deja y el «¿» pone la tilde.

import { history, undo } from "@codemirror/commands"
import { EditorSelection, EditorState, type Transaction, type TransactionSpec } from "@codemirror/state"
import { type DecorationSet, EditorView } from "@codemirror/view"
import { describe, expect, test } from "bun:test"

import type { Lexicon } from "./gray-correction"
import { acceptGrayCorrection, grayCorrection, leftWordIn } from "./gray-correction-extension"

// navegacion → navegación; queiro → quiero; todo lo demás existe
const lexicon: Lexicon = {
  isWord: (w) => !["navegacion", "queiro"].includes(w),
  count: () => 1_000_000,
  accented: () => [],
  accentVariants: (w) => (w === "navegacion" ? ["navegación"] : []),
  suggest: (w) => (w === "queiro" ? [{ term: "quiero", distance: 1, count: 5_000_000 }] : []),
}

const create = (doc: string, known: string[] = [], ready = true) =>
  EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.length),
    extensions: [
      history(),
      grayCorrection({ lexicon: () => (ready ? lexicon : null), known: () => new Set(known), onLeave: () => {}, onAccept: () => {} }),
    ],
  })

// escribir como en el teclado: cada letra, su transacción
const type = (state: EditorState, text: string) => {
  for (const char of text) {
    const at = state.selection.main.head
    state = state.update({ changes: { from: at, insert: char }, selection: EditorSelection.cursor(at + 1), userEvent: "input.type" }).state
  }
  return state
}

// lo que pinta: la palabra subrayada y lo gris
const shown = (state: EditorState) => {
  const found = { typo: "", ghost: "" }
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === "function") continue
    const iter = (source as DecorationSet).iter()
    for (; iter.value; iter.next()) {
      if (iter.value.spec.widget) found.ghost = (iter.value.spec.widget as { text: string }).text
      else found.typo = state.sliceDoc(iter.from, iter.to)
    }
  }
  return found
}

const accept = (state: EditorState) => {
  const spec = acceptGrayCorrection(state)
  return spec ? state.update(spec).state : state
}

describe("al terminar una palabra con espacio", () => {
  test("una errata: subrayada, y la buena en gris detrás del cursor", () => {
    expect(shown(type(create(""), "la navegacion "))).toEqual({ typo: "navegacion", ghost: "navegación" })
  })
  test("una buena, nada", () => {
    expect(shown(type(create(""), "la casa "))).toEqual({ typo: "", ghost: "" })
  })
  test("ni lo del vocabulario, ni mientras no han llegado los diccionarios", () => {
    expect(shown(type(create("", ["queiro"]), "lo que queiro ")).ghost).toBe("")
    expect(shown(type(create("", [], false), "lo que queiro ")).ghost).toBe("")
  })
  test("ni el código, los enlaces, los #tags o las /skills", () => {
    for (const text of ["`queiro` ", "https://queiro.com ", "#queiro ", "/queiro "])
      expect(shown(type(create(""), text)).ghost).toBe("")
  })
  test("con la puntuación pegada, mira la palabra", () => {
    expect(shown(type(create(""), "¿la navegacion? ")).ghost).toBe("navegación")
  })
})

describe("Tab", () => {
  test("pone la buena y el cursor sigue detrás del espacio", () => {
    const state = accept(type(create(""), "lo que queiro "))
    expect(state.doc.toString()).toBe("lo que quiero ")
    expect(state.selection.main.head).toBe(14)
    expect(shown(state)).toEqual({ typo: "", ghost: "" })
  })
  test("sin propuesta, no hace nada (y el Tab sigue para otros)", () => {
    expect(acceptGrayCorrection(type(create(""), "la casa "))).toBeNull()
  })
  test("⌘Z la quita y vuelve la tuya, sin deshacer lo escrito antes", () => {
    const state = accept(type(create(""), "lo que queiro "))
    let undone = state
    undo({ state, dispatch: (tr: Transaction) => (undone = tr.state) })
    expect(undone.doc.toString()).toBe("lo que queiro ")
  })
})

describe("seguir escribiendo", () => {
  // la palabra que se deja en la transacción que quita la propuesta, o null
  const leftBy = (state: EditorState, spec: TransactionSpec) => leftWordIn(state.update(spec))
  const proposed = () => type(create(""), "lo que queiro ")

  test("quita la propuesta y deja la tuya", () => {
    const state = type(proposed(), "v")
    expect(state.doc.toString()).toBe("lo que queiro v")
    expect(shown(state)).toEqual({ typo: "", ghost: "" })
  })
  test("cuenta como dejarla", () => {
    expect(
      leftBy(proposed(), { changes: { from: 14, insert: "v" }, selection: EditorSelection.cursor(15), userEvent: "input.type" }),
    ).toBe("queiro")
  })
  test("borrar o mover el cursor la quitan sin contar: quizá la arreglas a mano", () => {
    const deleted = proposed().update({ changes: { from: 13, to: 14 }, userEvent: "delete.backward" })
    expect(shown(deleted.state).ghost).toBe("")
    expect(leftWordIn(deleted)).toBeNull()
    const moved = proposed().update({ selection: EditorSelection.cursor(2), userEvent: "select.pointer" })
    expect(shown(moved.state).ghost).toBe("")
    expect(leftWordIn(moved)).toBeNull()
  })
  test("ponerla con Tab no cuenta", () => {
    const state = proposed()
    expect(leftWordIn(state.update(acceptGrayCorrection(state)!))).toBeNull()
  })
})

describe("el «¿» o el «¡» delante de una pregunta ya escrita", () => {
  test("pone la tilde de la palabra de detrás, sola", () => {
    let state = create("Como lo hacemos?")
    state = state.update({ changes: { from: 0, insert: "¿" }, selection: EditorSelection.cursor(1), userEvent: "input.type" }).state
    expect(state.doc.toString()).toBe("¿Cómo lo hacemos?")
  })
  test("también si lo pone el editor al cerrar la pregunta", () => {
    let state = create("Donde lo guardamos?")
    state = state.update({ changes: { from: 0, insert: "¿" }, userEvent: "input.autocorrect" }).state
    expect(state.doc.toString()).toBe("¿Dónde lo guardamos?")
  })
  test("y detrás de una preposición: «¿Por qué?»", () => {
    let state = create("Por que no?")
    state = state.update({ changes: { from: 0, insert: "¿" }, userEvent: "input.autocorrect" }).state
    expect(state.doc.toString()).toBe("¿Por qué no?")
  })
  test("si la de detrás no es de pregunta, nada", () => {
    let state = create("Hay manera?")
    state = state.update({ changes: { from: 0, insert: "¿" }, userEvent: "input.type" }).state
    expect(state.doc.toString()).toBe("¿Hay manera?")
  })
})
