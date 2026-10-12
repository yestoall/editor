//· pairs ·
// Comillas, paréntesis y compañía al escribir. Al abrir uno, sale también el
// de cerrar y el cursor queda en medio; con texto seleccionado, lo envuelve.
// Al escribir el de cerrar con ese mismo justo delante, el cursor lo salta en
// vez de repetirlo. Borrar entre un par vacío quita los dos. Delante de una
// letra solo abre, y las comillas rectas detrás de una letra no se cierran
// («don't», o la que cierra a mano). Incluye las tipográficas («», “”, ‘’),
// que pone el teclado del iPhone. Una extensión propia y no la de CodeMirror
// (closeBrackets): esa viene con todo el autocompletado, 90 KB más en el webview.
// Sobre EditorState, como lists: devuelven la transacción o null (sigue la
// tecla de serie).

import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

const PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  "`": "`",
  "«": "»",
  "“": "”",
  "‘": "’",
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
}
const CLOSERS = new Set(Object.values(PAIRS))
// las que abren y cierran con el mismo signo: detrás de una letra, cierran
const STRAIGHT = new Set(['"', "'", "`"])

const isWordChar = (char: string) => /[\p{L}\p{N}]/u.test(char)

export function insertPair(state: EditorState, char: string): TransactionSpec | null {
  if (state.selection.ranges.length > 1) return null
  const { from, to } = state.selection.main
  const close = PAIRS[char]
  if (from !== to) {
    if (!close) return null
    return {
      changes: [
        { from, insert: char },
        { from: to, insert: close },
      ],
      selection: EditorSelection.range(from + 1, to + 1),
      userEvent: "input.type",
    }
  }
  const next = state.sliceDoc(from, from + 1)
  const before = state.sliceDoc(from - 1, from)
  // el de cerrar ya está delante: se salta
  if (CLOSERS.has(char) && next === char) return { selection: EditorSelection.cursor(from + 1), userEvent: "input.type" }
  if (!close) return null
  if (isWordChar(next)) return null
  if (STRAIGHT.has(char) && isWordChar(before)) return null
  return {
    changes: { from, insert: char + close },
    selection: EditorSelection.cursor(from + 1),
    userEvent: "input.type",
  }
}

export function deletePair(state: EditorState): TransactionSpec | null {
  if (state.selection.ranges.length > 1) return null
  const { from, to } = state.selection.main
  if (from !== to) return null
  const close = PAIRS[state.sliceDoc(from - 1, from)]
  if (!close || state.sliceDoc(from, from + 1) !== close) return null
  return { changes: { from: from - 1, to: from + 1 }, userEvent: "delete.backward" }
}

// Lo que se escribe: un solo signo en el sitio de la selección (el dictado o
// un pegado van de largo)
export const pairsInput = EditorView.inputHandler.of((view, from, to, text) => {
  const { main } = view.state.selection
  if (view.composing || text.length !== 1 || from !== main.from || to !== main.to) return false
  const spec = insertPair(view.state, text)
  if (!spec) return false
  view.dispatch(spec)
  return true
})

// Borrar, para el keymap: en solo lectura no toca nada
export const deletePairCommand = (view: EditorView): boolean => {
  if (view.state.readOnly) return false
  const spec = deletePair(view.state)
  if (!spec) return false
  view.dispatch(spec)
  return true
}
