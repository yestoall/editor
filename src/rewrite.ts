//· rewrite ·
// Corregir y Aclarar en el editor: qué texto se manda al modelo y cómo vuelve.
// Mientras el modelo piensa, el editor queda en solo lectura (solo el estado:
// con EditorView.editable a false iOS cerraría el teclado) y, al volver, el
// texto nuevo entra en una sola transacción aislada en el historial: un
// deshacer lo quita entero. Si el documento ha cambiado entre medias, el
// resultado no se aplica. El modelo lo pone la app, en nativo.

import { isolateHistory } from "@codemirror/commands"
import { Compartment, EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state"

export type RewriteMode = "fix" | "clarify"
export type Availability = "ready" | "notReady" | "unavailable"
export type RewriteFailure = "tooLong" | "refused" | "notReady" | "unavailable" | "changed" | "readOnly" | "failed"
export type RewriteResult = { ok: true; text: string } | { ok: false; reason: RewriteFailure }
export type Rewrite = (text: string, mode: RewriteMode) => Promise<RewriteResult>

export const MODES = [
  { mode: "fix", label: "Corregir", busy: "Corrigiendo…" },
  { mode: "clarify", label: "Aclarar", busy: "Aclarando…" },
] as const satisfies readonly { mode: RewriteMode; label: string; busy: string }[]

export const FAILURE_MESSAGES: Record<RewriteFailure, string> = {
  tooLong: "Es demasiado largo para el modelo. Selecciona un trozo.",
  refused: "El modelo no ha querido reescribirlo: el texto sigue como estaba.",
  notReady: "Apple Intelligence aún no está lista. Actívala en los ajustes o espera a que acabe de descargarse.",
  unavailable: "Este dispositivo no tiene Apple Intelligence.",
  changed: "Has cambiado la idea mientras tanto: no se ha tocado.",
  readOnly: "Ahora la idea no se puede editar.",
  failed: "No se ha podido reescribir. Prueba otra vez.",
}

// El editor lo incluye vacío; runRewrite lo llena mientras el modelo piensa
export const rewriteBusy = new Compartment()

// Lo que hace falta del editor (un EditorView lo cumple; los tests, con menos)
export type RewriteEditor = { readonly state: EditorState; dispatch: (spec: TransactionSpec) => void }

export const rewriteTarget = (state: EditorState) => {
  const { from, to } = state.selection.main
  return from === to ? { from: 0, to: state.doc.length } : { from, to }
}

export async function runRewrite(
  editor: RewriteEditor,
  mode: RewriteMode,
  rewrite: Rewrite,
): Promise<RewriteResult | null> {
  // sin red el editor se lee pero no se edita, y el modelo, que es local,
  // contestaría igual: el texto no se toca
  if (editor.state.readOnly) return { ok: false, reason: "readOnly" }
  const { from, to } = rewriteTarget(editor.state)
  const text = editor.state.sliceDoc(from, to)
  if (!text.trim()) return null
  const doc = editor.state.doc
  editor.dispatch({ effects: rewriteBusy.reconfigure(EditorState.readOnly.of(true)) })
  const idle = rewriteBusy.reconfigure([])
  let result: RewriteResult
  try {
    result = await rewrite(text, mode)
  } catch {
    result = { ok: false, reason: "failed" }
  }
  if (result.ok && editor.state.doc !== doc) result = { ok: false, reason: "changed" }
  if (!result.ok || result.text === text) {
    editor.dispatch({ effects: idle })
    return result
  }
  editor.dispatch({
    changes: { from, to, insert: result.text },
    selection: EditorSelection.cursor(from + result.text.length),
    effects: idle,
    annotations: isolateHistory.of("full"),
    scrollIntoView: true,
    userEvent: "input.rewrite",
  })
  return result
}
