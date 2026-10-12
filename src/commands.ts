//· commands ·
// Seleccionar y mover párrafos, y meter una skill, sobre EditorState:
// devuelven la transacción (o null si no hay nada que hacer) y se prueban sin
// DOM. Los usan los atajos de teclado y la barra sobre el teclado.

import { isolateHistory } from "@codemirror/commands"
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"

import { activeParagraph, isBlank, type Paragraph, paragraphAt } from "./paragraph"

const isBlankParagraph = (state: EditorState, paragraph: Paragraph) => isBlank(state.sliceDoc(paragraph.from, paragraph.to))

export const selectParagraph = (state: EditorState): TransactionSpec | null => {
  const paragraph = activeParagraph(state)
  if (isBlankParagraph(state, paragraph)) return null
  return { selection: EditorSelection.range(paragraph.from, paragraph.to), scrollIntoView: true, userEvent: "select" }
}

// Intercambia el párrafo del cursor con el anterior (-1) o el siguiente (1),
// conservando las líneas en blanco que hay entre ellos. Cada movimiento es un
// paso propio de deshacer.
export const moveParagraph = (state: EditorState, direction: -1 | 1): TransactionSpec | null => {
  const { doc } = state
  const head = state.selection.main.head
  const current = activeParagraph(state)
  if (isBlankParagraph(state, current)) return null

  let n = direction < 0 ? current.startLine - 1 : current.endLine + 1
  while (n >= 1 && n <= doc.lines && isBlank(doc.line(n).text)) n += direction
  if (n < 1 || n > doc.lines) return null

  const other = paragraphAt(state, doc.line(n).from)
  const [first, second] = direction < 0 ? [other, current] : [current, other]
  const firstText = doc.sliceString(first.from, first.to)
  const secondText = doc.sliceString(second.from, second.to)
  const between = doc.sliceString(first.to, second.from)
  const offset = head - current.from
  const newHead = direction < 0 ? first.from + offset : first.from + secondText.length + between.length + offset

  return {
    changes: { from: first.from, to: second.to, insert: secondText + between + firstText },
    selection: EditorSelection.cursor(newHead),
    scrollIntoView: true,
    userEvent: "move.line",
    annotations: isolateHistory.of("full"),
  }
}

// Como comando de CodeMirror. Se queda la tecla aunque no haya nada que
// hacer: si devolviera false, CodeMirror probaría el siguiente comando de esa
// tecla (Alt+↑↓ de serie mueve líneas sueltas).
export const asCommand =
  (make: (state: EditorState) => TransactionSpec | null) =>
  (view: EditorView): boolean => {
    const spec = make(view.state)
    // en solo lectura (el modelo del iPhone pensando), seleccionar sí, mover no
    if (spec && !(view.state.readOnly && spec.changes)) view.dispatch(spec)
    return true
  }

// Una skill desde la barra del iPhone, en el cursor (o en lugar de lo
// seleccionado), como palabra suelta: con un espacio delante si lo de antes la
// pegaría a otra palabra (no cuenta como skill pegada a nada), y uno detrás
// para seguir escribiendo, salvo si ya lo hay: entonces el cursor lo salta
const OPENS_SKILL = /[\s(«"“'¿¡]/

export const insertSkill = (state: EditorState, skill: string): TransactionSpec => {
  const { from, to } = state.selection.main
  const before = state.sliceDoc(from - 1, from)
  const spaceAfter = state.sliceDoc(to, to + 1) === " "
  const text = (before && !OPENS_SKILL.test(before) ? " " : "") + skill + (spaceAfter ? "" : " ")
  return {
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + text.length + (spaceAfter ? 1 : 0)),
    scrollIntoView: true,
    userEvent: "input",
  }
}

// Vaciar el editor (descartar lo escrito, con un atajo o un botón de la app): un
// paso de historial como otro cualquiera, así que ⌘Z lo devuelve. null si ya
// está vacío
export const clearAll = (state: EditorState): TransactionSpec | null => {
  if (!state.doc.length) return null
  return {
    changes: { from: 0, to: state.doc.length },
    selection: EditorSelection.cursor(0),
    annotations: isolateHistory.of("full"),
    userEvent: "delete",
  }
}

// Los comandos que comparten los atajos de teclado y la barra del iPhone
export const PARAGRAPH_COMMANDS = {
  select: asCommand(selectParagraph),
  moveUp: asCommand((state) => moveParagraph(state, -1)),
  moveDown: asCommand((state) => moveParagraph(state, 1)),
}
