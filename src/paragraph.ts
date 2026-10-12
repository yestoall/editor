//· paragraph ·
// Un párrafo es un bloque de líneas no vacías seguidas (definición del
// prototipo del editor). Una línea vacía es un párrafo de una sola línea.
// Todo sobre EditorState, sin DOM: se prueba sin webview.

import type { EditorState } from "@codemirror/state"

export type Paragraph = { from: number; to: number; startLine: number; endLine: number }

export const isBlank = (text: string) => !text.trim()

export const paragraphAt = (state: EditorState, pos: number): Paragraph => {
  const doc = state.doc
  const line = doc.lineAt(pos)
  if (isBlank(line.text)) return { from: line.from, to: line.to, startLine: line.number, endLine: line.number }
  let start = line.number
  let end = line.number
  while (start > 1 && !isBlank(doc.line(start - 1).text)) start--
  while (end < doc.lines && !isBlank(doc.line(end + 1).text)) end++
  return { from: doc.line(start).from, to: doc.line(end).to, startLine: start, endLine: end }
}

export const activeParagraph = (state: EditorState) => paragraphAt(state, state.selection.main.head)
