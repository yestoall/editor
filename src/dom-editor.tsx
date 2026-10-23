"use dom"

//· DomEditor ·
// CodeMirror 6 dentro de un DOM component: el mismo editor en el iPhone (en
// un WKWebView) y en la web. Rutas relativas: el bundle del webview no pasa
// por los alias de la app. Lo monta un envoltorio de cada app, que decide sus
// props (colores, letra, vocabulario…).

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state"
import { drawSelection, dropCursor, EditorView, keymap, placeholder } from "@codemirror/view"
import { useEffect, useRef, useState } from "react"

import { clearAll, insertSkill, PARAGRAPH_COMMANDS } from "./commands"
import { type CompletionLists, ideaCompletions } from "./completions"
import { colorVariables, EDITOR_CSS, type EditorColors } from "./css"
import {
  activeParagraphHighlight,
  blockCursor,
  cursorCalm,
  fontChanged,
  skillHighlight,
  tagHighlight,
  urlLinks,
} from "./extensions"
import {
  clampFontSize,
  FONT_SIZE,
  featuresForEngine,
  fontCss,
  fontFamily,
  type FontFeature,
  fontFeatureSettings,
  type FontKey,
  type FontWeight,
} from "./fonts"
import type { VocabularyEntry } from "./cita"
import KeyboardBar, { type TagSuggestions } from "./keyboard-bar"
import { suggestTags } from "./tag-suggestions"
import { vocabularyCandidate } from "./vocabulary"
import { copyOnSelect as copyOnSelectExtension } from "./copy-on-select"
import { LIST_COMMANDS } from "./lists"
import { grayCorrection as grayCorrectionExtension } from "./gray-correction-extension"
import { leftWords } from "./gray-left"
import { type Lexicon, vocabularyWords } from "./gray-correction"
import { lexiconWhenIdle } from "./gray-lexicon"
import { unlearnWord } from "./word-ghost"
import { deletePairCommand, pairsInput } from "./pairs"
import { createFixWatcher } from "./fix-ready"
import { type Availability, type RewriteMode, type RewriteResult, rewriteBusy, runRewrite } from "./rewrite"
import { selectedText, textHuggingSelection } from "./selection"
import { ideaSearch } from "./search"
import { spanishTypography } from "./typography"
import { typewriter as typewriterExtension } from "./typewriter"

// Lo que se lee en gris en una idea vacía; se va al escribir
const PLACEHOLDER = "Escribe la idea…"

// Marca la transacción que mete el texto inicial: no es una edición
const initialTextLoad = Annotation.define<boolean>()

type Props = {
  // El texto llega por una función y no como prop: react-native-webview mete
  // las props iniciales en una plantilla de JS sin escaparlas, y un texto con
  // saltos de línea o comillas rompía el JSON y el editor no arrancaba
  loadInitialText: () => Promise<string>
  autoFocus: boolean
  keyboardBar: boolean // la barra sobre el teclado (en el iPhone, con el teclado fuera)
  skills?: string[] // las más usadas, para el «/» de la barra
  // lo que se propone al escribir (las skills y el vocabulario del proyecto),
  // en la web y el Mac; sin ellas, nada (el iPhone tiene las del teclado)
  completions?: CompletionLists
  // los tags conocidos, de más a menos usados: al escribir un #, la barra del
  // teclado del iPhone sugiere los que casan (en la web y el Mac, completions)
  keyboardTags?: VocabularyEntry[]
  readOnly: boolean // se lee pero no se edita (quien lo usa decide cuándo)
  capitalize: boolean // mayúscula al empezar frase; en el iPhone la pone el teclado
  copyOnSelect?: boolean // lo seleccionado, al portapapeles sin ⌘C (web y Mac)
  highlightSkills: boolean // las /skills en acento; en las ideas de la IA son texto
  placeholderText?: string // lo gris del editor vacío; de serie, el de una idea
  highlightTags?: boolean // los #tags en acento: al escribir una cita
  // abrir una URL del texto, que va como un botón: al tocarla (openUrlOnTap,
  // en un enlace del iPhone) o con un clic. Sin ella, las URLs son texto
  openUrl?: (url: string) => Promise<void>
  openUrlOnTap?: boolean
  font: FontKey
  fontWeight: FontWeight
  // los interruptores encendidos de la letra (Paper Mono); los que no sabe
  // pintar el motor del webview se quedan fuera (fonts.ts, featuresForEngine)
  fontFeatures?: FontFeature[]
  fontOrigin: string // de dónde sale una iA: "" en la web; la de producción, en el webview
  initialFontSize: number
  colors: EditorColors // los de la app: el webview no ve sus variables de CSS
  margin?: number // dónde empieza el texto, desde el borde; de serie, 22
  marginEnd?: number // y dónde acaba, desde el de la derecha; de serie, el mismo
  marginTop?: number // y dónde empieza, desde arriba; la trama sigue por encima. De serie, 4
  keyboardBarRadius?: number // las esquinas de arriba de la barra, como las del teclado; de serie, 0
  onChangeText: (text: string) => Promise<void>
  onFontSizeChange: (size: number) => Promise<void>
  haptic: () => Promise<void>
  // Corregir y Aclarar con el modelo del iPhone; sin ellas (la web, el Mac), no hay ✦
  aiAvailability?: Availability
  rewrite?: (text: string, mode: RewriteMode) => Promise<RewriteResult>
  // una reescritura pedida desde fuera (el envoltorio, para un atajo o un botón):
  // cada id nuevo, una; el resultado vuelve por onRewriteResult con su id
  rewriteRequest?: { id: number; payload: RewriteMode }
  onRewriteResult?: (id: number, result: RewriteResult | null) => Promise<void>
  // el ✦ encendido (fix-ready): tras una pausa, Corregir en silencio; sin él
  // (el interruptor de la app, o sin modelo), nada. Cada cambio, cuántas
  // palabras cambiarían (0, apagado): la barra del Mac lo pinta
  fixReady?: boolean
  onFixReadyChange?: (words: number) => Promise<void>
  clearRequest?: number // cada número nuevo vacía el editor, como un paso que ⌘Z deshace
  blurRequest?: number // cada número nuevo le quita el foco: en el iPhone, baja el teclado
  // una skill pedida desde fuera (la chuleta de la barra de abajo): cada id
  // nuevo la escribe en el cursor, como la fila de «/» del iPhone
  insertRequest?: { id: number; skill: string }
  // lo seleccionado, si puede ser un término del vocabulario (vocabulary);
  // si no, "". Solo cuando cambia: la barra de abajo saca su botón (web y Mac)
  onSelectedTermChange?: (term: string) => Promise<void>
  onReady: () => Promise<void> // CodeMirror ya ha pintado el texto: fuera el spinner
  searchable?: boolean // buscar y reemplazar con ⌘F (search): en la web y el Mac
  // lo que tapa abajo (la barra de la letra y el ✓): al escribir, el cursor no
  // baja de ahí, el texto sube antes
  scrollBottom?: number
  typewriter?: boolean // la escritura centrada (typewriter)
  // la corrección en gris (gray-correction): la carpeta de la que se piden sus
  // diccionarios (la URL acaba en «/») y, si no hay sugerencias (completions),
  // el vocabulario que no toca. Sin ella, el subrayado del sistema
  grayCorrection?: { dictionaries: string; vocabulary?: string[] }
  dom?: import("expo/dom").DOMProps
}

// sin interruptores, de serie
const NO_FEATURES: FontFeature[] = []


// El tamaño de letra manda aquí mientras el editor está abierto: llega el
// guardado al montar y se avisa a nativo de los cambios para que los guarde.
// Si volviera como prop, un valor atrasado del puente haría saltar el zoom.
// las mismas sugerencias en el mismo sitio: no hace falta volver a pintar
const sameSuggestions = (a: TagSuggestions, b: TagSuggestions) =>
  a === b ||
  (!!a &&
    !!b &&
    a.tag.from === b.tag.from &&
    a.options.length === b.options.length &&
    a.options.every((entry, i) => entry.name === b.options[i].name))

export default function DomEditor({
  loadInitialText,
  autoFocus,
  keyboardBar,
  skills = [],
  completions,
  keyboardTags,
  readOnly,
  capitalize,
  copyOnSelect = false,
  highlightSkills,
  placeholderText = PLACEHOLDER,
  highlightTags = false,
  openUrl,
  openUrlOnTap = false,
  font,
  fontWeight,
  fontFeatures = NO_FEATURES,
  fontOrigin,
  initialFontSize,
  colors,
  margin = 22,
  marginEnd = margin,
  marginTop = 4,
  keyboardBarRadius = 0,
  onChangeText,
  onFontSizeChange,
  haptic,
  aiAvailability = "unavailable",
  rewrite,
  rewriteRequest,
  onRewriteResult,
  fixReady = false,
  onFixReadyChange,
  clearRequest,
  blurRequest,
  insertRequest,
  onSelectedTermChange,
  onReady,
  searchable = false,
  scrollBottom = 0,
  typewriter = false,
  grayCorrection,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // CodeMirror y los listeners se crean una vez: leen siempre lo último
  const latestProps = useRef({
    onChangeText,
    onFontSizeChange,
    haptic,
    rewrite,
    onRewriteResult,
    onFixReadyChange,
    completions,
    keyboardTags,
    openUrl,
    onSelectedTermChange,
    scrollBottom,
    grayCorrection,
  })
  latestProps.current = {
    onChangeText,
    onFontSizeChange,
    haptic,
    rewrite,
    onRewriteResult,
    onFixReadyChange,
    completions,
    keyboardTags,
    openUrl,
    onSelectedTermChange,
    scrollBottom,
    grayCorrection,
  }
  //- el ✦ encendido -
  // El vigilante (fix-ready) pregunta al modelo en las pausas y contesta
  // Corregir y Aclarar: encendido, Corregir aplica lo ya calculado
  const latestFixReady = useRef(fixReady)
  latestFixReady.current = fixReady
  const [fixWords, setFixWords] = useState(0)
  // uno por editor, creado una vez
  const [fixWatcher] = useState(() =>
    createFixWatcher({
      rewrite: (text, mode) => {
        const model = latestProps.current.rewrite
        return model ? model(text, mode) : Promise.resolve({ ok: false, reason: "unavailable" })
      },
      isActive: () => {
        const editor = view.current
        return latestFixReady.current && !!editor && editor.hasFocus && !editor.state.readOnly
      },
      onChange: (words) => {
        setFixWords(words)
        void latestProps.current.onFixReadyChange?.(words)
      },
    }),
  )
  useEffect(() => {
    if (!fixReady) fixWatcher.stop()
  }, [fixReady, fixWatcher])
  useEffect(() => () => fixWatcher.stop(), [fixWatcher])

  // los #tags que la barra del teclado sugiere donde está el cursor
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestions>(null)
  // el último término avisado: solo se avisa al cambiar
  const selectedTerm = useRef("")
  const fontSize = useRef(initialFontSize)
  // el texto llega en diferido: al montar CodeMirror vale el readOnly de ese momento
  const latestReadOnly = useRef(readOnly)
  latestReadOnly.current = readOnly
  const readOnlyMode = useRef(new Compartment())
  const readOnlyExtensions = (on: boolean) => [EditorState.readOnly.of(on), EditorView.editable.of(!on)]
  const latestTypewriter = useRef(typewriter)
  latestTypewriter.current = typewriter
  const typewriterMode = useRef(new Compartment())
  // la corrección en gris: su léxico, cuando la página está quieta, y se
  // enciende o se apaga con el editor abierto (el interruptor de la app)
  const lexicon = useRef<Lexicon | null>(null)
  const dictionaries = grayCorrection?.dictionaries
  const latestDictionaries = useRef(dictionaries)
  latestDictionaries.current = dictionaries
  const grayMode = useRef(new Compartment())
  useEffect(() => {
    if (!dictionaries) return
    return lexiconWhenIdle(dictionaries, (loaded) => {
      lexicon.current = loaded
    })
  }, [dictionaries])
  // encendida, la propuesta y nada del subrayado del sistema, que marca
  // también la jerga; apagada, el del sistema vuelve
  const grayExtensions = (on: boolean) =>
    on
      ? [
          grayCorrectionExtension({
            lexicon: () => lexicon.current,
            known: () => {
              const { grayCorrection, completions } = latestProps.current
              const vocabulary = vocabularyWords(grayCorrection?.vocabulary ?? completions?.words ?? [])
              return new Set([...vocabulary, ...leftWords.silenced()])
            },
            onLeave: (word) => leftWords.leave(word),
            onAccept: unlearnWord,
          }),
          EditorView.contentAttributes.of({ spellcheck: "false" }),
        ]
      : []

  // la letra cambia por CSS: CodeMirror vuelve a medir y el cursor se redibuja
  const afterFontChange = () => {
    view.current?.requestMeasure()
    view.current?.dispatch({ effects: fontChanged.of(null) })
  }
  const applyFontSize = (size: number) => {
    document.documentElement.style.setProperty("--fs", `${size}px`)
    afterFontChange()
  }
  // persist: false durante el pellizco; se guarda una vez al soltar
  const zoomTo = (size: number, { persist = true } = {}) => {
    const next = clampFontSize(size)
    if (next !== fontSize.current) {
      fontSize.current = next
      applyFontSize(next)
    }
    if (persist) latestProps.current.onFontSizeChange(next)
  }

  //- colores que llegan de fuera (el fondo cambia en vivo desde la paleta) -
  // Antes que CodeMirror: el primer pintado ya los lleva
  const colorKey = JSON.stringify(colors)
  useEffect(() => {
    const root = document.documentElement.style
    const variables = colorVariables(colors)
    for (const [name, value] of variables) root.setProperty(name, value)
    return () => {
      for (const [name] of variables) root.removeProperty(name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey])

  //- margen que llega de fuera -
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty("--margin", `${margin}px`)
    root.setProperty("--margin-end", `${marginEnd}px`)
    root.setProperty("--margin-top", `${marginTop}px`)
    root.setProperty("--bar-radius", `${keyboardBarRadius}px`)
    return () => {
      root.removeProperty("--margin")
      root.removeProperty("--margin-end")
      root.removeProperty("--margin-top")
      root.removeProperty("--bar-radius")
    }
  }, [margin, marginEnd, marginTop, keyboardBarRadius])

  //- CodeMirror -
  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = EDITOR_CSS
    document.head.appendChild(style)
    // el pellizco cambia el tamaño de letra, no hace zoom de página. En la web
    // el editor vive en el documento de la app: al cerrarse se restaura todo.
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    const meta = existingMeta ?? document.head.appendChild(document.createElement("meta"))
    const previousViewport = meta.content
    meta.name = "viewport"
    meta.content = "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"
    applyFontSize(fontSize.current)

    // CodeMirror se monta al instante, vacío, y el foco de una idea nueva va en
    // el acto: iOS solo saca el teclado sin un toque mientras la página carga,
    // y esperar al texto (un viaje por el puente) lo dejaba sin foco. El texto
    // entra después, fuera del historial de deshacer y sin autoguardado.
    let cancelled = false
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        extensions: [
          history(),
          readOnlyMode.current.of(readOnlyExtensions(latestReadOnly.current)),
          rewriteBusy.of([]), // solo lectura mientras el modelo piensa (rewrite)
          drawSelection({ cursorBlinkRate: 0 }),
          dropCursor(), // dónde cae lo que se arrastra dentro de la idea
          // al llevar el cursor a la vista, sin meterlo bajo la barra de abajo
          EditorView.scrollMargins.of(() => ({ bottom: latestProps.current.scrollBottom })),
          typewriterMode.current.of(typewriterExtension(latestTypewriter.current)),
          searchable ? ideaSearch : [],
          textHuggingSelection,
          selectedText,
          copyOnSelect ? copyOnSelectExtension : [],
          EditorView.lineWrapping,
          placeholder(placeholderText),
          activeParagraphHighlight,
          blockCursor,
          cursorCalm,
          spanishTypography({ capitalize }),
          pairsInput, // comillas y paréntesis que se cierran solos
          // delante de las sugerencias: tras el espacio, el Tab es suyo
          grayMode.current.of(grayExtensions(!!latestDictionaries.current)),
          // al montar: con listas (web), sugerencias, que leen siempre las últimas
          latestProps.current.completions
            ? ideaCompletions(() => latestProps.current.completions ?? { skills: [], words: [] })
            : [],
          highlightSkills ? skillHighlight : [],
          highlightTags ? tagHighlight : [],
          // al montar, como las sugerencias: un enlace las tiene desde el principio
          latestProps.current.openUrl
            ? urlLinks({ open: (url) => void latestProps.current.openUrl?.(url), onTap: openUrlOnTap })
            : [],
          // delante del keymap de serie: Alt+↑↓ ahí mueve líneas, aquí párrafos
          keymap.of([
            { key: "Alt-ArrowUp", run: PARAGRAPH_COMMANDS.moveUp },
            { key: "Alt-ArrowDown", run: PARAGRAPH_COMMANDS.moveDown },
            { key: "Mod-l", run: PARAGRAPH_COMMANDS.select, preventDefault: true },
            // las listas: Intro sigue la viñeta, y en una vacía la cierra
            { key: "Enter", run: LIST_COMMANDS.enter },
            { key: "Backspace", run: LIST_COMMANDS.backspace },
            { key: "Backspace", run: deletePairCommand }, // entre un par vacío, los dos
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // con sugerencias propias (web y Mac), fuera las del sistema: las burbujas
          // de autocorrección y la predicción en gris, que no se eligen con el
          // teclado y se quedan el Tab. En el iPhone, las del teclado
          EditorView.contentAttributes.of(
            latestProps.current.completions
              ? { autocapitalize: "sentences", spellcheck: "true", autocorrect: "off", writingsuggestions: "false" }
              : { autocapitalize: "sentences", spellcheck: "true", autocorrect: "on" },
          ),
          EditorView.updateListener.of((update) => {
            const loading = update.transactions.some((tr) => tr.annotation(initialTextLoad))
            if (update.docChanged && !loading) latestProps.current.onChangeText(update.state.doc.toString())
            // el ✦ encendido: lo del principio no es nuevo, y lo que entra de
            // Corregir o Aclarar es la nueva base
            if (update.docChanged) {
              const text = update.state.doc.toString()
              if (loading) fixWatcher.loaded(text)
              else if (update.transactions.some((tr) => tr.isUserEvent("input.rewrite"))) fixWatcher.rewritten(text)
              else fixWatcher.edited(text)
            }
            const tags = latestProps.current.keyboardTags
            if (tags && (update.selectionSet || update.docChanged)) {
              const { empty, head } = update.state.selection.main
              const next = empty ? suggestTags(update.state.doc.toString(), head, tags, 20) : null
              // solo si cambia lo que se enseña: cada render cuesta en el webview
              setTagSuggestions((current) => (sameSuggestions(current, next) ? current : next))
            }
            const onTerm = latestProps.current.onSelectedTermChange
            if (onTerm && (update.selectionSet || update.docChanged)) {
              // una selección larga no es un término: ni se lee entera
              const { from, to } = update.state.selection.main
              const term = to - from > 0 && to - from <= 200 ? (vocabularyCandidate(update.state.sliceDoc(from, to)) ?? "") : ""
              if (term !== selectedTerm.current) {
                selectedTerm.current = term
                void onTerm(term)
              }
            }
          }),
        ],
      }),
    })
    // El webview aún está entrando en pantalla y iOS puede ignorar el primer
    // focus(): se reintenta cada 100 ms hasta que CodeMirror lo tiene (2 s como
    // mucho)
    let focusTimer = 0
    if (autoFocus && !latestReadOnly.current) {
      let tries = 0
      const focus = () => {
        const editor = view.current
        if (cancelled || !editor || editor.hasFocus || tries++ > 20) return
        editor.focus()
        focusTimer = window.setTimeout(focus, 100)
      }
      focus()
    }
    const showText = (text: string) => {
      const editor = view.current
      if (cancelled || !editor) return
      if (text)
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: text },
          // con el foco puesto (idea nueva o capturada sin red), el cursor al final
          selection: { anchor: autoFocus ? text.length : 0 },
          annotations: [Transaction.addToHistory.of(false), initialTextLoad.of(true)],
        })
      // un frame después de pintarlo, para que el spinner no se vaya antes
      requestAnimationFrame(() => void onReady())
    }
    loadInitialText().then(showText, () => showText(""))
    return () => {
      cancelled = true
      clearTimeout(focusTimer)
      view.current?.destroy()
      view.current = null
      style.remove()
      if (existingMeta) meta.content = previousViewport
      else meta.remove()
      document.documentElement.style.removeProperty("--fs")
      document.documentElement.style.removeProperty("--font")
      document.documentElement.style.removeProperty("--fw")
    }
    // el texto inicial y autoFocus solo cuentan al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //- una reescritura pedida desde fuera (la barra del Mac) -
  useEffect(() => {
    const editor = view.current
    if (!rewriteRequest) return
    // sin editor o sin modelo, se contesta igual: la barra no se queda esperando
    if (!editor || !latestProps.current.rewrite) {
      void latestProps.current.onRewriteResult?.(rewriteRequest.id, { ok: false, reason: "unavailable" })
      return
    }
    const { id, payload } = rewriteRequest
    void runRewrite(editor, payload, fixWatcher.rewrite).then((result) => latestProps.current.onRewriteResult?.(id, result))
    // solo cuando llega una petición nueva
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewriteRequest?.id])

  //- vaciarlo desde fuera (descartar lo escrito) -
  // solo las peticiones que llegan con el editor ya montado: al volver a
  // montarse, la última ya estaba atendida
  const clearHandled = useRef(clearRequest)
  useEffect(() => {
    const editor = view.current
    if (clearRequest === clearHandled.current || !editor) return
    clearHandled.current = clearRequest
    const spec = clearAll(editor.state)
    if (spec) editor.dispatch(spec)
  }, [clearRequest])

  //- quitarle el foco desde fuera (abrir la hoja de la letra en el iPhone: el
  // teclado, que va por encima de la app, la tapaba) -
  const blurHandled = useRef(blurRequest)
  useEffect(() => {
    if (blurRequest === blurHandled.current) return
    blurHandled.current = blurRequest
    view.current?.contentDOM.blur()
  }, [blurRequest])

  //- una skill desde fuera (la chuleta) -
  // con el foco de vuelta en el texto: el botón se lo había llevado
  const insertHandled = useRef(insertRequest?.id)
  useEffect(() => {
    const editor = view.current
    if (!insertRequest || insertRequest.id === insertHandled.current || !editor) return
    insertHandled.current = insertRequest.id
    editor.dispatch(insertSkill(editor.state, insertRequest.skill))
    editor.focus()
    // solo cuando llega una petición nueva
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertRequest?.id])

  //- la escritura centrada, que se enciende y apaga desde la cabecera -
  // al encenderla, el cursor va ya al centro
  useEffect(() => {
    const editor = view.current
    if (!editor) return
    editor.dispatch({
      effects: [
        typewriterMode.current.reconfigure(typewriterExtension(typewriter)),
        ...(typewriter ? [EditorView.scrollIntoView(editor.state.selection.main.head, { y: "center" })] : []),
      ],
    })
  }, [typewriter])

  //- la corrección en gris, que se enciende y apaga desde Ajustes -
  useEffect(() => {
    view.current?.dispatch({ effects: grayMode.current.reconfigure(grayExtensions(!!dictionaries)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictionaries])

  //- solo lectura que llega de fuera (la red va y viene) -
  useEffect(() => {
    view.current?.dispatch({ effects: readOnlyMode.current.reconfigure(readOnlyExtensions(readOnly)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  //- la letra que llega de fuera: la fuente, por URL, y su peso -
  useEffect(() => {
    document.documentElement.style.setProperty("--font", fontFamily(font))
    const style = document.createElement("style")
    style.textContent = fontCss(font, fontOrigin)
    document.head.appendChild(style)
    afterFontChange()
    // mientras llega se escribe con la del sistema; al llegar, CodeMirror
    // vuelve a medir, o el cursor se queda con el ancho de la otra
    const loaded = () => afterFontChange()
    document.fonts.addEventListener("loadingdone", loaded)
    return () => {
      style.remove()
      document.fonts.removeEventListener("loadingdone", loaded)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font, fontOrigin])
  // aparte: cambiar el peso o un interruptor no vuelve a pedir la fuente (los
  // de Paper Mono cambian el ancho de letras y espacios: CodeMirror vuelve a medir)
  useEffect(() => {
    document.documentElement.style.setProperty("--fw", String(fontWeight))
    const features = featuresForEngine(fontFeatures, navigator.userAgent)
    document.documentElement.style.setProperty("--ff", fontFeatureSettings(font, features))
    afterFontChange()
    // por su contenido: en el iPhone, la lista llega nueva en cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font, fontWeight, fontFeatures.join()])

  //- ⌘+ / ⌘− / ⌘0 en la web -
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const size = fontSize.current
      if (event.key === "=" || event.key === "+") zoomTo(size + 1)
      else if (event.key === "-") zoomTo(size - 1)
      else if (event.key === "0") zoomTo(FONT_SIZE.initial)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  //- pellizco en el iPhone -
  useEffect(() => {
    const el = host.current!
    let startDistance = 0
    let startSize: number = FONT_SIZE.initial
    let frame = 0
    const distance = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      startDistance = distance(event.touches)
      startSize = fontSize.current
    }
    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !startDistance) return
      event.preventDefault()
      const next = startSize * (distance(event.touches) / startDistance)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => zoomTo(next, { persist: false }))
    }
    const onEnd = (event: TouchEvent) => {
      // solo al terminar un pellizco: un toque o un scroll no recolocan nada
      if (!startDistance || event.touches.length >= 2) return
      startDistance = 0
      // tras el último frame del gesto: se guarda el tamaño en que quedó y el
      // cursor vuelve a la vista
      requestAnimationFrame(() => {
        latestProps.current.onFontSizeChange(fontSize.current)
        const editor = view.current
        if (editor)
          editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.selection.main.head, { y: "center" }) })
      })
    }
    // Safari: que el gesto no haga zoom de página
    const preventPageZoom = (event: Event) => event.preventDefault()
    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    document.addEventListener("gesturestart", preventPageZoom)
    document.addEventListener("gesturechange", preventPageZoom)
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      document.removeEventListener("gesturestart", preventPageZoom)
      document.removeEventListener("gesturechange", preventPageZoom)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Al aparecer la barra, el editor encoge: que el cursor no quede debajo
  useEffect(() => {
    const editor = view.current
    if (keyboardBar && editor)
      editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.selection.main.head, { yMargin: 60 }) })
  }, [keyboardBar])

  return (
    <div className="idea-shell">
      <div ref={host} className="idea-editor" />
      {keyboardBar && (
        <KeyboardBar
          getView={() => view.current}
          haptic={() => void latestProps.current.haptic()}
          skills={skills}
          tags={tagSuggestions}
          ai={rewrite ? aiAvailability : "unavailable"}
          rewrite={fixWatcher.rewrite}
          fixWords={fixWords}
        />
      )}
    </div>
  )
}
