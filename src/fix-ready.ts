//· fix-ready ·
// El ✦ encendido (GLOSSARY.md de ideas): mientras escribes, tras una pausa
// con bastante texto nuevo, el modelo mira en silencio si hay algo que
// corregir en la idea entera, y el ✦ se enciende con cuántas palabras
// cambiarían. Corregir aplica entonces lo ya calculado, sin esperar.

import type { RewriteMode, RewriteResult } from "./rewrite"

// Las palabras, separadas por espacios: una tilde o una coma pegada a una
// palabra la cambian entera
const words = (text: string) => text.split(/\s+/).filter(Boolean)

// Cuántas palabras cambian de un texto a otro: las que no casan en orden (la
// subsecuencia común más larga), las de un lado o las del otro, las que sean
// más. Lo común del principio y del final se quita antes: casi siempre es casi
// todo
export function wordChanges(before: string, after: string): number {
  let a = words(before)
  let b = words(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  a = a.slice(start, a.length - end)
  b = b.slice(start, b.length - end)
  // la fila de antes de la tabla de la subsecuencia, una sola a la vez
  let previous = new Uint32Array(b.length + 1)
  for (const word of a) {
    const row = new Uint32Array(b.length + 1)
    for (let j = 0; j < b.length; j++) row[j + 1] = word === b[j] ? previous[j] + 1 : Math.max(previous[j + 1], row[j])
    previous = row
  }
  const common = previous[b.length]
  return Math.max(a.length, b.length) - common
}

// Lo que lee VoiceOver en el ✦, encendido o no (la barra del teclado y la del Mac)
export const fixReadyLabel = (words: number) =>
  words ? `Corregir y Aclarar: ${words === 1 ? "1 palabra" : `${words} palabras`} por corregir` : "Corregir y Aclarar"

export const FIX_PAUSE_MS = 3000 // sin teclear, lo que cuenta como pausa
export const FIX_NEW_WORDS = 8 // las palabras nuevas desde la última vez que miró

type Cancel = () => void

type WatcherOptions = {
  // el modelo: reescribe un texto, sin tocar el editor
  rewrite: (text: string, mode: RewriteMode) => Promise<RewriteResult>
  isActive: () => boolean // escribiendo en la idea: con el foco y editable
  onChange: (words: number) => void // cuántas cambiarían; 0, apagado
  schedule?: (run: () => void, ms: number) => Cancel
}

const timeout = (run: () => void, ms: number): Cancel => {
  const timer = setTimeout(run, ms)
  return () => clearTimeout(timer)
}

export function createFixWatcher({ rewrite, isActive, onChange, schedule = timeout }: WatcherOptions) {
  let checked = "" // el texto de la última vez que miró
  let current = "" // el de ahora
  let cancelPause: Cancel | undefined
  // encendido: para qué texto, y su corrección
  let ready: { text: string; fixed: string } | null = null
  // se apagó por seguir escribiendo: lo que había por corregir sigue ahí, y la
  // siguiente pausa mira sin esperar a las palabras nuevas
  let pending = false
  // la pregunta de la pausa que aún no ha vuelto: Corregir con ese mismo texto
  // espera su respuesta, en vez de preguntar otra vez
  let asking: { text: string; answer: Promise<RewriteResult> } | null = null
  // sube al apagarlo: lo que conteste el modelo a una pregunta de antes no vale
  let round = 0
  // el texto de antes de la última reescritura: volver a él (⌘Z) es dejarla,
  // y no se vuelve a ofrecer
  let beforeRewrite: string | null = null

  const light = (next: typeof ready) => {
    if (!ready && !next) return
    ready = next
    onChange(next ? wordChanges(next.text, next.fixed) : 0)
  }

  const check = async (text: string) => {
    if (!isActive() || (!pending && wordChanges(checked, text) < FIX_NEW_WORDS)) return
    const started = round
    const answer = rewrite(text, "fix")
    asking = { text, answer }
    const result = await answer.catch((): RewriteResult => ({ ok: false, reason: "failed" }))
    if (asking?.answer === answer) asking = null
    // apagado, o ha cambiado mientras el modelo pensaba: lo suyo ya no vale
    if (round !== started || text !== current) return
    checked = text
    pending = false
    // solo si cambia alguna palabra: unos espacios de más no son nada que corregir
    if (result.ok && wordChanges(text, result.text) > 0) light({ text, fixed: result.text })
  }

  return {
    // el texto con el que se abre la idea: no es nuevo
    loaded(text: string) {
      cancelPause?.()
      checked = current = text
    },
    edited(text: string) {
      current = text
      if (ready) pending = true
      if (text === beforeRewrite) [checked, pending] = [text, false]
      light(null)
      cancelPause?.()
      cancelPause = schedule(() => void check(text), FIX_PAUSE_MS)
    },
    // entra una reescritura (Corregir o Aclarar): es la nueva base, y lo que
    // había por corregir ya no
    rewritten(text: string) {
      cancelPause?.()
      beforeRewrite = current
      checked = current = text
      pending = false
      light(null)
    },
    // Corregir y Aclarar, para el editor: Corregir, encendido y para este
    // texto exacto, aplica lo ya calculado sin esperar al modelo
    rewrite(text: string, mode: RewriteMode): Promise<RewriteResult> {
      if (mode === "fix" && ready?.text === text) return Promise.resolve({ ok: true, text: ready.fixed })
      if (mode === "fix" && asking?.text === text) return asking.answer
      return rewrite(text, mode)
    },
    // apagado (el interruptor, o el editor se cierra): ni mira ni se enciende
    stop() {
      cancelPause?.()
      round++
      light(null)
    },
  }
}
