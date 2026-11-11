//· prototipo: Markdown en las notas ·
// PROTOTIPO, para tirar (rama prototype/markdown-notas). Cuatro variantes de
// cuándo se ven las marcas de negrita, cursiva y enlace mientras escribes una
// nota del Timeline. Sin @codemirror/lang-markdown: tres expresiones regulares.

import { defaultKeymap, history as undoHistory, historyKeymap } from "@codemirror/commands"
import { Compartment, EditorSelection, type EditorState, type Range } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"

//- las variantes -

type VariantKey = "A" | "B" | "C" | "D"

const VARIANTS: Record<VariantKey, { name: string; description: string }> = {
  A: {
    name: "Párrafo",
    description:
      "Como Obsidian: en el párrafo del cursor se ven todas las marcas; en los demás, solo el formato. Una nota corta suele ser un párrafo, así que mientras escribes casi siempre las verás.",
  },
  B: {
    name: "Elemento",
    description:
      "Como Typora o Bear: solo se ven las marcas de lo que toca el cursor. El resto del párrafo sale ya con su formato.",
  },
  C: {
    name: "Siempre, en gris",
    description:
      "Como iA Writer: las marcas no se esconden nunca, pero van apagadas y el formato se aplica igual. El texto no se mueve al pasar el cursor.",
  },
  D: {
    name: "Nunca",
    description:
      "Las marcas no se ven nunca y el cursor las salta. El formato se da con ⌘B, ⌘I y ⌘K, como en un procesador de textos.",
  },
}

const KEYS = Object.keys(VARIANTS) as VariantKey[]

//- el análisis -

type Token = {
  type: "bold" | "italic" | "link"
  from: number
  to: number
  // las marcas: «**», «*», «_», «[» y «](url)»
  marks: [number, number][]
  content: [number, number]
  url?: string
}

const PATTERNS: { type: Token["type"]; re: RegExp; open: (m: RegExpExecArray) => number; close: (m: RegExpExecArray) => number }[] = [
  {
    type: "link",
    re: /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    open: () => 1,
    close: (m) => m[2].length + 3,
  },
  { type: "bold", re: /\*\*(?=\S)([^\n]*?\S)\*\*/g, open: () => 2, close: () => 2 },
  { type: "italic", re: /(?<![*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, open: () => 1, close: () => 1 },
  { type: "italic", re: /(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, open: () => 1, close: () => 1 },
]

function parse(text: string): Token[] {
  const tokens: Token[] = []
  for (const { type, re, open, close } of PATTERNS) {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const from = m.index
      const to = from + m[0].length
      const o = open(m)
      const c = close(m)
      tokens.push({
        type,
        from,
        to,
        marks: [
          [from, from + o],
          [to - c, to],
        ],
        content: [from + o, to - c],
        url: type === "link" ? m[2] : undefined,
      })
    }
  }
  return tokens.sort((a, b) => a.from - b.from)
}

// el texto como iría a X y Bluesky: sin marcas, y el enlace, solo su texto
function plain(text: string): string {
  const hidden = parse(text).flatMap((t) => t.marks)
  hidden.sort((a, b) => a[0] - b[0])
  let out = ""
  let at = 0
  for (const [from, to] of hidden) {
    if (from < at) continue
    out += text.slice(at, from)
    at = to
  }
  return out + text.slice(at)
}

//- cuándo se ven las marcas -

function revealed(variant: VariantKey, token: Token, state: EditorState): boolean {
  if (variant === "C") return true
  if (variant === "D") return false
  return state.selection.ranges.some((r) => {
    if (variant === "B") return r.from <= token.to && r.to >= token.from
    const line = state.doc.lineAt(token.from)
    return r.from <= line.to && r.to >= line.from
  })
}

//- las decoraciones -

const contentClass = { bold: "cm-md-bold", italic: "cm-md-italic", link: "cm-md-link" }
const markDeco = Decoration.mark({ class: "cm-md-mark" })
const hideDeco = Decoration.replace({})

function markdownPreview(variant: VariantKey) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      hidden: DecorationSet
      constructor(view: EditorView) {
        ;[this.decorations, this.hidden] = this.build(view.state)
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) [this.decorations, this.hidden] = this.build(update.state)
      }
      build(state: EditorState): [DecorationSet, DecorationSet] {
        const decos: Range<Decoration>[] = []
        const hidden: Range<Decoration>[] = []
        for (const token of parse(state.doc.toString())) {
          const [cFrom, cTo] = token.content
          if (cTo > cFrom) {
            decos.push(Decoration.mark({ class: contentClass[token.type] }).range(cFrom, cTo))
          }
          const show = revealed(variant, token, state)
          for (const [from, to] of token.marks) {
            if (show) decos.push(markDeco.range(from, to))
            else {
              decos.push(hideDeco.range(from, to))
              hidden.push(hideDeco.range(from, to))
            }
          }
        }
        return [Decoration.set(decos, true), Decoration.set(hidden, true)]
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      // que el cursor salte las marcas escondidas, como si no estuvieran
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.hidden ?? Decoration.none),
    },
  )
}

//- dar formato con el teclado -

function wrap(open: string, close: string) {
  return (view: EditorView) => {
    view.dispatch(
      view.state.changeByRange((range) => {
        const text = view.state.sliceDoc(range.from, range.to)
        const before = view.state.sliceDoc(range.from - open.length, range.from)
        const after = view.state.sliceDoc(range.to, range.to + close.length)
        // ya lo tenía: se lo quita
        if (before === open && after === close) {
          return {
            changes: [
              { from: range.from - open.length, to: range.from },
              { from: range.to, to: range.to + close.length },
            ],
            range: EditorSelection.range(range.from - open.length, range.to - open.length),
          }
        }
        return {
          changes: { from: range.from, to: range.to, insert: open + text + close },
          range: EditorSelection.range(range.from + open.length, range.to + open.length),
        }
      }),
    )
    return true
  }
}

function link(view: EditorView, url?: string) {
  const range = view.state.selection.main
  const href = url ?? window.prompt("URL del enlace", "https://")
  if (!href) return true
  const text = view.state.sliceDoc(range.from, range.to) || href
  const insert = `[${text}](${href})`
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
  })
  return true
}

const formatting = keymap.of([
  { key: "Mod-b", run: wrap("**", "**") },
  { key: "Mod-i", run: wrap("*", "*") },
  { key: "Mod-k", run: (view) => link(view) },
])

// pegar una URL con texto seleccionado lo convierte en enlace
const pasteLink = EditorView.domEventHandlers({
  paste(event, view) {
    const pasted = event.clipboardData?.getData("text/plain").trim() ?? ""
    if (view.state.selection.main.empty || !/^https?:\/\/\S+$/.test(pasted)) return false
    event.preventDefault()
    return link(view, pasted)
  },
})

//- el estado, a la vista -

const LIMIT = 250
const segmenter = new Intl.Segmenter("es", { granularity: "grapheme" })
const graphemes = (s: string) => [...segmenter.segment(s)].length

function escape(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
}

function renderState(state: EditorState) {
  const text = state.doc.toString()
  const flat = plain(text)
  const withMarks = graphemes(text)
  const withoutMarks = graphemes(flat)
  const count = (n: number) => `<strong class="${n > LIMIT ? "over" : ""}">${n}</strong> / ${LIMIT}`
  const tokens = parse(text)
    .map((t) => `${t.type.padEnd(6)} ${t.from}–${t.to}${t.url ? `  ${t.url}` : ""}`)
    .join("\n")
  document.querySelector("#state")!.innerHTML = [
    `<div><h2>Cuenta del tope (ADR 0019)</h2><div class="counts"><span>Con marcas: ${count(withMarks)}</span><span>Sin marcas: ${count(withoutMarks)}</span></div></div>`,
    `<div><h2>Lo que se guarda</h2><pre>${escape(text)}</pre></div>`,
    `<div><h2>Lo que iría a X y Bluesky</h2><pre>${escape(flat)}</pre></div>`,
    `<div><h2>Lo que reconoce</h2><pre>${escape(tokens) || "nada"}</pre></div>`,
  ].join("")
}

//- el editor -

const SAMPLE = [
  "Hoy he pasado las notas del **Timeline** a Markdown: *negrita*, cursiva y [enlaces](https://yestoall.com/timeline). En X y Bluesky salen en texto plano, y en la web, con su formato.",
  "",
  "Lo que más me gusta: que **las marcas no estorban** mientras escribes.",
].join("\n")

function currentVariant(): VariantKey {
  const v = new URLSearchParams(location.search).get("variant")?.toUpperCase()
  return KEYS.includes(v as VariantKey) ? (v as VariantKey) : "A"
}

const preview = new Compartment()
let variant = currentVariant()

const view = new EditorView({
  doc: SAMPLE,
  parent: document.querySelector("#editor")!,
  extensions: [
    undoHistory(),
    keymap.of([...historyKeymap, ...defaultKeymap]),
    formatting,
    pasteLink,
    EditorView.lineWrapping,
    preview.of(markdownPreview(variant)),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) renderState(u.state)
    }),
  ],
})

//- la barra de las variantes -

function show(next: VariantKey) {
  variant = next
  const url = new URL(location.href)
  url.searchParams.set("variant", next)
  history.replaceState(null, "", url)
  view.dispatch({ effects: preview.reconfigure(markdownPreview(next)) })
  document.querySelector("#variant-name")!.textContent = `${next} · ${VARIANTS[next].name}`
  document.querySelector("#variant-description")!.textContent = VARIANTS[next].description
  document.querySelector("#switcher-label")!.textContent = `${next} (${VARIANTS[next].name})`
}

function step(by: number) {
  const i = KEYS.indexOf(variant)
  show(KEYS[(i + by + KEYS.length) % KEYS.length])
}

document.querySelector("#prev")!.addEventListener("click", () => step(-1))
document.querySelector("#next")!.addEventListener("click", () => step(1))
document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement
  if (target.closest("input, textarea, [contenteditable]")) return
  if (e.key === "ArrowLeft") step(-1)
  if (e.key === "ArrowRight") step(1)
})

show(variant)
renderState(view.state)
view.focus()
