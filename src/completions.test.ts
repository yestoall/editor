//· completions tests ·
// Lo que propone el editor al escribir, sin DOM: CompletionContext sobre un
// EditorState.

import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete"
import { EditorSelection, EditorState } from "@codemirror/state"
import { describe, expect, test } from "bun:test"

import { skillCompletions, tagCompletions } from "./completions"

// el texto con el cursor en «|»
const contextAt = (marked: string, explicit = false) => {
  const state = EditorState.create({
    doc: marked.replace("|", ""),
    selection: EditorSelection.cursor(marked.indexOf("|")),
  })
  return new CompletionContext(state, marked.indexOf("|"), explicit)
}
const labels = (result: CompletionResult | null) => result?.options.map((option) => option.label)

describe("las skills, al escribir «/»", () => {
  const source = skillCompletions(() => ["/git", "/documenta", "/idea"])
  test("propone todas desde la barra", () => {
    const result = source(contextAt("hazlo y /|"))
    expect(result?.from).toBe(8)
    expect(labels(result)).toEqual(["/git", "/documenta", "/idea"])
  })
  test("también con algo escrito: el filtro lo pone el editor", () => {
    expect(source(contextAt("hazlo y /do|"))?.from).toBe(8)
  })
  test("sin skills (al escribir una cita), «/» no propone nada", () => {
    expect(labels(skillCompletions(() => [])(contextAt("hazlo y /|")))).toEqual([])
  })
  test("no en mitad de una ruta ni sin barra", () => {
    expect(source(contextAt("src/edi|"))).toBeNull()
    expect(source(contextAt("hazlo y |"))).toBeNull()
  })
})

describe("los tags de Citas, al escribir «#»", () => {
  const source = tagCompletions(() => [
    { name: "amor", count: 165 },
    { name: "Pasión", count: 40 },
    { name: "redes sociales", count: 29 },
    { name: "compasión", count: 7 },
  ])
  const applied = (result: CompletionResult | null) => result?.options.map((option) => option.apply)

  test("desde la almohadilla, los más usados", () => {
    const result = source(contextAt("La vida\n#|"))
    expect(result?.from).toBe(8)
    expect(labels(result)).toEqual(["#amor", "#Pasión", "#redes sociales", "#compasión"])
  })

  test("sin distinguir mayúsculas ni tildes, y lo que empieza igual primero", () => {
    expect(labels(source(contextAt("La vida\n#pasion|")))).toEqual(["#Pasión", "#compasión"])
  })

  test("inserta la forma guardada, con «_» donde hay espacios", () => {
    expect(applied(source(contextAt("#redes|")))).toEqual(["#redes_sociales"])
  })

  test("no pegada a una palabra", () => {
    expect(source(contextAt("en C#|"))).toBeNull()
  })
})
