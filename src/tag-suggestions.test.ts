//· tag-suggestions tests ·
// Qué #tag se está escribiendo según el cursor, qué tags del vocabulario se
// sugieren en la barra del teclado del iPhone, y cómo se completa.

import { describe, expect, test } from "bun:test"

import { completeTag, suggestTags, tagAt } from "./tag-suggestions"

// el cursor va donde está «|»
const at = (marked: string) => {
  const cursor = marked.indexOf("|")
  return { text: marked.replace("|", ""), cursor }
}
const tagIn = (marked: string) => {
  const { text, cursor } = at(marked)
  return tagAt(text, cursor)
}

// como los da citasVocabulary: de más a menos usados
const TAGS = [
  { name: "amor", count: 165 },
  { name: "humor", count: 90 },
  { name: "amistad", count: 40 },
  { name: "redes sociales", count: 12 },
  { name: "Árbol", count: 3 },
]
const suggest = (marked: string) => {
  const { text, cursor } = at(marked)
  return suggestTags(text, cursor, TAGS)?.options.map((entry) => entry.name) ?? null
}

describe("tagAt", () => {
  test("el cursor al final de un #tag a medio escribir", () => {
    expect(tagIn("El amor es ciego\n#am|")).toEqual({ from: 17, to: 20, query: "am" })
  })

  test("al principio del texto, y con solo la #", () => {
    expect(tagIn("#|")).toEqual({ from: 0, to: 1, query: "" })
  })

  test("a media frase, tras un espacio o lo que abre", () => {
    expect(tagIn("Las #red| son")).toEqual({ from: 4, to: 8, query: "red" })
    expect(tagIn("(«#hum|")).toEqual({ from: 2, to: 6, query: "hum" })
  })

  test("con el cursor dentro del tag, el tag llega hasta el final de la palabra", () => {
    expect(tagIn("#am|or y más")).toEqual({ from: 0, to: 5, query: "am" })
  })

  test("fuera de un tag no hay ninguno: pegado a una palabra, tras un espacio, o lejos", () => {
    expect(tagIn("Programo en C#|")).toBeNull()
    expect(tagIn("#amor |")).toBeNull()
    expect(tagIn("Nada| más #amor")).toBeNull()
  })
})

describe("suggestTags", () => {
  test("los que casan, sin tildes ni mayúsculas: primero los que empiezan igual", () => {
    expect(suggest("Texto\n#A|")).toEqual(["amor", "amistad", "Árbol", "redes sociales"])
    expect(suggest("Texto\n#arb|")).toEqual(["Árbol"])
    expect(suggest("Texto\n#RED|")).toEqual(["redes sociales"])
  })

  test("con solo la #, los más usados", () => {
    expect(suggest("Texto\n#|")?.slice(0, 2)).toEqual(["amor", "humor"])
  })

  test("el que ya está escrito tal cual no se sugiere", () => {
    expect(suggest("Texto\n#amor|")).toBeNull()
    expect(suggest("Texto\n#redes_sociales|")).toBeNull()
  })

  test("sin coincidencias, o fuera de un tag, nada", () => {
    expect(suggest("Texto\n#zzz|")).toBeNull()
    expect(suggest("Texto| #am")).toBeNull()
  })
})

describe("completeTag", () => {
  test("cambia lo escrito por el tag entero, con «_» por espacio y un espacio detrás", () => {
    const { text, cursor } = at("Texto\n#red|")
    const tag = tagAt(text, cursor)!
    expect(completeTag(text, tag, "redes sociales")).toEqual({
      from: 6,
      to: 10,
      insert: "#redes_sociales ",
      cursor: 22,
    })
  })

  test("si ya hay un espacio detrás, no pone otro: el cursor salta por encima", () => {
    const { text, cursor } = at("#am|or y más")
    const tag = tagAt(text, cursor)!
    expect(completeTag(text, tag, "amor")).toEqual({ from: 0, to: 5, insert: "#amor", cursor: 6 })
  })
})
