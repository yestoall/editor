//· lists ·
// Las listas mientras se escribe, como en Notas: en una línea con viñeta
// («- », «* », «• ») o numerada («1. », «1) »), Intro abre la siguiente con la
// suya (la numerada, con el número siguiente) y la misma sangría, también a
// mitad de línea (lo de detrás baja a la nueva). En una viñeta vacía, Intro o
// Borrar al principio la quitan y la lista se cierra: el segundo Intro sale de
// ella. Sobre EditorState, como commands: devuelven la transacción o null
// (entonces sigue la tecla de serie).

import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

// sangría, la viñeta o el número con su punto o paréntesis, y los espacios
const ITEM = /^(\s*)(?:([-*•])|(\d+)([.)]))( +)/

type Item = { indent: string; marker: string; space: string; length: number; empty: boolean }

// una viñeta sola, con o sin espacio detrás: en el iPhone, al pulsar Intro el
// teclado se come el espacio del final y la línea se queda en «-»
const BARE = /^(\s*)(?:[-*•]|\d+[.)])\s*$/

const itemOf = (text: string): Item | null => {
  const match = ITEM.exec(text)
  if (!match) {
    const bare = BARE.exec(text)
    return bare ? { indent: bare[1], marker: "", space: "", length: text.length, empty: true } : null
  }
  const [whole, indent, bullet, number, separator, space] = match
  return {
    indent,
    marker: bullet ?? `${number}${separator}`,
    space,
    length: whole.length,
    empty: !text.slice(whole.length).trim(),
  }
}

// la viñeta de la línea siguiente: la misma, o el número de después
const nextMarker = (marker: string) => {
  const numbered = /^(\d+)([.)])$/.exec(marker)
  return numbered ? `${Number(numbered[1]) + 1}${numbered[2]}` : marker
}

// Intro: sigue la lista o, en una viñeta vacía, la cierra
export const continueList = (state: EditorState): TransactionSpec | null => {
  const { main } = state.selection
  if (!main.empty || state.selection.ranges.length > 1) return null
  const line = state.doc.lineAt(main.head)
  const item = itemOf(line.text)
  // antes de la viñeta o dentro de ella, el Intro de siempre
  if (!item || main.head - line.from < item.length) return null
  if (item.empty)
    return {
      changes: { from: line.from, to: line.to, insert: "" },
      selection: EditorSelection.cursor(line.from),
      scrollIntoView: true,
      userEvent: "delete",
    }
  const insert = `\n${item.indent}${nextMarker(item.marker)}${item.space}`
  return {
    changes: { from: main.head, insert },
    selection: EditorSelection.cursor(main.head + insert.length),
    scrollIntoView: true,
    userEvent: "input",
  }
}

// Borrar justo detrás de una viñeta vacía: la quita entera
export const removeEmptyItem = (state: EditorState): TransactionSpec | null => {
  const { main } = state.selection
  if (!main.empty || state.selection.ranges.length > 1) return null
  const line = state.doc.lineAt(main.head)
  const item = itemOf(line.text)
  if (!item?.empty || main.head !== line.from + item.length) return null
  return {
    changes: { from: line.from, to: main.head, insert: "" },
    selection: EditorSelection.cursor(line.from),
    scrollIntoView: true,
    userEvent: "delete",
  }
}

// Como comando: si no hay nada que hacer, devuelve false y sigue la tecla de
// serie (el Intro o el Borrar normales)
export const orDefault =
  (make: (state: EditorState) => TransactionSpec | null) =>
  (view: EditorView): boolean => {
    // en solo lectura (el modelo del iPhone pensando), la de serie, que no hace nada
    if (view.state.readOnly) return false
    const spec = make(view.state)
    if (!spec) return false
    view.dispatch(spec)
    return true
  }

export const LIST_COMMANDS = {
  enter: orDefault(continueList),
  backspace: orDefault(removeEmptyItem),
}
