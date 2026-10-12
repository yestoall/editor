//· word-uses tests ·
// Cuántas veces se ha elegido cada sugerencia, en un almacenamiento falso.

import { describe, expect, test } from "bun:test"

import { createWordUses } from "./word-uses"

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}

describe("createWordUses", () => {
  test("cuenta cada vez que se elige y lo recuerda en el almacenamiento", () => {
    const storage = memory()
    const uses = createWordUses(storage)
    uses.record("Rejilla")
    uses.record("Rejilla")
    uses.record("Editor")
    expect(createWordUses(storage).read()).toEqual({ Rejilla: 2, Editor: 1 })
  })
  test("olvidar resta una, y a cero la quita", () => {
    const storage = memory()
    const counts = createWordUses(storage, "otra")
    counts.record("desplgeable")
    counts.record("desplgeable")
    counts.forget("desplgeable")
    expect(createWordUses(storage, "otra").read()).toEqual({ desplgeable: 1 })
    counts.forget("desplgeable")
    counts.forget("nunca vista")
    expect(createWordUses(storage, "otra").read()).toEqual({})
  })
  test("con tope, se van las escritas una vez, las más antiguas primero", () => {
    const counts = createWordUses(memory(), "otra", 3)
    counts.record("antigua")
    counts.record("usada")
    counts.record("usada")
    counts.record("reciente")
    counts.record("nueva")
    expect(counts.read()).toEqual({ usada: 2, reciente: 1, nueva: 1 })
  })
  test("las que usas no se pierden aunque se pase el tope", () => {
    const counts = createWordUses(memory(), "otra", 1)
    for (const word of ["una", "una", "dos", "dos"]) counts.record(word)
    expect(counts.read()).toEqual({ una: 2, dos: 2 })
  })
  test("sin almacenamiento (o si falla), empieza de cero y no rompe", () => {
    const uses = createWordUses(null)
    uses.record("Rejilla")
    expect(uses.read()).toEqual({ Rejilla: 1 })
    const broken = {
      getItem: () => {
        throw new Error("bloqueado")
      },
      setItem: () => {
        throw new Error("bloqueado")
      },
    }
    expect(createWordUses(broken).read()).toEqual({})
  })
})
