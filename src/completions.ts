//· completions ·
// Lo que propone el editor al escribir, en la web y el Mac (en el iPhone ya
// están las sugerencias del teclado y la fila de «/» de la barra): las skills
// al escribir «/», en un desplegable, y las palabras, en gris detrás del
// cursor (word-ghost), con el vocabulario del proyecto (vocabulary)
// entre ellas. Las listas llegan por una función: cambian sin rehacer
// CodeMirror. En el desplegable, Intro o Tab aceptan y Esc lo cierra.

import {
  acceptCompletion,
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete"
import { Prec } from "@codemirror/state"
import { keymap } from "@codemirror/view"

import { matchVocabulary, type VocabularyEntry } from "./cita"
import { wordGhost } from "./word-ghost"

// Síncronas: así se prueban sin esperar
type Source = (context: CompletionContext) => CompletionResult | null

// «/» al principio o detrás de un espacio o de lo que abre (no en una ruta)
export const skillCompletions =
  (skills: () => string[]): Source =>
  (context: CompletionContext) => {
    const match = context.matchBefore(/\/[a-z0-9:-]*/)
    if (!match) return null
    const before = context.state.sliceDoc(match.from - 1, match.from)
    if (before && !/[\s(«"“'¿¡]/.test(before)) return null
    return { from: match.from, options: skills().map((label) => ({ label, type: "skill" })), validFor: /^\/[a-z0-9:-]*$/ }
  }

// «#» al principio o detrás de un espacio o de lo que abre (no en «C#»): los
// tags conocidos, al escribir una cita. Filtra ella (sin mayúsculas ni
// tildes, que CodeMirror sí distingue) e inserta la forma guardada con «_»
// donde hay espacios, como se escribe un tag
export const tagCompletions =
  (tags: () => VocabularyEntry[]): Source =>
  (context: CompletionContext) => {
    const match = context.matchBefore(/#[\p{L}\p{N}_.-]*/u)
    if (!match) return null
    const before = context.state.sliceDoc(match.from - 1, match.from)
    if (before && !/[\s(«"“'¿¡]/.test(before)) return null
    const options = matchVocabulary(match.text.slice(1), tags()).map(({ name }) => ({
      label: `#${name}`,
      apply: `#${name.replaceAll(" ", "_")}`,
      type: "tag",
    }))
    return { from: match.from, options, filter: false }
  }

// tags: los conocidos, solo al escribir una cita (que no lleva skills ni palabras)
export type CompletionLists = { skills: string[]; words: string[]; tags?: VocabularyEntry[] }

export const ideaCompletions = (lists: () => CompletionLists) => [
  autocompletion({
    override: [
      skillCompletions(() => lists().skills),
      tagCompletions(() => lists().tags ?? []),
    ],
    icons: false,
  }),
  // Tab también acepta (de serie, solo Intro); sin desplegable, sigue de largo
  Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  // la palabra en gris, salvo al escribir una cita (la lista trae tags): son
  // frases de otros y no enseñan cómo escribes tú
  lists().tags ? [] : wordGhost(() => lists().words),
]
