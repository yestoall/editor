//· copyOnSelect ·
// En la web y el Mac, lo que seleccionas se copia solo, sin ⌘C. Se copia
// cuando la selección queda hecha (al soltar el ratón o una tecla), no a cada
// paso mientras se arrastra o se estira con ⇧. Una selección se copia una
// vez: volver a soltar sin cambiarla no pisa lo que hayas copiado después.
// Va dentro del gesto (pointerup, keyup) porque WebKit solo deja escribir en
// el portapapeles en respuesta a algo que has hecho tú.

import { type EditorState } from "@codemirror/state"
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"

const selectionText = (state: EditorState) =>
  state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => state.sliceDoc(range.from, range.to))
    .join(state.lineBreak)

// si el portapapeles no deja (un navegador viejo), como ⌘C: CodeMirror copia
// su selección
const writeClipboard = (view: EditorView, text: string) =>
  navigator.clipboard?.writeText(text).catch(() => {
    if (view.hasFocus) document.execCommand("copy")
  })

export const copyOnSelect = ViewPlugin.fromClass(
  class {
    pending = false // la selección cambió y aún no se ha copiado

    constructor(readonly view: EditorView) {
      document.addEventListener("pointerup", this.settle)
      document.addEventListener("keyup", this.settle)
    }

    update(update: ViewUpdate) {
      if (update.selectionSet) this.pending = !update.state.selection.main.empty || update.state.selection.ranges.length > 1
    }

    settle = () => {
      if (!this.pending) return
      this.pending = false
      const text = selectionText(this.view.state)
      if (text) void writeClipboard(this.view, text)
    }

    destroy() {
      document.removeEventListener("pointerup", this.settle)
      document.removeEventListener("keyup", this.settle)
    }
  },
)
