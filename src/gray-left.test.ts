//· gray-left tests ·
// Las palabras que dejas en la corrección en gris, en un almacenamiento falso.

import { describe, expect, test } from "bun:test"

import { createLeftWords } from "./gray-left"

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}

describe("las palabras que dejas", () => {
  test("a la segunda vez que la dejas, ya no se propone; sin mayúsculas", () => {
    const left = createLeftWords(memory())
    left.leave("Config")
    expect(left.silenced().has("config")).toBe(false)
    left.leave("config")
    expect(left.silenced().has("config")).toBe(true)
  })
  test("se guardan en el dispositivo y otra ventana las ve", () => {
    const storage = memory()
    createLeftWords(storage).leave("herdr")
    createLeftWords(storage).leave("herdr")
    expect(createLeftWords(storage).silenced()).toEqual(new Set(["herdr"]))
  })
  test("cuántas calla y olvidarlas todas", () => {
    const storage = memory()
    const left = createLeftWords(storage)
    for (const word of ["config", "config", "herdr", "herdr", "rodrigos"]) left.leave(word)
    expect(left.count()).toBe(2)
    createLeftWords(storage).forget()
    expect(left.count()).toBe(0)
    expect(left.silenced().size).toBe(0)
  })
  test("sin almacenamiento, o si falla, no se rompe", () => {
    const broken = { getItem: () => "{no es json", setItem: () => {} }
    expect(createLeftWords(broken).silenced().size).toBe(0)
    const left = createLeftWords(null)
    left.leave("config")
    expect(left.count()).toBe(0)
  })
})
