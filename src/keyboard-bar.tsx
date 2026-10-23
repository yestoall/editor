//· KeyboardBar ·
// La barra sobre el teclado del iPhone, dentro del webview: un trackpad que
// mueve el cursor (en horizontal por caracteres, en vertical por líneas) y
// botones para seleccionar el párrafo, subirlo, bajarlo, deshacer y rehacer.
// Con «/», encima de la barra sale una fila con las skills más usadas (en el
// sitio del trackpad no cabían): tocar una la escribe en el cursor y la fila se
// cierra. Al escribir un #tag en una cita, en ese sitio salen los tags
// conocidos que casan (tag-suggestions): tocar uno lo completa. Con ✦, en ese mismo sitio, la fila de Corregir y Aclarar: el modelo
// del iPhone reescribe la selección o el texto entero (rewrite). Ningún
// botón le roba el foco al editor: el teclado no se cierra.

import { cursorCharLeft, cursorCharRight, cursorLineDown, cursorLineUp, redo, undo } from "@codemirror/commands"
import type { EditorView } from "@codemirror/view"
import { type MouseEvent, type PointerEvent, type SyntheticEvent, useEffect, useRef, useState } from "react"

import { useAiRow } from "./ai-row"
import { fixReadyLabel } from "./fix-ready"
import type { VocabularyEntry } from "./cita"
import { insertSkill, PARAGRAPH_COMMANDS } from "./commands"
import { completeTag, type TagInProgress, tagAt } from "./tag-suggestions"
import { type Availability, MODES, type Rewrite, type RewriteMode, runRewrite } from "./rewrite"

// Los trazos de seis iconos de Lucide (ISC), en línea: importar lucide-react
// en el webview metía la librería entera en su bundle (de 1,9 a 4 MB)
const ICONS = {
  pilcrow: ["M13 4v16", "M17 4v16", "M19 4H9.5a4.5 4.5 0 0 0 0 9H13"],
  arrowUp: ["m5 12 7-7 7 7", "M12 19V5"],
  arrowDown: ["M12 5v14", "m19 12-7 7-7-7"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"],
  redo: ["m15 14 5-5-5-5", "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"],
  pencilSparkles: [
    "M10 3H8",
    "m15.007 5.008 3.987 3.986",
    "M20 15v4",
    "M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    "M22 17h-4",
    "M4 5v4",
    "M6 7H2",
    "M9 2v2",
  ],
} as const

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

const STEP_X = 9 // px de arrastre por carácter
const STEP_Y = 22 // px de arrastre por línea

// los tags que casan con el que se escribe, y dónde está
export type TagSuggestions = { tag: TagInProgress; options: VocabularyEntry[] } | null

type Props = {
  getView: () => EditorView | null
  haptic: () => void
  skills: string[] // las más usadas, de más a menos; sin ninguna, no hay «/»
  tags: TagSuggestions // con un #tag a medio escribir, los que casan
  ai: Availability // sin modelo («unavailable»), no hay ✦
  rewrite: Rewrite
  fixWords: number // el ✦ encendido (fix-ready): cuántas palabras cambiarían; 0, apagado
}

const TAP_SLOP = 8 // px que puede moverse el dedo y seguir siendo un toque

// Tras mover el cursor con el trackpad, iOS no actualiza las sugerencias del
// teclado: volver a fijar la selección del documento no bastó. Quitar el foco
// y devolverlo en el frame siguiente sí (comprobado en el simulador): el
// sistema vuelve a leer dónde está el cursor y el teclado no se cierra.
const refreshNativeSelection = (editor: EditorView) => {
  editor.contentDOM.blur()
  requestAnimationFrame(() => editor.focus())
}

const BUTTONS = [
  { label: "Seleccionar párrafo", icon: "pilcrow", run: PARAGRAPH_COMMANDS.select },
  { label: "Subir párrafo", icon: "arrowUp", run: PARAGRAPH_COMMANDS.moveUp },
  { label: "Bajar párrafo", icon: "arrowDown", run: PARAGRAPH_COMMANDS.moveDown },
  { label: "Deshacer", icon: "undo", run: undo },
  { label: "Rehacer", icon: "redo", run: redo },
] as const

export default function KeyboardBar({ getView, haptic, skills, tags, ai, rewrite, fixWords }: Props) {
  const drag = useRef({ x: 0, y: 0, dx: 0, dy: 0 })
  const [dragging, setDragging] = useState(false)
  // encima de la barra, una fila: las skills o la del ✦ (nunca las dos). La
  // del ✦ lleva su estado en ai-row, como la del Mac
  const [picking, setPicking] = useState(false)
  const aiRow = useAiRow(
    ai,
    async (mode) => {
      const editor = getView()
      return editor ? runRewrite(editor, mode, rewrite) : null
    },
    // bien hecho, el toque de siempre
    (result) => {
      if (result?.ok) haptic()
    },
  )
  const row = aiRow.row
  const aiOpen = row.kind !== "closed"
  const busy = row.kind === "busy"
  // si se abre la del ✦, se cierran las skills
  useEffect(() => {
    if (aiOpen) setPicking(false)
  }, [aiOpen])
  // Las pastillas se deslizan de lado: la skill entra al soltar, si el dedo no
  // se ha movido (al bajar, aún no se sabe si es un toque o un deslizamiento)
  const touchStart = useRef(0)

  const runOn = (run: (view: EditorView) => boolean) => {
    const editor = getView()
    if (!editor) return
    run(editor)
    haptic()
  }
  // Como en el prototipo: div y preventDefault en pointerdown, para que el
  // toque no le quite el foco al editor ni cierre el teclado
  const press = (run: (view: EditorView) => boolean) => (event: PointerEvent) => {
    event.preventDefault()
    runOn(run)
  }
  // En iOS, el toque sintetiza al final un clic que le quita el foco al editor
  // y cierra el teclado: hay que cancelar también el final del toque
  const keepFocus = (event: SyntheticEvent) => event.preventDefault()
  // VoiceOver y el teclado no mandan pointerdown: llegan como click sin detalle
  const activate = (run: (view: EditorView) => boolean) => (event: MouseEvent) => {
    if (event.detail === 0) runOn(run)
  }

  const onPadDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, dx: 0, dy: 0 }
    setDragging(true)
  }
  const onPadMove = (event: PointerEvent<HTMLDivElement>) => {
    const editor = getView()
    if (!dragging || !editor) return
    const d = drag.current // acumula el arrastre que aún no llega a un paso
    d.dx += event.clientX - d.x
    d.dy += event.clientY - d.y
    d.x = event.clientX
    d.y = event.clientY
    let moved = false
    while (Math.abs(d.dx) >= STEP_X) {
      ;(d.dx > 0 ? cursorCharRight : cursorCharLeft)(editor)
      d.dx -= Math.sign(d.dx) * STEP_X
      moved = true
    }
    while (Math.abs(d.dy) >= STEP_Y) {
      ;(d.dy > 0 ? cursorLineDown : cursorLineUp)(editor)
      d.dy -= Math.sign(d.dy) * STEP_Y
      moved = true
    }
    if (moved) haptic()
  }
  const onPadUp = () => {
    if (!dragging) return
    setDragging(false)
    const editor = getView()
    if (editor) refreshNativeSelection(editor)
  }

  const togglePicking = (event: PointerEvent) => {
    event.preventDefault()
    if (busy) return
    aiRow.close()
    setPicking((open) => !open)
    haptic()
  }
  const onSkillDown = (event: PointerEvent) => {
    event.preventDefault()
    touchStart.current = event.clientX
  }
  const onSkillUp = (skill: string) => (event: PointerEvent) => {
    if (Math.abs(event.clientX - touchStart.current) > TAP_SLOP) return
    const editor = getView()
    if (!editor) return
    editor.dispatch(insertSkill(editor.state, skill))
    haptic()
    setPicking(false)
  }

  // el tag se busca otra vez al tocar: el cursor puede haberse movido
  const onTagUp = (name: string) => (event: PointerEvent) => {
    if (Math.abs(event.clientX - touchStart.current) > TAP_SLOP) return
    const editor = getView()
    if (!editor) return
    const text = editor.state.doc.toString()
    const tag = tagAt(text, editor.state.selection.main.head)
    if (!tag) return
    const { from, to, insert, cursor } = completeTag(text, tag, name)
    editor.dispatch({
      changes: { from, to, insert },
      selection: { anchor: cursor },
      scrollIntoView: true,
      userEvent: "input.complete",
    })
    haptic()
  }

  const toggleAi = (event: PointerEvent) => {
    event.preventDefault()
    if (busy) return
    haptic()
    aiRow.toggle()
  }
  const onMode = (mode: RewriteMode) => (event: PointerEvent) => {
    event.preventDefault()
    aiRow.start(mode)
  }
  const closeMessage = (event: PointerEvent) => {
    event.preventDefault()
    aiRow.close()
  }

  return (
    <>
      {aiOpen && (
        <div className="keyboard-skills keyboard-ai-row">
          {row.kind === "message" ? (
            <div
              role="button"
              tabIndex={-1}
              className="keyboard-ai-message"
              onPointerDown={closeMessage}
              onMouseDown={keepFocus}
              onTouchEnd={keepFocus}
            >
              {row.text}
            </div>
          ) : (
            MODES.map(({ mode, label, busy: working }) => {
              const active = row.kind === "busy" && row.mode === mode
              return (
                <div
                  key={mode}
                  role="button"
                  tabIndex={-1}
                  aria-disabled={busy}
                  className={`keyboard-skill keyboard-mode${busy && !active ? " is-off" : ""}`}
                  onPointerDown={onMode(mode)}
                  onMouseDown={keepFocus}
                  onTouchEnd={keepFocus}
                >
                  {active && <span className="keyboard-beat" />}
                  {active ? working : label}
                </div>
              )
            })
          )}
        </div>
      )}
      {picking && (
        <div className="keyboard-skills">
          {skills.map((skill) => (
            <div
              key={skill}
              role="button"
              tabIndex={-1}
              className="keyboard-skill"
              onPointerDown={onSkillDown}
              onPointerUp={onSkillUp(skill)}
              onMouseDown={keepFocus}
              onTouchEnd={keepFocus}
            >
              {skill}
            </div>
          ))}
        </div>
      )}
      {!aiOpen && !picking && tags && (
        <div className="keyboard-skills">
          {tags.options.map(({ name }) => (
            <div
              key={name}
              role="button"
              tabIndex={-1}
              className="keyboard-skill"
              onPointerDown={onSkillDown}
              onPointerUp={onTagUp(name)}
              onMouseDown={keepFocus}
              onTouchEnd={keepFocus}
            >
              #{name}
            </div>
          ))}
        </div>
      )}
      <div className="keyboard-bar">
        {ai !== "unavailable" && (
          <div
            role="button"
            tabIndex={-1}
            className={`keyboard-button${aiOpen ? " is-open" : ""}${fixWords ? " is-ready" : ""}`}
            aria-label={aiOpen ? "Cerrar Corregir y Aclarar" : fixReadyLabel(fixWords)}
            aria-expanded={aiOpen}
            onPointerDown={toggleAi}
            onMouseDown={keepFocus}
            onTouchEnd={keepFocus}
          >
            <Icon name="pencilSparkles" />
            {!!fixWords && <span className="keyboard-count">{fixWords}</span>}
          </div>
        )}
        {!!skills.length && (
          <div
            role="button"
            tabIndex={-1}
            className={`keyboard-button keyboard-slash${picking ? " is-open" : ""}`}
            aria-label={picking ? "Cerrar las skills" : "Skills"}
            aria-expanded={picking}
            onPointerDown={togglePicking}
            onMouseDown={keepFocus}
            onTouchEnd={keepFocus}
          >
            /
          </div>
        )}
        {/* el trackpad, en medio: a la izquierda lo que abre filas, a la derecha lo que edita */}
        <div
          className={`keyboard-pad${dragging ? " is-dragging" : ""}`}
          onPointerDown={onPadDown}
          onMouseDown={keepFocus}
          onTouchEnd={keepFocus}
          onPointerMove={onPadMove}
          onPointerUp={onPadUp}
          onPointerCancel={onPadUp}
          aria-label="Trackpad: desliza para mover el cursor"
        />
        {BUTTONS.map(({ label, icon, run }) => (
          <div
            key={label}
            role="button"
            tabIndex={-1}
            className="keyboard-button"
            aria-label={label}
            onPointerDown={press(run)}
            onMouseDown={keepFocus}
            onTouchEnd={keepFocus}
            onClick={activate(run)}
          >
            <Icon name={icon} />
          </div>
        ))}
      </div>
    </>
  )
}
