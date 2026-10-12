//· vocabulary tests ·
// Las palabras de un proyecto que el editor propone al escribir.

import { describe, expect, test } from "bun:test"

import { knowsTerm, projectVocabulary, suggestionWords, vocabularyCandidate } from "./vocabulary"

describe("projectVocabulary", () => {
  test("las palabras de sus ideas, de la más usada a la menos", () => {
    const words = projectVocabulary(["la rejilla y la captura", "otra vez la rejilla"])
    expect(words).toEqual(["rejilla", "captura"])
  })
  test("también nombres de código, rutas y ficheros", () => {
    const words = projectVocabulary(["Cambia IdeaCard en src/editor/pairs.ts y use-app-size"])
    expect(words).toContain("IdeaCard")
    expect(words).toContain("src/editor/pairs.ts")
    expect(words).toContain("use-app-size")
  })
  test("las cortas no: con menos de cinco letras no ahorra nada", () => {
    expect(projectVocabulary(["haz esto ya, pero bien"])).toEqual([])
  })
  test("ni las skills ni las URL, que van por otro lado", () => {
    const words = projectVocabulary(["usa /documenta y mira https://ideas.yestoall.com/capture"])
    expect(words).not.toContain("/documenta")
    expect(words).not.toContain("documenta")
    expect(words.some((word) => word.includes("yestoall"))).toBe(false)
  })
  test("sin signos pegados al final", () => {
    expect(projectVocabulary(["el «editor», la (captura). Y la rejilla:"])).toEqual(["editor", "captura", "rejilla"])
  })
  test("se queda con las más usadas", () => {
    const texts = Array.from({ length: 20 }, (_, i) => `palabra${i} `.repeat(i + 1))
    expect(projectVocabulary(texts, 3)).toEqual(["palabra19", "palabra18", "palabra17"])
  })
})

describe("suggestionWords", () => {
  test("primero el vocabulario del repo y luego las palabras de las ideas, sin repetir", () => {
    expect(suggestionWords(["Rejilla", "ThePills"], ["captura", "Rejilla"])).toEqual(["Rejilla", "ThePills", "captura"])
  })
  test("sin las comillas invertidas del vocabulario: se sugiere lo que se escribe", () => {
    expect(suggestionWords(["`ThePills`", "`bun mac`"], [])).toEqual(["ThePills", "bun mac"])
  })
})

describe("vocabularyCandidate", () => {
  test("lo seleccionado, sin espacios, comillas ni puntuación en los bordes", () => {
    expect(vocabularyCandidate("  captura. ")).toBe("captura")
    expect(vocabularyCandidate("«Párrafo activo»,")).toBe("Párrafo activo")
    expect(vocabularyCandidate("`src/editor/pairs.ts`")).toBe("src/editor/pairs.ts")
    expect(vocabularyCandidate("(use-app-size)")).toBe("use-app-size")
  })
  test("por dentro, se queda como está", () => {
    expect(vocabularyCandidate("¿qué tal?")).toBe("qué tal")
    expect(vocabularyCandidate("ideas.yestoall.com")).toBe("ideas.yestoall.com")
  })
  test("nada, varias líneas, solo signos o demasiado largo: null", () => {
    expect(vocabularyCandidate("")).toBeNull()
    expect(vocabularyCandidate("   ")).toBeNull()
    expect(vocabularyCandidate("una\nlínea")).toBeNull()
    expect(vocabularyCandidate("…—!")).toBeNull()
    expect(vocabularyCandidate("a".repeat(61))).toBeNull()
  })
})

describe("knowsTerm", () => {
  test("sin mirar mayúsculas ni comillas invertidas", () => {
    expect(knowsTerm(["`ThePills`", "Rejilla"], "thepills")).toBe(true)
    expect(knowsTerm(["Rejilla"], "rejilla")).toBe(true)
    expect(knowsTerm(["Rejilla"], "Captura")).toBe(false)
  })
})
