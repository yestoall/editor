//· search ·
// Buscar y reemplazar dentro de una idea (@codemirror/search), en la web y el
// Mac: ⌘F abre el panel arriba, ⌘G y ⇧⌘G van a la siguiente y a la anterior,
// Esc lo cierra (antes que el Esc que la app tenga para el editor). Sin el
// resto de su keymap: ⌘D y ⇧⌘L eligen
// coincidencias, y ⌥⌘G va a una línea, que en una idea no tienen sentido.

import { closeSearchPanel, findNext, findPrevious, openSearchPanel, search } from "@codemirror/search"
import { EditorState, type Extension } from "@codemirror/state"
import { keymap } from "@codemirror/view"

// los textos del panel, en castellano
const PHRASES = {
  Find: "Buscar",
  Replace: "Reemplazar",
  next: "siguiente",
  previous: "anterior",
  all: "todas",
  "match case": "mayúsculas",
  regexp: "expresión regular",
  "by word": "palabra entera",
  replace: "reemplazar",
  "replace all": "reemplazar todas",
  close: "cerrar",
  "current match": "coincidencia actual",
  "on line": "en la línea",
  "replaced $ matches": "$ reemplazadas",
  "replaced match on line $": "Reemplazada en la línea $",
}

export const ideaSearch: Extension = [
  search({ top: true }),
  EditorState.phrases.of(PHRASES),
  keymap.of([
    { key: "Mod-f", run: openSearchPanel, scope: "editor search-panel", preventDefault: true },
    { key: "Mod-g", run: findNext, shift: findPrevious, scope: "editor search-panel", preventDefault: true },
    { key: "Escape", run: closeSearchPanel, scope: "editor search-panel" },
  ]),
]
