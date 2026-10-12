//· typography tests ·
// Las reglas del corrector pequeño, sobre el texto de la línea: dónde va el
// ¿ o el ¡ de apertura y cuándo una letra va en mayúscula.

import { describe, expect, test } from "bun:test"

import { openingMarkAt, startsSentence } from "./typography"

// la línea tal cual, con el cursor donde está la barra
const split = (marked: string) => ({ text: marked.replace("|", ""), offset: marked.indexOf("|") })

const opening = (marked: string, mark: "?" | "!") => {
  const { text, offset } = split(marked)
  return openingMarkAt(text, offset, mark)
}

describe("¿ y ¡ de apertura", () => {
  test("al cerrar una pregunta, el ¿ va al principio de la frase", () => {
    expect(opening("vienes mañana|", "?")).toBe(0)
    expect(opening("Ya está. vienes mañana|", "?")).toBe("Ya está. ".length)
  })

  test("al cerrar una exclamación, el ¡", () => {
    expect(opening("Hola. qué bien|", "!")).toBe("Hola. ".length)
  })

  test("cuenta desde el final de la frase anterior, también tras ? ! … : y ;", () => {
    expect(opening("¿Vienes? y tú|", "?")).toBe("¿Vienes? ".length)
    expect(opening("¡Bien! qué tal|", "?")).toBe("¡Bien! ".length)
    expect(opening("Una duda: lo hacemos|", "?")).toBe("Una duda: ".length)
  })

  test("si la frase ya tiene su apertura, no pone otra", () => {
    expect(opening("¿vienes mañana|", "?")).toBeNull()
    expect(opening("Si vienes, ¿me avisas|", "?")).toBeNull()
    expect(opening("¡qué bien|", "!")).toBeNull()
  })

  test("un punto sin espacio detrás no corta la frase: URLs y decimales", () => {
    expect(opening("miramos ideas.yestoall.com|", "?")).toBe(0)
    expect(opening("subimos a 3.5|", "?")).toBe(0)
  })

  test("deja fuera los espacios, las comillas y los paréntesis que abren", () => {
    expect(opening("Dijo: «vienes|", "?")).toBe("Dijo: «".length)
    expect(opening("  (seguro|", "?")).toBe("  (".length)
  })

  test("no hace nada sin frase delante, tras un espacio o al repetir el signo", () => {
    expect(opening("|", "?")).toBeNull()
    expect(opening("Hecho. |", "?")).toBeNull()
    expect(opening("x |", "?")).toBeNull()
    expect(opening("¿de verdad?|", "?")).toBeNull()
  })

  test("al final de una palabra en mitad de la línea, sí; en mitad de la palabra, no", () => {
    expect(opening("vienes| mañana", "?")).toBe(0)
    expect(opening("vie|nes", "?")).toBeNull()
  })
})

const starts = (marked: string) => {
  const { text, offset } = split(marked)
  return startsSentence(text, offset)
}

describe("mayúscula al empezar frase", () => {
  test("al principio de la línea, aunque haya sangría", () => {
    expect(starts("|")).toBe(true)
    expect(starts("  |")).toBe(true)
  })

  test("tras punto, interrogación, exclamación o puntos suspensivos y un espacio", () => {
    expect(starts("Hecho. |")).toBe(true)
    expect(starts("¿Vienes? |")).toBe(true)
    expect(starts("¡Bien!  |")).toBe(true)
    expect(starts("Bueno… |")).toBe(true)
  })

  test("tras un ¿ o un ¡ que abre frase", () => {
    expect(starts("¿|")).toBe(true)
    expect(starts("Hecho. ¡|")).toBe(true)
  })

  test("en mitad de frase, no", () => {
    expect(starts("Hecho. y |")).toBe(false)
    expect(starts("Si vienes, ¿|")).toBe(false)
    expect(starts("Una duda: |")).toBe(false)
    expect(starts("ideas.|")).toBe(false)
    expect(starts("- |")).toBe(false)
  })

  test("en mitad de palabra, no", () => {
    expect(starts("Hecho. h|")).toBe(false)
  })
})
