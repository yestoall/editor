//· commands tests ·
// Seleccionar y mover párrafos sobre un EditorState sin DOM.

import { history, undo } from "@codemirror/commands"
import { EditorSelection, EditorState, type Transaction, type TransactionSpec } from "@codemirror/state"
import { describe, expect, test } from "bun:test"

import type { EditorView } from "@codemirror/view"

import { asCommand, clearAll, insertSkill, moveParagraph, selectParagraph } from "./commands"

const DOC = ["Uno", "uno bis", "", "Dos", "", "", "Tres", "tres bis"].join("\n")

// el cursor al principio del texto marcado, o en una posición dada
const stateAt = (at: string | number) =>
  EditorState.create({
    doc: DOC,
    extensions: [history()],
    selection: EditorSelection.cursor(typeof at === "number" ? at : DOC.indexOf(at)),
  })
const BLANK_LINE = DOC.indexOf("\n\nDos") + 1

const apply = (state: EditorState, spec: TransactionSpec | null) => {
  expect(spec).not.toBeNull()
  return state.update(spec!).state
}

describe("seleccionar párrafo", () => {
  test("selecciona el bloque entero, de una o de varias líneas", () => {
    const many = apply(stateAt("uno bis"), selectParagraph(stateAt("uno bis")))
    expect(many.sliceDoc(many.selection.main.from, many.selection.main.to)).toBe("Uno\nuno bis")
    const one = apply(stateAt("Dos"), selectParagraph(stateAt("Dos")))
    expect(one.sliceDoc(one.selection.main.from, one.selection.main.to)).toBe("Dos")
  })

  test("en una línea vacía no hace nada", () => {
    expect(selectParagraph(stateAt(BLANK_LINE))).toBeNull()
  })
})

describe("mover párrafo", () => {
  test("hacia arriba se intercambia con el anterior y conserva las líneas en blanco entre ellos", () => {
    const moved = apply(stateAt("Tres"), moveParagraph(stateAt("Tres"), -1))
    expect(moved.doc.toString()).toBe(["Uno", "uno bis", "", "Tres", "tres bis", "", "", "Dos"].join("\n"))
  })

  test("hacia abajo se intercambia con el siguiente", () => {
    const moved = apply(stateAt("uno bis"), moveParagraph(stateAt("uno bis"), 1))
    expect(moved.doc.toString()).toBe(["Dos", "", "Uno", "uno bis", "", "", "Tres", "tres bis"].join("\n"))
  })

  test("el cursor se queda en el mismo punto del párrafo movido", () => {
    const state = stateAt(DOC.indexOf("bis", DOC.indexOf("tres")))
    const moved = apply(state, moveParagraph(state, -1))
    const head = moved.selection.main.head
    expect(moved.sliceDoc(head, head + 3)).toBe("bis")
    expect(moved.doc.lineAt(head).text).toBe("tres bis")
  })

  test("el primero hacia arriba y el último hacia abajo no hacen nada", () => {
    expect(moveParagraph(stateAt("Uno"), -1)).toBeNull()
    expect(moveParagraph(stateAt("Tres"), 1)).toBeNull()
  })

  test("con el cursor en una línea vacía no hace nada", () => {
    expect(moveParagraph(stateAt(BLANK_LINE), 1)).toBeNull()
    expect(moveParagraph(stateAt(BLANK_LINE), -1)).toBeNull()
  })

  test("deshacer revierte el movimiento de un golpe", () => {
    const state = stateAt("Tres")
    let moved = apply(state, moveParagraph(state, -1))
    moved = apply(moved, moveParagraph(moved, -1))
    undo({
      state: moved,
      dispatch: (tr: Transaction) => {
        moved = tr.state
      },
    })
    expect(moved.doc.toString()).toBe(["Uno", "uno bis", "", "Tres", "tres bis", "", "", "Dos"].join("\n"))
  })
})

describe("como atajo", () => {
  // si devolviera false, CodeMirror probaría el siguiente comando de la tecla
  // (Alt+↑ de serie movería «uno bis» por encima de «Uno»)
  test("se queda la tecla aunque no haya nada que hacer, y no cambia nada", () => {
    let state = stateAt("uno bis")
    const view = { state, dispatch: (spec: TransactionSpec) => (state = state.update(spec).state) } as unknown as EditorView
    expect(asCommand((s) => moveParagraph(s, -1))(view)).toBe(true)
    expect(state.doc.toString()).toBe(DOC)
  })
  // mientras el modelo del iPhone piensa (rewrite), el texto no se toca
  test("en solo lectura no mueve el párrafo, pero sí lo selecciona", () => {
    let state = EditorState.create({
      doc: DOC,
      extensions: [EditorState.readOnly.of(true)],
      selection: EditorSelection.cursor(DOC.indexOf("Dos")),
    })
    const view = { state, dispatch: (spec: TransactionSpec) => (state = state.update(spec).state) } as unknown as EditorView
    expect(asCommand((s) => moveParagraph(s, -1))(view)).toBe(true)
    expect(state.doc.toString()).toBe(DOC)
    asCommand(selectParagraph)(view)
    expect(state.selection.main.empty).toBe(false)
  })
})

describe("meter una skill", () => {
  // el texto con el cursor donde va la barra
  const withCursor = (marked: string) => {
    const at = marked.indexOf("|")
    return EditorState.create({ doc: marked.replace("|", ""), selection: EditorSelection.cursor(at) })
  }
  const after = (marked: string, skill = "/git") => {
    const state = withCursor(marked)
    const next = state.update(insertSkill(state, skill)).state
    const head = next.selection.main.head
    return next.doc.toString().slice(0, head) + "|" + next.doc.toString().slice(head)
  }

  test("en una línea vacía, con su espacio detrás", () => {
    expect(after("|")).toBe("/git |")
  })

  test("tras una palabra, separada de ella", () => {
    expect(after("pásala por|")).toBe("pásala por /git |")
  })

  test("tras un espacio o lo que la abre, sin otro", () => {
    expect(after("pásala por |")).toBe("pásala por /git |")
    expect(after("(|")).toBe("(/git |")
  })

  test("si ya hay un espacio detrás, el cursor lo salta", () => {
    expect(after("hazlo| y ya")).toBe("hazlo /git |y ya")
  })

  test("en lugar de lo seleccionado", () => {
    const state = EditorState.create({ doc: "usa esto", selection: EditorSelection.range(4, 8) })
    expect(state.update(insertSkill(state, "/documenta")).state.doc.toString()).toBe("usa /documenta ")
  })
})

describe("vaciar (descartar la captura)", () => {
  test("quita todo y un deshacer lo devuelve", () => {
    let state = EditorState.create({ doc: "una idea a medias", extensions: [history()] })
    state = state.update(clearAll(state)!).state
    expect(state.doc.toString()).toBe("")
    undo({ state, dispatch: (tr: Transaction) => (state = tr.state) })
    expect(state.doc.toString()).toBe("una idea a medias")
  })
  test("vacío, no hay nada que hacer", () => {
    expect(clearAll(EditorState.create({ doc: "" }))).toBeNull()
  })
})
