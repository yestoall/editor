//· format-commands ·
// ⌘B, ⌘I, ⌘K y pegar una URL en una nota del Timeline (ADR 0020 de ideas).
// Sobre EditorState, como pairs. Ven el formato con la misma regla que lo
// pinta (note-format): lo que sale en negrita, ⌘B lo reconoce, se escriba con
// ** o con __. Cada uno es un paso propio para ⌘Z: lo que se escribe justo
// detrás no se deshace con él.

import { isolateHistory } from "@codemirror/commands"
import {
  ChangeSet,
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from "@codemirror/state"

import { type FormatKind, type FormatSpan, formatSpans } from "./note-format"

type Toggled = Exclude<FormatKind, "link">

// el signo de cada uno y el otro, para cuando el de serie dejaría tres
// asteriscos seguidos (***), que la regla no lee
const SIGNS: Record<Toggled, { sign: string; other: string }> = {
  bold: { sign: "**", other: "__" },
  italic: { sign: "*", other: "_" },
}

const asOwnStep = (spec: TransactionSpec, userEvent: string): TransactionSpec => ({
  ...spec,
  userEvent,
  annotations: isolateHistory.of("full"),
})

// Los cambios de un rango y dónde queda su selección, que sigue al texto
const moving = (state: EditorState, range: SelectionRange, changes: ChangeSpec[]) => {
  const set = ChangeSet.of(changes, state.doc.length)
  const from = set.mapPos(range.from, 1)
  const to = range.empty ? from : set.mapPos(range.to, -1)
  return { changes, range: EditorSelection.range(from, to) }
}

const toggleRange = (state: EditorState, spans: FormatSpan[], kind: Toggled, range: SelectionRange) => {
  const { from, to } = range
  const text = state.doc.toString()
  const own = spans.filter((span) => span.kind === kind)
  const signsOf = (span: FormatSpan) => span.signs.map(([f, t]) => ({ from: f, to: t }))

  // la selección lo coge entero, con sus signos: se los quita
  const whole = own.find((span) => span.from === from && span.to === to)
  if (whole) return moving(state, range, signsOf(whole))

  // dentro del texto de uno (el de más dentro)
  const around = own.filter((span) => span.content[0] <= from && to <= span.content[1]).at(-1)
  if (around && range.empty) return moving(state, range, signsOf(around))
  if (around) {
    // se le quita solo a lo seleccionado: por cada lado, o sobra su signo o
    // hace falta otro
    const sign = text.slice(...around.signs[0])
    const [[openFrom, openTo], [closeFrom, closeTo]] = around.signs
    return moving(state, range, [
      from === around.content[0] ? { from: openFrom, to: openTo } : { from, insert: sign },
      to === around.content[1] ? { from: closeFrom, to: closeTo } : { from: to, insert: sign },
    ])
  }

  // sin selección, entre dos signos vacíos que acaba de poner: se van
  const { sign, other } = SIGNS[kind]
  for (const s of [sign, other]) {
    const before = text.slice(from - s.length, from)
    const after = text.slice(to, to + s.length)
    const bigger = text[from - s.length - 1] === s[0] || text[to + s.length] === s[0]
    if (range.empty && before === s && after === s && !bigger) {
      return moving(state, range, [
        { from: from - s.length, to: from },
        { from: to, to: to + s.length },
      ])
    }
  }

  // se pone, con el otro signo si el de serie quedaría pegado a un asterisco
  const touching = [text[from - 1], text[to], text[from], text[to - 1]].includes("*")
  const put = touching ? other : sign
  const changes = [
    { from, insert: put },
    { from: to, insert: put },
  ]
  // sin selección, los dos van al mismo sitio: el cursor, entre ellos
  if (range.empty) return { changes, range: EditorSelection.cursor(from + put.length) }
  return moving(state, range, changes)
}

const toggle = (kind: Toggled) => (state: EditorState) => {
  const spans = formatSpans(state.doc.toString())
  return asOwnStep(
    state.changeByRange((range) => toggleRange(state, spans, kind, range)),
    "input.format",
  )
}

// ⌘B y ⌘I: ponen o quitan la negrita y la cursiva de cada selección
export const toggleBold = toggle("bold")
export const toggleItalic = toggle("italic")

// «[selección](url)» en cada rango, con el cursor donde diga cursor
const wrapLink = (state: EditorState, url: string, cursor: (range: SelectionRange) => number) =>
  state.changeByRange((range) => ({
    changes: [
      { from: range.from, insert: "[" },
      { from: range.to, insert: `](${url})` },
    ],
    range: EditorSelection.cursor(cursor(range)),
  }))

// ⌘K: la selección como «[selección]()», con el cursor entre los paréntesis
// para escribir o pegar la URL. Sin diálogo: en la app de Mac (el WebView de
// Tauri) window.prompt no sale. Sin selección, «[]()» con el cursor en el texto
export const linkSelection = (state: EditorState): TransactionSpec =>
  asOwnStep(
    wrapLink(state, "", ({ from, to }) => (from === to ? from + 1 : to + 3)),
    "input.format",
  )

const LONE_URL = /^https?:\/\/\S+$/

// Pegar una URL sola con texto seleccionado lo convierte en enlace en el
// texto, con el cursor detrás. Sin selección, o si lo pegado no es una URL
// sola, null: se pega como siempre
export const pasteLink = (state: EditorState, pasted: string): TransactionSpec | null => {
  const url = pasted.trim()
  if (!LONE_URL.test(url) || state.selection.ranges.some((range) => range.empty)) return null
  return asOwnStep(
    wrapLink(state, url, ({ to }) => to + url.length + 4),
    "input.paste",
  )
}
