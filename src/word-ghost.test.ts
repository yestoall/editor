//· word-ghost tests ·
// La palabra en gris: qué se propone, qué se aprende y en qué forma, sin DOM.

import { EditorSelection, EditorState, StateEffect } from "@codemirror/state"
import { type DecorationSet, EditorView } from "@codemirror/view"
import { describe, expect, test } from "bun:test"

import { docWords, finishedWord, ignoredSuggestion, learnedForm, suggestWord, wordGhost, type WordSources } from "./word-ghost"

const sources = (partial: Partial<WordSources>): WordSources => ({
  vocabulary: [],
  counts: {},
  uses: {},
  inDoc: new Set(),
  ...partial,
})

describe("qué palabra se propone", () => {
  test("la que empieza igual, sin mayúsculas ni tildes", () => {
    expect(suggestWord("reab", sources({ vocabulary: ["Reabrir"] }))?.insert).toBe("Reabrir")
    expect(suggestWord("rapid", sources({ counts: { rápidamente: 2 } }))?.insert).toBe("rápidamente")
  })
  test("desde tres letras, y si le faltan al menos dos", () => {
    expect(suggestWord("de", sources({ counts: { desplegable: 5 } }))).toBeNull()
    expect(suggestWord("desplegabl", sources({ counts: { desplegable: 5 } }))).toBeNull()
    expect(suggestWord("despleg", sources({ counts: { desplegable: 5 } }))?.insert).toBe("desplegable")
  })
  test("la que más usas: aceptada cuenta el doble que escrita", () => {
    const counts = { desplegable: 3, desplegado: 2 }
    expect(suggestWord("despl", sources({ counts }))?.word).toBe("desplegable")
    expect(suggestWord("despl", sources({ counts, uses: { desplegado: 1 } }))?.word).toBe("desplegado")
  })
  test("estar en la idea suma; a igualdad, la más corta", () => {
    expect(suggestWord("barb", sources({ counts: { barbacoa: 2 }, inDoc: new Set(["barbecho"]) }))?.word).toBe(
      "barbecho",
    )
    expect(suggestWord("cap", sources({ counts: { capturas: 2, captura: 2 } }))?.word).toBe("captura")
  })
  test("con mayúscula al empezar, se escribe con mayúscula; cuenta la del diccionario", () => {
    expect(suggestWord("Despl", sources({ counts: { desplegable: 2 } }))).toEqual({
      word: "desplegable",
      insert: "Desplegable",
    })
  })
  test("una aprendida, desde la segunda vez: una errata suelta no sale", () => {
    expect(suggestWord("despl", sources({ counts: { desplgeable: 1 } }))).toBeNull()
    expect(suggestWord("despl", sources({ counts: { desplegable: 2 } }))?.word).toBe("desplegable")
  })
  test("sin candidatas, nada", () => {
    expect(suggestWord("zzz", sources({ vocabulary: ["Reabrir"] }))).toBeNull()
  })
})

describe("qué se aprende", () => {
  test("en minúscula si solo la primera es mayúscula; las demás, tal cual", () => {
    expect(learnedForm("Desplegable")).toBe("desplegable")
    expect(learnedForm("IdeaCard")).toBe("IdeaCard")
    expect(learnedForm("Upstash")).toBe("upstash")
  })
  test("las de la idea, sin la que se está escribiendo ni las cortas", () => {
    const text = "El desplegable de la captura despleg"
    expect([...docWords(text, 29, 36)]).toEqual(["desplegable", "captura"])
  })

  const typing = (marked: string, insert: string, userEvent = "input.type") => {
    const state = EditorState.create({ doc: marked.replace("|", ""), selection: EditorSelection.cursor(marked.indexOf("|")) })
    const at = marked.indexOf("|")
    return finishedWord(state.update({ changes: { from: at, insert }, userEvent }))
  }
  test("al cerrar una palabra larga con un espacio o un signo", () => {
    expect(typing("el desplegable|", " ")).toEqual({ word: "desplegable", from: 3, learn: true })
    expect(typing("el desplegable|", ",")?.learn).toBe(true)
  })
  test("las cortas se cierran pero no se aprenden", () => {
    expect(typing("la casa|", " ")).toEqual({ word: "casa", from: 3, learn: false })
  })
  test("ni a media palabra, ni lo que no se escribe", () => {
    expect(typing("el desplega|", "b")).toBeNull()
    expect(typing("el desplegable|", " ", "undo")).toBeNull()
  })
})

describe("la propuesta que se ignora", () => {
  const shown = { from: 3, word: "desplgeable" }
  test("si escribes otra palabra en su sitio, se le resta", () => {
    expect(ignoredSuggestion(shown, { from: 3, word: "desplegable" })).toBe("desplgeable")
  })
  test("si escribes la propuesta, o la propuesta con algo más, no", () => {
    expect(ignoredSuggestion(shown, { from: 3, word: "desplgeable" })).toBeNull()
    expect(ignoredSuggestion(shown, { from: 3, word: "Desplgeables" })).toBeNull()
  })
  test("si la palabra es otra, en otro sitio, no", () => {
    expect(ignoredSuggestion(shown, { from: 20, word: "captura" })).toBeNull()
    expect(ignoredSuggestion(null, { from: 3, word: "captura" })).toBeNull()
  })
})

describe("en el editor", () => {
  // lo gris que pinta, o "" si no hay
  const ghostText = (state: EditorState) => {
    for (const source of state.facet(EditorView.decorations)) {
      if (typeof source === "function") continue
      const iter = (source as DecorationSet).iter()
      if (iter.value) return (iter.value.spec.widget as { text: string }).text
    }
    return ""
  }
  const typed = () => {
    const state = EditorState.create({ doc: "el despl", selection: EditorSelection.cursor(8), extensions: wordGhost(() => ["desplegable"]) })
    return state.update({ changes: { from: 8, insert: "e" }, selection: EditorSelection.cursor(9), userEvent: "input.type" }).state
  }
  test("al teclear, sale lo que falta", () => {
    expect(ghostText(typed())).toBe("gable")
  })
  test("se queda con las transacciones que no tocan el texto ni el cursor", () => {
    const state = typed().update({ effects: StateEffect.appendConfig.of([]) }).state
    expect(ghostText(state)).toBe("gable")
  })
  test("mover el cursor la quita", () => {
    expect(ghostText(typed().update({ selection: EditorSelection.cursor(2) }).state)).toBe("")
  })
})
