//· extensions ·
// Las extensiones de CodeMirror del editor: párrafo activo, cursor de
// bloque, cursor en calma mientras escribes, skills resaltadas y, en un
// enlace, las URLs que se abren. Texto plano, sin Markdown: su soporte
// arrastraba medio bundle (HTML, CSS y JavaScript para el código incrustado)
// y no hace falta.

import { findClusterBreak, RangeSetBuilder, StateEffect } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  layer,
  type LayerMarker,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"

import { TAG_PATTERN } from "./cita"
import { opensOnClick, opensOnPress, urlRanges } from "./link-urls"
import { SKILL_PATTERN } from "./skills"
import { activeParagraph } from "./paragraph"

//- párrafo activo -

const activeParagraphLine = Decoration.line({ class: "cm-paragraph-active" })

export const activeParagraphHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) this.decorations = this.build(update.view)
    }
    build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>()
      const { startLine, endLine } = activeParagraph(view.state)
      for (let n = startLine; n <= endLine; n++) {
        const line = view.state.doc.line(n)
        builder.add(line.from, line.from, activeParagraphLine)
      }
      return builder.finish()
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

//- cursor de bloque -

// Como el de la terminal: un bloque del ancho de una letra con la letra de
// debajo dentro, en el color del fondo. Va en su propia capa, por encima del
// texto y con su copia de la letra: así bloque y letra se deslizan y parpadean
// juntos. El cursor de serie (drawSelection) queda oculto por CSS. Con texto
// seleccionado no se dibuja: tapaba una letra de la selección. Mide lo que
// ocupa de verdad la letra de debajo, hasta la siguiente: con una letra cuyas
// letras no miden todas igual (los glifos «duospace» de Paper Mono) o con
// espacios más estrechos, un ancho fijo pisaba la letra de al lado. Al final
// de la línea, sin letra, el de una (1ch, en el CSS).
class BlockCursor implements LayerMarker {
  constructor(
    readonly left: number,
    readonly top: number,
    readonly height: number,
    readonly char: string,
    readonly width: number | null,
  ) {}

  draw() {
    const dom = document.createElement("div")
    dom.className = "cm-blockCursor"
    this.place(dom)
    return dom
  }

  // reutiliza el elemento: así la transición de CSS lo desliza
  update(dom: HTMLElement) {
    this.place(dom)
    return true
  }

  eq(other: BlockCursor) {
    return (
      this.left === other.left &&
      this.top === other.top &&
      this.height === other.height &&
      this.char === other.char &&
      this.width === other.width
    )
  }

  private place(dom: HTMLElement) {
    dom.style.left = `${this.left}px`
    dom.style.top = `${this.top}px`
    dom.style.height = `${this.height}px`
    dom.style.lineHeight = `${this.height}px`
    // el de la letra; sin ella, el mínimo del CSS
    dom.style.width = this.width === null ? "" : `${this.width}px`
    dom.style.minWidth = this.width === null ? "" : "0"
    dom.textContent = this.char
  }
}

// la letra (o el emoji, entero) que queda bajo el cursor; al final de línea, nada
const charAt = (view: EditorView, pos: number) => {
  const line = view.state.doc.lineAt(pos)
  if (pos >= line.to) return ""
  return line.text.slice(pos - line.from, findClusterBreak(line.text, pos - line.from))
}

// La letra ha cambiado de tamaño o de fuente (por variables de CSS, fuera de
// CodeMirror). El cursor se redibuja con este aviso: con solo requestMeasure,
// tras ⌘+ se quedaba donde estaba y con el alto de antes.
export const fontChanged = StateEffect.define<null>()

const hasFontChanged = (update: ViewUpdate) =>
  update.transactions.some((tr) => tr.effects.some((effect) => effect.is(fontChanged)))

// Un poco más alto que la letra (lo que mide coordsAtPos), centrado en ella:
// con el interlineado de 1,6 aún no roza la línea de al lado
const CURSOR_STRETCH = 1.2

export const blockCursor = layer({
  above: true,
  class: "cm-blockCursorLayer",
  update: (update) =>
    update.docChanged || update.selectionSet || update.geometryChanged || update.focusChanged || hasFontChanged(update),
  markers(view) {
    const { main } = view.state.selection
    if (!main.empty) return []
    const coords = view.coordsAtPos(main.head, main.assoc || 1)
    if (!coords) return []
    // como el getBase de CodeMirror: relativo a la capa, que se mueve con el scroll
    const rect = view.scrollDOM.getBoundingClientRect()
    const left = (coords.left - rect.left) / view.scaleX + view.scrollDOM.scrollLeft
    const top = (coords.top - rect.top) / view.scaleY + view.scrollDOM.scrollTop
    const glyph = (coords.bottom - coords.top) / view.scaleY
    const height = glyph * CURSOR_STRETCH
    const char = charAt(view, main.head)
    // hasta donde empieza la siguiente, si está en la misma línea de pantalla
    // (una línea que se parte justo ahí no tiene a quién medir)
    const next = char ? view.coordsAtPos(main.head + char.length, -1) : null
    const width = next && next.top === coords.top && next.left > coords.left ? (next.left - coords.left) / view.scaleX : null
    return [new BlockCursor(left, top - (height - glyph) / 2, height, char, width)]
  },
})

//- cursor en calma -

// Mientras escribes o mueves el cursor, quieto y sin parpadeo; al parar,
// vuelve el parpadeo con fundido; y tras un rato sin tocar nada, en reposo, el
// parpadeo pasa a un pulso lento, como el piloto de un portátil que duerme.
// Las clases van en el contenedor propio: CodeMirror reescribe las de su raíz.
const CALM_MS = 550
const IDLE_MS = 10_000

export const cursorCalm = ViewPlugin.fromClass(
  class {
    timer = 0
    idleTimer = 0
    constructor(readonly view: EditorView) {
      this.restIn()
    }
    // el contenedor se busca al momento: al crear el plugin aún no está puesto
    host() {
      return this.view.dom.parentElement
    }
    restIn() {
      clearTimeout(this.idleTimer)
      this.idleTimer = window.setTimeout(() => this.host()?.classList.add("is-idle"), IDLE_MS)
    }
    update(update: ViewUpdate) {
      if (!update.docChanged && !update.selectionSet) return
      const host = this.host()
      if (!host) return
      host.classList.remove("is-idle")
      host.classList.add("is-still")
      host.classList.toggle("is-typing", update.docChanged)
      clearTimeout(this.timer)
      this.timer = window.setTimeout(() => host.classList.remove("is-still", "is-typing"), CALM_MS)
      this.restIn()
    }
    destroy() {
      clearTimeout(this.timer)
      clearTimeout(this.idleTimer)
    }
  },
)

//- skills -

// Las palabras con barra (/git, /ask-matt) en el color de acento: son
// instrucciones para Claude, no texto (ver skills)
const skillMark = Decoration.mark({ class: "cm-skill" })

const skillMatcher = new MatchDecorator({
  regexp: SKILL_PATTERN,
  // sin lo de delante (el espacio o el paréntesis que abre)
  decorate: (add, from, to, match) => add(from + match[1].length, to, skillMark),
})

// Un resaltado por expresión: las skills y, al escribir una cita, los tags
const highlight = (matcher: MatchDecorator) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view)
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations)
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )

export const skillHighlight = highlight(skillMatcher)

//- tags de una cita -

// Los #tags de una cita, en acento como las skills (comparten la
// clase y su CSS): no son de la cita, se guardan aparte
export const tagHighlight = highlight(
  new MatchDecorator({ regexp: TAG_PATTERN, decorate: (add, from, to) => add(from, to, skillMark) }),
)

//- URLs, como botones -

// En una pastilla (css.ts), con la URL en el elemento: las mismas que link-urls (sin la
// puntuación de la frase ni un paréntesis de cierre que no abrió ella). Sobre
// el texto entero, que es corto (como mucho, el de una idea)
const urlDecorations = (view: EditorView) => {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to, url } of urlRanges(view.state.doc.toString())) {
    builder.add(from, to, Decoration.mark({ class: "cm-url", attributes: { "data-url": url } }))
  }
  return builder.finish()
}

const urlHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = urlDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = urlDecorations(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

// Se abren al tocarlas (en el iPhone: onTap) o, con ratón, con un clic, como
// un botón; con ⌥ y clic se pone el cursor para editarlas (link-urls,
// opensOnClick). Lo que se abre lo decide open
const urlUnder = (event: Event) => (event.target as HTMLElement | null)?.closest?.<HTMLElement>(".cm-url")?.dataset.url

export const urlLinks = ({ open, onTap }: { open: (url: string) => void; onTap: boolean }) => [
  urlHighlight,
  EditorView.domEventHandlers({
    // con ⌘, al pulsar: el editor no llega a poner el cursor
    mousedown(event) {
      const url = urlUnder(event)
      if (!url || onTap || !opensOnPress(event)) return false
      event.preventDefault()
      open(url)
      return true
    },
    // sin ⌘, al soltar, si el clic no ha seleccionado nada
    click(event, view) {
      const url = urlUnder(event)
      if (!url) return false
      if (!onTap && !opensOnClick({ ...modifiers(event), selectionEmpty: view.state.selection.main.empty })) return false
      event.preventDefault()
      open(url)
      return true
    },
  }),
]

const modifiers = ({ metaKey, ctrlKey, altKey, shiftKey }: MouseEvent) => ({ metaKey, ctrlKey, altKey, shiftKey })
