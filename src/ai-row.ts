//· ai-row ·
// La fila del ✦ de Corregir y Aclarar: los dos modos, uno trabajando o un
// aviso que se cierra solo. Una sola lógica para las dos barras que la pintan:
// la del teclado del iPhone (keyboard-bar, dentro del webview) y la del
// Mac, que pinta la app (con ⌘⇧C / ⌘⇧A). Cada una le da con qué ejecutar un
// modo. La lógica, en nextRow, sin pantalla. Rutas relativas: también la
// importa el webview, que no pasa por los alias de la app.

import { useEffect, useRef, useState } from "react"

import { type Availability, FAILURE_MESSAGES, type RewriteMode, type RewriteResult } from "./rewrite"

// La fila del ✦: cerrada, con los dos modos, uno trabajando o un aviso
export type AiRow =
  | { kind: "closed" }
  | { kind: "modes" }
  | { kind: "busy"; mode: RewriteMode }
  | { kind: "message"; text: string }

type RowEvent =
  | { type: "toggle" } // el ✦
  | { type: "start"; mode: RewriteMode } // una pastilla o un atajo
  | { type: "result"; result: RewriteResult | null } // lo que contesta el editor
  | { type: "close" }

const CLOSED: AiRow = { kind: "closed" }
const NOT_READY: AiRow = { kind: "message", text: FAILURE_MESSAGES.notReady }

// Mientras trabaja, nada la cambia salvo el resultado: ni otro modo ni cerrarla
export function nextRow(row: AiRow, event: RowEvent, availability: Availability): AiRow {
  if (row.kind === "busy" && event.type !== "result") return row
  switch (event.type) {
    case "toggle":
      if (row.kind !== "closed") return CLOSED
      return availability === "notReady" ? NOT_READY : { kind: "modes" }
    case "start":
      return availability === "notReady" ? NOT_READY : { kind: "busy", mode: event.mode }
    case "result":
      return !event.result || event.result.ok ? CLOSED : { kind: "message", text: FAILURE_MESSAGES[event.result.reason] }
    case "close":
      return CLOSED
  }
}

type ShortcutKey = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }

// ⌘⇧C corrige y ⌘⇧A aclara (Ctrl en vez de ⌘ fuera del Mac); con ⇧, la tecla
// llega en mayúscula
export function rewriteShortcut({ key, metaKey, ctrlKey, shiftKey }: ShortcutKey): RewriteMode | null {
  if (!(metaKey || ctrlKey) || !shiftKey) return null
  const letter = key.toLowerCase()
  return letter === "c" ? "fix" : letter === "a" ? "clarify" : null
}

const MESSAGE_MS = 4000 // lo que se queda a la vista un aviso

export type AiRowState = ReturnType<typeof useAiRow>

// run: ejecuta un modo en el editor y devuelve su resultado (null: no había
// texto). onDone, con el resultado (la barra del iPhone vibra si salió bien)
export function useAiRow(
  availability: Availability,
  run: (mode: RewriteMode) => Promise<RewriteResult | null>,
  onDone?: (result: RewriteResult | null) => void,
) {
  const [row, setRow] = useState<AiRow>(CLOSED)
  // los atajos y el resultado llegan desde fuera de React: leen la fila de ahora
  const current = useRef(row)
  current.current = row
  const latest = useRef({ run, onDone })
  latest.current = { run, onDone }
  const apply = (event: RowEvent) => {
    const next = nextRow(current.current, event, availability)
    const started = next.kind === "busy" && current.current.kind !== "busy"
    current.current = next
    setRow(next)
    if (started && event.type === "start")
      void latest.current.run(event.mode).then((result) => {
        latest.current.onDone?.(result)
        apply({ type: "result", result })
      })
  }
  // el aviso se cierra solo
  useEffect(() => {
    if (row.kind !== "message") return
    const timer = setTimeout(() => apply({ type: "close" }), MESSAGE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row])
  return {
    available: availability !== "unavailable",
    row,
    toggle: () => apply({ type: "toggle" }),
    start: (mode: RewriteMode) => apply({ type: "start", mode }),
    close: () => apply({ type: "close" }),
  }
}
