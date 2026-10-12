//· word-ghost ·
// La palabra en gris: al escribir el principio de una palabra, la que más
// probablemente quieres sale en gris detrás del cursor. Tab la escribe entera;
// seguir escribiendo la cambia o la quita, sin Esc. En la web y el Mac (en el
// iPhone completa el teclado). Sin modelo: un diccionario de lo tuyo, que es
// el vocabulario del proyecto, las palabras de esta idea y las que escribes a
// menudo (las aprende al escribirlas, en el dispositivo: word-uses).
// Una aprendida sale desde la segunda vez, y pierde un punto cada vez que la
// propone y escribes otra: una errata no se queda.
// Se probó antes con un modelo de lenguaje en el dispositivo: llegaba a
// tiempo, pero no acertaba.

import { type EditorState, type Extension, Prec, StateField, type Transaction } from "@codemirror/state"
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view"

import { fold } from "./cita"
import { wordCounts, wordUses } from "./word-uses"

// desde cuántas letras escritas sale, y lo que tiene que medir una palabra
// para que valga la pena aprenderla: en las cortas no se ahorra nada
const MIN_TYPED = 3
const MIN_LEARNED = 6
// las aprendidas salen a partir de la segunda vez: una errata suelta, nunca
const MIN_SEEN = 2
// lo que tiene que faltar, como poco, para proponerla
const MIN_MISSING = 2

// una palabra a medio escribir: con puntos, guiones y barras por dentro, como
// el vocabulario (rutas, nombres de componentes)
const WORD_BEFORE = /[\p{L}\p{N}_][\p{L}\p{N}_./-]*$/u
const WORD_CHAR = /[\p{L}\p{N}_]/u
// las que se aprenden y las que cuentan de la propia idea: solo letras
const PLAIN_WORD = /^\p{L}+$/u
const PLAIN_WORDS = /\p{L}+/gu

export type WordSources = {
  vocabulary: string[] // el del proyecto y el común
  counts: Record<string, number> // las veces que has escrito cada una
  uses: Record<string, number> // las veces que la has aceptado
  inDoc: Set<string> // las de la idea que escribes
}

// Lo que se guarda al aprender: en minúscula si solo la primera es mayúscula
// (empezaba frase); «IdeaCard» o «Upstash» se quedan como están
export const learnedForm = (word: string) => {
  const lower = word.toLocaleLowerCase("es")
  return word.slice(1) === lower.slice(1) ? lower : word
}

// La que se propone para lo escrito, o null: empieza igual (sin mayúsculas ni
// tildes), le falta algo, si es aprendida la has escrito al menos dos veces y,
// entre las que quedan, la que más usas: aceptada
// cuenta el doble que escrita, y estar en la idea o en el vocabulario suma.
// A igualdad, la más corta. word es la del diccionario (la que cuenta al
// aceptarla); insert, la que se escribe: con mayúscula si la llevaba lo escrito
export function suggestWord(typed: string, sources: WordSources): { word: string; insert: string } | null {
  if (typed.length < MIN_TYPED) return null
  const wanted = fold(typed)
  const vocabulary = new Set(sources.vocabulary)
  const seen = Object.keys(sources.counts).filter((word) => sources.counts[word] >= MIN_SEEN)
  const candidates = new Set([...sources.vocabulary, ...seen, ...sources.inDoc])
  let best: { word: string; score: number } | null = null
  for (const word of candidates) {
    if (word.length < typed.length + MIN_MISSING || !fold(word).startsWith(wanted)) continue
    const score =
      (sources.counts[word] ?? 0) +
      2 * (sources.uses[word] ?? 0) +
      (sources.inDoc.has(word) ? 3 : 0) +
      (vocabulary.has(word) ? 1 : 0)
    if (!best || score > best.score || (score === best.score && word.length < best.word.length)) best = { word, score }
  }
  if (!best) return null
  const upper = typed[0] !== typed[0].toLocaleLowerCase("es")
  const word = best.word
  const insert =
    upper && word[0] === word[0].toLocaleLowerCase("es") ? word[0].toLocaleUpperCase("es") + word.slice(1) : word
  return { word, insert }
}

// Las palabras de la idea que valen como candidatas, sin la que se está
// escribiendo (aún está a medias)
export const docWords = (text: string, skipFrom: number, skipTo: number) => {
  const words = new Set<string>()
  for (const match of text.matchAll(PLAIN_WORDS)) {
    const end = match.index + match[0].length
    if (match[0].length >= MIN_LEARNED && (end < skipFrom || match.index > skipTo)) words.add(learnedForm(match[0]))
  }
  return words
}

// La palabra que se acaba de cerrar al escribir un espacio o un signo detrás,
// y dónde empieza; con la forma que se aprende si mide lo bastante (learn)
export function finishedWord(tr: Transaction): { word: string; from: number; learn: boolean } | null {
  if (!tr.docChanged || !tr.isUserEvent("input")) return null
  let word: { word: string; from: number; learn: boolean } | null = null
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const typed = inserted.toString()
    if (fromA !== toA || !typed || WORD_CHAR.test(typed[0])) return
    const before = tr.startState.doc.sliceString(Math.max(0, fromA - 60), fromA).match(WORD_BEFORE)?.[0]
    if (before)
      word = { word: before, from: fromA - before.length, learn: before.length >= MIN_LEARNED && PLAIN_WORD.test(before) }
  })
  return word
}

// La propuesta que se ignoró, si hay que restarle: la palabra que se cerró
// empieza donde ella y no es la propuesta (ni la propuesta con algo más, como
// un plural). Así una errata que se coló deja de salir sola
export function ignoredSuggestion(
  shown: { from: number; word: string } | null,
  finished: { from: number; word: string },
): string | null {
  if (!shown || shown.from !== finished.from) return null
  return fold(finished.word).startsWith(fold(shown.word)) ? null : shown.word
}

//- el gris en el editor -
type Ghost = { from: number; to: number; word: string; insert: string }

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  eq(other: GhostWidget) {
    return other.text === this.text
  }
  toDOM() {
    const span = document.createElement("span")
    span.className = "cm-word-ghost"
    span.textContent = this.text
    return span
  }
  ignoreEvent() {
    return true
  }
}

// Solo al escribir, con el cursor al final de una palabra: borrar, mover el
// cursor o pegar la quitan
const ghostAt = (state: EditorState, vocabulary: string[]): Ghost | null => {
  const selection = state.selection.main
  if (!selection.empty) return null
  const head = selection.head
  if (WORD_CHAR.test(state.sliceDoc(head, head + 1))) return null
  const line = state.doc.lineAt(head)
  const typed = line.text.slice(0, head - line.from).match(WORD_BEFORE)?.[0]
  if (!typed) return null
  const from = head - typed.length
  // detrás de «/» o «#» es una skill o un tag, que tienen su desplegable
  if (/[/#]/.test(state.sliceDoc(from - 1, from))) return null
  const suggestion = suggestWord(typed, {
    vocabulary,
    counts: wordCounts.read(),
    uses: wordUses.read(),
    inDoc: docWords(state.doc.toString(), from, head),
  })
  return suggestion ? { from, to: head, ...suggestion } : null
}

const acceptGhost = (field: StateField<Ghost | null>) => (view: EditorView) => {
  const ghost = view.state.field(field, false)
  if (!ghost) return false
  view.dispatch({
    changes: { from: ghost.from, to: ghost.to, insert: ghost.insert },
    selection: { anchor: ghost.from + ghost.insert.length },
    userEvent: "input.complete",
  })
  wordUses.record(ghost.word)
  return true
}

export function wordGhost(vocabulary: () => string[]): Extension {
  // la última propuesta de la palabra que se escribe
  let shown: { from: number; word: string } | null = null
  const field = StateField.define<Ghost | null>({
    create: () => null,
    // Se calcula al teclear y se queda mientras no cambie nada: el editor
    // lanza transacciones propias sin tocar el texto (el desplegable de skills
    // al mirar si tiene algo, el cursor), y con ellas se borraba al instante
    update(ghost, tr) {
      if (tr.docChanged) return tr.isUserEvent("input.type") ? ghostAt(tr.state, vocabulary()) : null
      const cursor = tr.state.selection.main
      if (ghost && tr.selection && !(cursor.empty && cursor.head === ghost.to)) return null
      return ghost
    },
    provide: (self) =>
      EditorView.decorations.from(self, (ghost) =>
        ghost
          ? Decoration.set([
              Decoration.widget({ widget: new GhostWidget(ghost.insert.slice(ghost.to - ghost.from)), side: 1 }).range(
                ghost.to,
              ),
            ])
          : Decoration.none,
      ),
  })
  return [
    field,
    // por debajo del Tab del desplegable de skills y tags (completions)
    Prec.high(keymap.of([{ key: "Tab", run: acceptGhost(field) }])),
    // Al cerrar una palabra aprende, y le resta a la propuesta si escribiste
    // otra. Fuera del campo, que solo calcula
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        if (tr.isUserEvent("input.complete")) shown = null
        const finished = finishedWord(tr)
        if (!finished) continue
        const ignored = ignoredSuggestion(shown, finished)
        if (ignored) wordCounts.forget(ignored)
        if (finished.learn) wordCounts.record(learnedForm(finished.word))
        shown = null
      }
      const ghost = update.state.field(field)
      if (ghost) shown = { from: ghost.from, word: ghost.word }
    }),
  ]
}
