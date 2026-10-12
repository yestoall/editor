//· rewrite tests ·
// Aplicar una reescritura sobre un EditorState sin DOM, con un modelo falso.

import { history, undo } from "@codemirror/commands"
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state"
import { describe, expect, test } from "bun:test"

import { FAILURE_MESSAGES, type Rewrite, rewriteBusy, rewriteTarget, runRewrite } from "./rewrite"

// un editor de mentira: guarda el estado y aplica lo que se le manda
const editorWith = (doc: string, selection = EditorSelection.cursor(0)) => {
  const editor = {
    state: EditorState.create({ doc, selection, extensions: [history(), rewriteBusy.of([])] }),
    dispatch(spec: TransactionSpec) {
      editor.state = editor.state.update(spec).state
    },
  }
  return editor
}
const answer =
  (text: string): Rewrite =>
  async () => ({ ok: true, text })

describe("el texto que se reescribe", () => {
  test("la selección, si la hay", () => {
    const { state } = editorWith("uno dos tres", EditorSelection.range(4, 7))
    expect(rewriteTarget(state)).toEqual({ from: 4, to: 7 })
  })
  test("sin selección, la idea entera", () => {
    const { state } = editorWith("uno dos tres", EditorSelection.cursor(5))
    expect(rewriteTarget(state)).toEqual({ from: 0, to: 12 })
  })
})

describe("runRewrite", () => {
  test("cambia el texto y deja el cursor al final del nuevo", async () => {
    const editor = editorWith("uno dos tres", EditorSelection.range(4, 7))
    const result = await runRewrite(editor, "fix", answer("DOS!"))
    expect(result).toEqual({ ok: true, text: "DOS!" })
    expect(editor.state.doc.toString()).toBe("uno DOS! tres")
    expect(editor.state.selection.main.head).toBe(8)
  })

  test("le pasa al modelo el texto y el modo", async () => {
    const editor = editorWith("hola", EditorSelection.cursor(0))
    const calls: [string, string][] = []
    await runRewrite(editor, "clarify", async (text, mode) => {
      calls.push([text, mode])
      return { ok: true, text }
    })
    expect(calls).toEqual([["hola", "clarify"]])
  })

  test("un deshacer lo quita entero", async () => {
    const editor = editorWith("ola k ase")
    await runRewrite(editor, "fix", answer("Hola, ¿qué haces?"))
    undo({ state: editor.state, dispatch: (tr) => (editor.state = tr.state) })
    expect(editor.state.doc.toString()).toBe("ola k ase")
  })

  test("mientras piensa, el editor está en solo lectura; al acabar, no", async () => {
    const editor = editorWith("hola")
    let readOnlyDuring = false
    await runRewrite(editor, "fix", async (text) => {
      readOnlyDuring = editor.state.readOnly
      return { ok: true, text }
    })
    expect(readOnlyDuring).toBe(true)
    expect(editor.state.readOnly).toBe(false)
  })

  test("si falla, no toca el texto y vuelve a ser editable", async () => {
    const editor = editorWith("hola")
    const result = await runRewrite(editor, "fix", async () => ({ ok: false, reason: "tooLong" }))
    expect(result).toEqual({ ok: false, reason: "tooLong" })
    expect(editor.state.doc.toString()).toBe("hola")
    expect(editor.state.readOnly).toBe(false)
  })

  test("si la llamada lanza, es un fallo y vuelve a ser editable", async () => {
    const editor = editorWith("hola")
    const result = await runRewrite(editor, "fix", async () => {
      throw new Error("puente roto")
    })
    expect(result).toEqual({ ok: false, reason: "failed" })
    expect(editor.state.readOnly).toBe(false)
  })

  test("descarta si el documento cambió mientras pensaba", async () => {
    const editor = editorWith("uno\n\ndos")
    const result = await runRewrite(editor, "fix", async (text) => {
      editor.dispatch({ changes: { from: 0, insert: "cero\n\n" } })
      return { ok: true, text: text.toUpperCase() }
    })
    expect(result).toEqual({ ok: false, reason: "changed" })
    expect(editor.state.doc.toString()).toBe("cero\n\nuno\n\ndos")
    expect(editor.state.readOnly).toBe(false)
  })

  test("sin texto no hace nada", async () => {
    const editor = editorWith("  \n ")
    let called = false
    const result = await runRewrite(editor, "fix", async (text) => {
      called = true
      return { ok: true, text }
    })
    expect(result).toBeNull()
    expect(called).toBe(false)
  })

  test("si vuelve igual, no añade un paso de deshacer", async () => {
    const editor = editorWith("hola")
    await runRewrite(editor, "fix", answer("hola"))
    expect(editor.state.doc.toString()).toBe("hola")
    let undone = false
    undo({ state: editor.state, dispatch: () => (undone = true) })
    expect(undone).toBe(false)
  })
})

describe("con el editor en solo lectura (sin red)", () => {
  test("no llama al modelo ni toca el texto, y dice por qué", async () => {
    const editor = {
      state: EditorState.create({ doc: "hola", extensions: [history(), rewriteBusy.of([]), EditorState.readOnly.of(true)] }),
      dispatch(spec: TransactionSpec) {
        editor.state = editor.state.update(spec).state
      },
    }
    let called = false
    const result = await runRewrite(editor, "fix", async (text) => {
      called = true
      return { ok: true, text: text.toUpperCase() }
    })
    expect(result).toEqual({ ok: false, reason: "readOnly" })
    expect(called).toBe(false)
    expect(editor.state.doc.toString()).toBe("hola")
  })
})

describe("los mensajes", () => {
  test("no nombran el iPhone: valen también en el Mac", () => {
    for (const text of Object.values(FAILURE_MESSAGES)) expect(text).not.toContain("iPhone")
  })
  test("no nombran la app de ajustes, que en el Mac se llama de otra forma", () => {
    for (const text of Object.values(FAILURE_MESSAGES)) expect(text).not.toContain("en Ajustes")
  })
})
