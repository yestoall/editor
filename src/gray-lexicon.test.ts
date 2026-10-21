//· gray-lexicon tests ·
// El léxico de la corrección en gris con los diccionarios de verdad, de
// node_modules (en la app llegan por URL), y unas erratas de las ideas.

import { beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { correctionFor, type Lexicon } from "./gray-correction"
import { createLexicon } from "./gray-lexicon"

const file = (path: string) => readFileSync(new URL(`../node_modules/${path}`, import.meta.url))
let lexicon: Lexicon

beforeAll(async () => {
  const english = file("spellchecker-wasm/lib/frequency_dictionary_en_82_765.txt")
    .toString()
    .split("\n")
    .map((line) => line.split(" ")[0])
    .join("\n")
  lexicon = await createLexicon({
    wasm: file("spellchecker-wasm/lib/spellchecker-wasm.wasm"),
    spanish: file("spellchecker-wasm/lib/frequency_dictionary_es.txt").toString(),
    english,
    aff: file("dictionary-es/index.aff").toString(),
    dic: file("dictionary-es/index.dic").toString(),
  })
})

const fix = (word: string) => correctionFor(word, lexicon, new Set())?.to ?? null

describe("el léxico", () => {
  test("sabe qué existe: también lo que no está en la lista de frecuencias, y la jerga en inglés", () => {
    for (const word of ["librería", "pastilla", "emulador", "commit", "push", "hook"]) expect(lexicon.isWord(word)).toBe(true)
    expect(lexicon.isWord("queiro")).toBe(false)
  })
  test("las que existen con una tilde más, aunque sean poco corrientes", () => {
    expect(lexicon.accentVariants("tocandolo")).toEqual(["tocándolo"])
  })
})

describe("erratas de las ideas", () => {
  test("se proponen bien", () => {
    expect(fix("navegacion")).toBe("navegación")
    expect(fix("queiro")).toBe("quiero")
    expect(fix("conenido")).toBe("contenido")
    expect(fix("utlizar")).toBe("utilizar")
    expect(fix("gustsa")).toBe("gusta")
    expect(fix("tocandolo")).toBe("tocándolo")
    expect(fix("circulo")).toBe("círculo")
    expect(fix("Habria")).toBe("Habría")
  })
  test("las buenas no se tocan", () => {
    for (const word of ["librería", "carátula", "commit", "push", "Release", "videos", "reintenta", "Inguru"])
      expect(fix(word)).toBeNull()
  })
})
