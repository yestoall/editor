//· gray-correction-extension ·
// La corrección en gris en CodeMirror (la decisión, en gray-correction): al
// escribir un espacio detrás de una errata, la errata sale subrayada y la
// buena en gris detrás del cursor. Tab la pone, como un paso que ⌘Z deshace;
// seguir escribiendo la deja, y quien la monta lo apunta (onLeave: a la
// segunda, gray-left la calla). Borrar o mover el cursor la quita sin contar:
// quizá vas a arreglarla a mano. Y al poner el «¿» o el «¡»
// delante de una pregunta ya escrita, a mano o al cerrarla con «?»
// (typography), la tilde de la palabra de detrás va sola: abrir la pregunta
// ya dice lo que querías.

import { isolateHistory } from "@codemirror/commands"
import {
  Annotation,
  type ChangeSpec,
  EditorState,
  type Extension,
  Facet,
  Prec,
  StateField,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state"
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view"

import { correctionFor, type Lexicon, openingAccent } from "./gray-correction"

type Pending = {
  from: number // la errata
  to: number
  word: string
  insert: string // la buena
  at: number // el cursor, detrás del espacio
}

export type GrayCorrectionConfig = {
  lexicon: () => Lexicon | null // null mientras no han llegado los diccionarios
  known: () => Set<string> // las que no se tocan (vocabulario y las calladas), en minúsculas
  onLeave: (word: string) => void // la has dejado al seguir escribiendo
  onAccept: (word: string) => void // la has cambiado con Tab: la errata, para que nadie la aprenda
}

// la transacción que la pone con Tab
const accepted = Annotation.define<boolean>()

// la de este editor (sin ella, el campo no hace nada)
const configFacet = Facet.define<GrayCorrectionConfig, GrayCorrectionConfig | null>({
  combine: (configs) => configs[0] ?? null,
})

//- la palabra que se acaba de terminar -

// La palabra de un trozo entre espacios, sin la puntuación de alrededor; o
// null si no se mira (código, enlaces, #tags, /skills, rutas)
const wordOf = (token: string, inCode: boolean) => {
  if (inCode || token.includes("://") || token.startsWith("www.")) return null
  const [, prefix, core] = token.match(/^([¿¡(«"'“]*)(.*?)([.,;:!?)»"'”…]*)$/u) ?? []
  if (!core || /^[#/@`~]/.test(core)) return null
  return { prefix, word: core }
}

// Si la transacción es un espacio escrito detrás de una errata, lo que se propone
const pendingAfter = (tr: Transaction): Pending | null => {
  const config = tr.state.facet(configFacet)
  if (!config || !tr.isUserEvent("input.type")) return null
  let space: number | null = null
  let count = 0
  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    count++
    if (fromA === toA && inserted.toString() === " ") space = fromB
  })
  const lexicon = config.lexicon()
  if (count !== 1 || space === null || !lexicon) return null
  const at = (space as number) + 1
  const head = tr.state.selection.main
  if (!head.empty || head.head !== at) return null

  const line = tr.state.doc.lineAt(space)
  const before = line.text.slice(0, space - line.from)
  const token = before.match(/(\S+)$/)?.[1]
  if (!token) return null
  const tokenStart = before.length - token.length
  const inCode = (before.slice(0, tokenStart).match(/`/g) ?? []).length % 2 === 1 || token.startsWith("`")
  const target = wordOf(token, inCode)
  if (!target) return null
  const previous = before.slice(0, tokenStart).match(/(\S+)\s*$/)?.[1] ?? ""
  const correction = correctionFor(target.word, lexicon, config.known(), { prefix: target.prefix, previous })
  if (!correction) return null
  const from = line.from + tokenStart + target.prefix.length
  return { from, to: from + target.word.length, word: target.word, insert: correction.to, at }
}

//- en el editor -

class GrayWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  eq(other: GrayWidget) {
    return other.text === this.text
  }
  toDOM() {
    const span = document.createElement("span")
    span.className = "cm-word-ghost cm-gray-correction"
    span.textContent = this.text
    return span
  }
  ignoreEvent() {
    return true
  }
}

const typoMark = Decoration.mark({ class: "cm-gray-typo" })

const pendingField = StateField.define<Pending | null>({
  create: () => null,
  update(pending, tr) {
    if (tr.annotation(accepted)) return null
    if (tr.docChanged) return pendingAfter(tr)
    // las transacciones del editor que no tocan ni el texto ni el cursor no la quitan
    const cursor = tr.state.selection.main
    if (pending && tr.selection && !(cursor.empty && cursor.head === pending.at)) return null
    return pending
  },
  provide: (self) =>
    EditorView.decorations.from(self, (pending) =>
      pending
        ? Decoration.set([
            typoMark.range(pending.from, pending.to),
            Decoration.widget({ widget: new GrayWidget(pending.insert), side: 1 }).range(pending.at),
          ])
        : Decoration.none,
    ),
})

const currentPending = (state: EditorState) => state.field(pendingField, false) ?? null

// Tab: la buena en lugar de la errata, como su propio paso de deshacer. null si
// no hay propuesta (Tab sigue para los demás)
export function acceptGrayCorrection(state: EditorState): TransactionSpec | null {
  const pending = currentPending(state)
  if (!pending) return null
  const changes: ChangeSpec = { from: pending.from, to: pending.to, insert: pending.insert }
  return { changes, annotations: [accepted.of(true), isolateHistory.of("full")], userEvent: "input.complete" }
}

// La palabra que se deja en esta transacción: había propuesta y sigues
// escribiendo sin ponerla. null si no (también al borrar o mover el cursor)
export function leftWordIn(tr: Transaction): string | null {
  const before = currentPending(tr.startState)
  if (!before || tr.annotation(accepted) || !tr.isUserEvent("input.type")) return null
  return currentPending(tr.state) === before ? null : before.word
}

// La errata que esta transacción cambia con Tab, o null
const acceptedWordIn = (tr: Transaction) => (tr.annotation(accepted) ? (currentPending(tr.startState)?.word ?? null) : null)

// El «¿» o el «¡» escrito delante de una pregunta: la tilde de la palabra que
// la abre, en la misma transacción (⌘Z quita las dos cosas)
const accentOnOpening = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent("input")) return tr
  const fixes: ChangeSpec[] = []
  tr.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
    const mark = inserted.toString()
    if (mark !== "¿" && mark !== "¡") return
    const fix = openingAccent(tr.newDoc.sliceString(toB, toB + 60), mark)
    if (fix) fixes.push({ from: toB + fix.at, to: toB + fix.at + fix.length, insert: fix.to })
  })
  return fixes.length ? [tr, { changes: fixes, sequential: true }] : tr
})

export function grayCorrection(config: GrayCorrectionConfig): Extension {
  return [
    configFacet.of(config),
    pendingField,
    accentOnOpening,
    // por encima de la palabra en gris: tras el espacio no hay ninguna
    Prec.high(
      keymap.of([
        {
          key: "Tab",
          run: (view) => {
            const spec = acceptGrayCorrection(view.state)
            if (!spec) return false
            view.dispatch(spec)
            return true
          },
        },
      ]),
    ),
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        const left = leftWordIn(tr)
        if (left) config.onLeave(left)
        const changed = acceptedWordIn(tr)
        if (changed) config.onAccept(changed)
      }
    }),
  ]
}
