//· skills tests ·
// Qué cuenta como skill en el texto de una idea: una palabra con barra.

import { describe, expect, test } from "bun:test"

import { splitSkills, topSkills } from "./skills"

// solo los trozos que son skill
const skills = (text: string) => splitSkills(text).filter((part) => part.skill).map((part) => part.text)

describe("skills en el texto", () => {
  test("una palabra con barra, al principio o tras un espacio", () => {
    expect(skills("/git")).toEqual(["/git"])
    expect(skills("quita el borde /git y /documenta")).toEqual(["/git", "/documenta"])
  })

  test("con guion y con el plugin delante", () => {
    expect(skills("pásala por /ask-matt")).toEqual(["/ask-matt"])
    expect(skills("con /yestoall:idea o /mattpocock-skills:to-spec")).toEqual([
      "/yestoall:idea",
      "/mattpocock-skills:to-spec",
    ])
  })

  test("tras la puntuación que abre, y con la que cierra detrás", () => {
    expect(skills("(/git), ¿/ask-matt? «/documenta».")).toEqual(["/git", "/ask-matt", "/documenta"])
  })

  test("las rutas, las URLs y los ficheros no son skills", () => {
    expect(skills("mira src/lib y /src/lib")).toEqual([])
    expect(skills("en https://ideas.yestoall.com/git")).toEqual([])
    expect(skills("abre /package.json")).toEqual([])
    expect(skills("/Users/alguien y 1/2")).toEqual([])
  })

  test("los trozos, juntos, son el texto tal cual", () => {
    const text = "quita el borde /git, y ya"
    const parts = splitSkills(text)
    expect(parts.map((part) => part.text).join("")).toBe(text)
    expect(parts).toEqual([
      { text: "quita el borde ", skill: false },
      { text: "/git", skill: true },
      { text: ", y ya", skill: false },
    ])
  })

  test("sin skills, un solo trozo; sin texto, ninguno", () => {
    expect(splitSkills("nada")).toEqual([{ text: "nada", skill: false }])
    expect(splitSkills("")).toEqual([])
  })
})

describe("las skills más usadas", () => {
  const idea = (text: string, updatedAt: number, origin = "user") => ({ text, origin, updatedAt })

  test("de más a menos usada, contando cada vez que sale", () => {
    const ideas = [idea("/git y /documenta", 1), idea("otra vez /git", 2), idea("/git, ya", 3)]
    expect(topSkills(ideas)).toEqual(["/git", "/documenta"])
  })

  test("en empate, la usada más hace poco", () => {
    expect(topSkills([idea("/vieja", 1), idea("/nueva", 5)])).toEqual(["/nueva", "/vieja"])
  })

  test("las de la IA no cuentan", () => {
    expect(topSkills([idea("/git", 1, "ai"), idea("/documenta", 2)])).toEqual(["/documenta"])
  })

  test("como mucho las que se piden", () => {
    const ideas = [idea("/a /b /c /d", 1)]
    expect(topSkills(ideas, 2)).toHaveLength(2)
  })

  test("sin skills, ninguna", () => {
    expect(topSkills([idea("una idea sin barras ni rutas /src/lib", 1)])).toEqual([])
  })
})
