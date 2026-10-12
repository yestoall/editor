//· paragraph tests ·
// El párrafo activo sobre un EditorState sin DOM.

import { EditorSelection, EditorState } from "@codemirror/state"
import { describe, expect, test } from "bun:test"

import { activeParagraph } from "./paragraph"

const DOC = ["# Título", "", "Primera línea", "segunda línea", "tercera línea", "", "", "Suelto", ""].join("\n")

// estado con el cursor justo después del texto marcado
const at = (marker: string) => {
  const pos = DOC.indexOf(marker) + marker.length
  return EditorState.create({ doc: DOC, selection: EditorSelection.cursor(pos) })
}

describe("párrafo activo", () => {
  test("con el cursor en mitad de un bloque, es el bloque entero", () => {
    expect(activeParagraph(at("segunda"))).toMatchObject({ startLine: 3, endLine: 5 })
  })

  test("da igual que el cursor esté en la primera o en la última línea del bloque", () => {
    expect(activeParagraph(at("Primera"))).toMatchObject({ startLine: 3, endLine: 5 })
    expect(activeParagraph(at("tercera línea"))).toMatchObject({ startLine: 3, endLine: 5 })
  })

  test("un párrafo de una sola línea es esa línea", () => {
    expect(activeParagraph(at("# Título"))).toMatchObject({ startLine: 1, endLine: 1 })
    expect(activeParagraph(at("Suelto"))).toMatchObject({ startLine: 8, endLine: 8 })
  })

  test("en una línea vacía, el párrafo es solo esa línea vacía", () => {
    const state = EditorState.create({ doc: DOC, selection: EditorSelection.cursor(DOC.indexOf("\n\n\nSuelto") + 1) })
    expect(activeParagraph(state)).toMatchObject({ startLine: 6, endLine: 6 })
  })

  test("from y to cubren el texto del bloque, sin el salto de línea final", () => {
    const paragraph = activeParagraph(at("segunda"))
    expect(DOC.slice(paragraph.from, paragraph.to)).toBe("Primera línea\nsegunda línea\ntercera línea")
  })
})
