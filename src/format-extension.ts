//· format-extension ·
// El formato de una nota del Timeline mientras escribes (ADR 0020 de ideas):
// cada trozo con su negrita, su cursiva o su enlace, y sus signos en gris.
// Nada se esconde ni se reemplaza: el texto no se mueve al pasar el cursor, y
// el cursor de bloque mide letras que no cambian de ancho. Sobre el texto
// entero, que es corto (como mucho, el de una nota).

import { type Range } from "@codemirror/state"
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"

import { type FormatKind, formatSpans } from "./note-format"

const contentMark: Record<FormatKind, Decoration> = {
  bold: Decoration.mark({ class: "cm-format-bold" }),
  italic: Decoration.mark({ class: "cm-format-italic" }),
  link: Decoration.mark({ class: "cm-format-link" }),
}

const signMark = Decoration.mark({ class: "cm-format-sign" })

// El texto de un trozo sin los signos de los que lleva dentro: el subrayado de
// un enlace no se le puede quitar por CSS a lo que va dentro de él
const withoutSigns = ([from, to]: [number, number], signs: [number, number][]) => {
  const parts: [number, number][] = []
  let at = from
  for (const [signFrom, signTo] of signs) {
    if (signFrom < from || signTo > to) continue
    if (signFrom > at) parts.push([at, signFrom])
    at = Math.max(at, signTo)
  }
  if (to > at) parts.push([at, to])
  return parts
}

const formatDecorations = (view: EditorView): DecorationSet => {
  const spans = formatSpans(view.state.doc.toString())
  const signs = spans.flatMap((span) => span.signs).sort((a, b) => a[0] - b[0])
  const marks: Range<Decoration>[] = []
  for (const span of spans) {
    const parts = span.kind === "link" ? withoutSigns(span.content, signs) : [span.content]
    for (const [from, to] of parts) marks.push(contentMark[span.kind].range(from, to))
    for (const [from, to] of span.signs) marks.push(signMark.range(from, to))
  }
  return Decoration.set(marks, true)
}

export const formatHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = formatDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = formatDecorations(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
