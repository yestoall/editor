//· selection ·
// La selección se ciñe al texto, como en iOS: un rectángulo por línea visual,
// de donde empieza el texto seleccionado a donde acaba en esa línea. La de
// serie de CodeMirror (y su RectangleMarker.forRange) rellena hasta el borde
// las líneas intermedias y las que parte el ajuste. Una línea vacía lleva una
// marca estrecha, para que una selección que la cruza se vea. De la capa de
// serie se ocultan solo los fondos: ahí van también los tiradores de iOS.
// La selección va en el acento entero, y el texto seleccionado, en el color de
// encima del acento (selectedText): el fondo va en una capa por detrás del
// texto, así que el color de la letra se cambia marcando el tramo.

import { EditorSelection, RangeSetBuilder } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  layer,
  type LayerMarker,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"

const EMPTY_LINE_WIDTH = 6

// Un rectángulo en coordenadas del documento (como las de RectangleMarker)
class HuggingMarker implements LayerMarker {
  constructor(
    readonly left: number,
    readonly top: number,
    readonly width: number,
    readonly height: number,
  ) {}
  eq(other: LayerMarker): boolean {
    return (
      other instanceof HuggingMarker &&
      other.left === this.left &&
      other.top === this.top &&
      other.width === this.width &&
      other.height === this.height
    )
  }
  draw(): HTMLElement {
    const element = document.createElement("div")
    element.className = "cm-selectionBackground"
    this.update(element)
    return element
  }
  update(element: HTMLElement): boolean {
    element.style.left = `${this.left}px`
    element.style.top = `${this.top}px`
    element.style.width = `${this.width}px`
    element.style.height = `${this.height}px`
    return true
  }
}

// Lo mismo que hace CodeMirror por dentro para pasar de la ventana al documento
const documentBase = (view: EditorView) => {
  const rect = view.scrollDOM.getBoundingClientRect()
  return {
    left: rect.left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
  }
}

const markers = (view: EditorView): LayerMarker[] => {
  const base = documentBase(view)
  const out: LayerMarker[] = []
  const box = (left: number, top: number, right: number, bottom: number) =>
    out.push(
      new HuggingMarker(
        (left - base.left) / view.scaleX,
        (top - base.top) / view.scaleY,
        Math.max(0, right - left) / view.scaleX,
        (bottom - top) / view.scaleY,
      ),
    )

  for (const range of view.state.selection.ranges) {
    if (range.empty) continue
    const first = view.state.doc.lineAt(range.from).number
    const last = view.state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) {
      const line = view.state.doc.line(n)
      if (line.from === line.to) {
        const at = view.coordsAtPos(line.from, 1)
        if (at) box(at.left, at.top, at.left + EMPTY_LINE_WIDTH * view.scaleX, at.bottom)
        continue
      }
      // por tramos de línea visual: el ajuste puede partir una línea en varias
      let start = Math.max(range.from, line.from)
      const end = Math.min(range.to, line.to)
      while (start < end) {
        const visualEnd = Math.min(end, view.moveToLineBoundary(EditorSelection.cursor(start, 1), true, true).head)
        const from = view.coordsAtPos(start, 1)
        const to = view.coordsAtPos(visualEnd, -1)
        if (from && to) box(from.left, Math.min(from.top, to.top), to.right, Math.max(from.bottom, to.bottom))
        if (visualEnd <= start) break
        start = visualEnd
      }
    }
  }
  return out
}

export const textHuggingSelection = layer({
  above: false,
  markers,
  update: (update) => update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged,
  class: "cm-huggingSelectionLayer",
})

const selectedMark = Decoration.mark({ class: "cm-selectedText" })

const selectedRanges = (view: EditorView) => {
  const builder = new RangeSetBuilder<Decoration>()
  for (const range of view.state.selection.ranges) if (!range.empty) builder.add(range.from, range.to, selectedMark)
  return builder.finish()
}

export const selectedText = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = selectedRanges(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) this.decorations = selectedRanges(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)
