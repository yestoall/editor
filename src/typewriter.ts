//· typewriter ·
// La escritura centrada, como el modo máquina de escribir de iA Writer: al
// escribir o mover el cursor, su línea se queda a media pantalla y el texto
// sube por debajo. La enciende la app (en la web y el Mac); de serie,
// apagada. Con ella, el texto lleva
// media pantalla de aire arriba y abajo (css, .cm-typewriter): si no,
// una idea corta cabe entera y no hay nada que desplazar.

import { EditorState, type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

export const typewriter = (on: boolean): Extension =>
  on
    ? [
        EditorView.editorAttributes.of({ class: "cm-typewriter" }),
        // donde el editor ya iba a llevar el cursor a la vista (escribir,
        // moverlo con el teclado), lo lleva al centro
        EditorState.transactionExtender.of((tr) =>
          tr.scrollIntoView ? { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: "center" }) } : null,
        ),
      ]
    : []
