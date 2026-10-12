//· typography ·
// El corrector pequeño del editor: al cerrar una pregunta o una exclamación
// pone el ¿ o el ¡ al principio de la frase y, en la web, la mayúscula al
// empezar frase (en el iPhone ya la pone el teclado, y cambiarla ahí pisaría
// una minúscula que hubieras querido). Lo demás, acentos incluidos, es cosa
// del teclado. Cada arreglo es su propio paso de deshacer: ⌘Z lo quita y deja
// lo que escribiste.

import { isolateHistory } from "@codemirror/commands"
import type { Transaction } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

const OPENING = { "?": "¿", "!": "¡" } as const

// signos que cierran una frase, y los que pueden ir delante de su primera letra
const ENDS_SENTENCE = /[.?!…]\s+$/
const CUTS_SENTENCE = /[.?!…:;]/
const OPENERS = /[\s«"“‘'([]/
const WORD_CHAR = /[\p{L}\p{N}]/u

// Dónde va el ¿ o el ¡ al escribir `mark` en `offset` de la línea, o null si
// no toca. La frase empieza tras el último signo que corta seguido de espacio
// (un punto sin espacio detrás es una URL o un decimal) o al principio de la
// línea. Una pregunta a mitad de frase («Si vienes, ¿me avisas?») hay que
// abrirla a mano: sin gramática no se sabe dónde empieza.
export const openingMarkAt = (text: string, offset: number, mark: "?" | "!"): number | null => {
  const previous = text[offset - 1]
  if (!previous || /\s/.test(previous) || previous === "?" || previous === "!") return null
  // en mitad de una palabra no se está cerrando nada
  if (WORD_CHAR.test(text[offset] ?? "")) return null
  let start = 0
  for (let i = offset - 1; i > 0; i--) {
    if (CUTS_SENTENCE.test(text[i - 1]) && /\s/.test(text[i])) {
      start = i
      break
    }
  }
  if (text.slice(start, offset).includes(OPENING[mark])) return null
  while (start < offset && OPENERS.test(text[start])) start++
  return start < offset ? start : null
}

// Si la letra que se escribe en `offset` de la línea empieza una frase: al
// principio de la línea, tras un punto (o ? ! …) y espacio, o tras el ¿ o el ¡
// que abre una de esas
export const startsSentence = (text: string, offset: number) => {
  const before = text.slice(0, offset).replace(/[¿¡]$/, "")
  return /^\s*$/.test(before) || ENDS_SENTENCE.test(before)
}

// Tras escribir, el arreglo va en una transacción aparte y aislada en el
// historial: así es el primer paso que deshace ⌘Z
const fixAfterTyping = (view: EditorView, insert: () => Transaction, fix: () => void) => {
  view.dispatch(insert())
  fix()
  return true
}

export const spanishTypography = ({ capitalize }: { capitalize: boolean }) =>
  EditorView.inputHandler.of((view, from, to, text, insert) => {
    if (from !== to || view.composing) return false
    const line = view.state.doc.lineAt(from)
    const offset = from - line.from
    const isolated = { annotations: isolateHistory.of("full"), userEvent: "input.autocorrect" }

    if (text === "?" || text === "!") {
      const at = openingMarkAt(line.text, offset, text)
      if (at === null) return false
      return fixAfterTyping(view, insert, () =>
        view.dispatch({ changes: { from: line.from + at, insert: OPENING[text] }, ...isolated }),
      )
    }

    if (capitalize && /^\p{Ll}$/u.test(text) && startsSentence(line.text, offset)) {
      return fixAfterTyping(view, insert, () =>
        view.dispatch({ changes: { from, to: from + text.length, insert: text.toUpperCase() }, ...isolated }),
      )
    }
    return false
  })
