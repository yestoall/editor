//· pairs tests ·
// Comillas, paréntesis y compañía al escribir, sobre un EditorState sin DOM.

import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state"
import { describe, expect, test } from "bun:test"

import { deletePair, insertPair } from "./pairs"

// el texto con el cursor en «|», o una selección entre «[» y «]»
const at = (marked: string) => {
  const open = marked.indexOf("[")
  if (open >= 0 && marked.includes("]")) {
    const doc = marked.replace("[", "").replace("]", "")
    return EditorState.create({ doc, selection: EditorSelection.range(open, marked.indexOf("]") - 1) })
  }
  return EditorState.create({ doc: marked.replace("|", ""), selection: EditorSelection.cursor(marked.indexOf("|")) })
}

// lo que queda, con el cursor en «|» (o la selección entre [ y ]); null si
// la tecla sigue la de serie
const show = (state: EditorState, spec: TransactionSpec | null) => {
  if (!spec) return null
  const next = state.update(spec).state
  const doc = next.doc.toString()
  const { from, to } = next.selection.main
  return from === to ? doc.slice(0, from) + "|" + doc.slice(from) : `${doc.slice(0, from)}[${doc.slice(from, to)}]${doc.slice(to)}`
}
const type = (marked: string, char: string) => {
  const state = at(marked)
  return show(state, insertPair(state, char))
}
const erase = (marked: string) => {
  const state = at(marked)
  return show(state, deletePair(state))
}

describe("al abrir", () => {
  test("las comillas se cierran y el cursor queda dentro", () => {
    expect(type("dijo |", '"')).toBe('dijo "|"')
    expect(type("dijo |", "'")).toBe("dijo '|'")
    expect(type("usa |", "`")).toBe("usa `|`")
  })
  test("también las tipográficas, que pone el teclado del iPhone", () => {
    expect(type("dijo |", "«")).toBe("dijo «|»")
    expect(type("dijo |", "“")).toBe("dijo “|”")
    expect(type("dijo |", "‘")).toBe("dijo ‘|’")
  })
  test("y los paréntesis, corchetes, llaves y ángulos", () => {
    expect(type("|", "(")).toBe("(|)")
    expect(type("a |", "[")).toBe("a [|]")
    expect(type("a |", "{")).toBe("a {|}")
    expect(type("a |", "<")).toBe("a <|>")
  })
  test("delante de una letra solo abre", () => {
    expect(type("|hola", "(")).toBeNull()
    expect(type("|hola", '"')).toBeNull()
  })
  test("el apóstrofo y las comillas rectas, detrás de una letra, no se cierran", () => {
    expect(type("don|", "'")).toBeNull()
    expect(type("hola|", '"')).toBeNull()
  })
  test("con texto seleccionado, lo envuelve", () => {
    expect(type("di [hola] ya", "(")).toBe("di ([hola]) ya")
    expect(type("di [hola] ya", "«")).toBe("di «[hola]» ya")
  })
  test("lo demás sigue la tecla de serie", () => {
    expect(type("a|", "x")).toBeNull()
  })
})

describe("al cerrar", () => {
  test("si el de cerrar ya está delante, lo salta en vez de repetirlo", () => {
    expect(type('"hola|"', '"')).toBe('"hola"|')
    expect(type("(a|)", ")")).toBe("(a)|")
    expect(type("«a|»", "»")).toBe("«a»|")
    expect(type("“a|”", "”")).toBe("“a”|")
  })
  test("si no está, se escribe", () => {
    expect(type("(a|", ")")).toBeNull()
  })
})

describe("al borrar", () => {
  test("entre un par vacío, se van los dos", () => {
    expect(erase("(|)")).toBe("|")
    expect(erase('di "|"')).toBe("di |")
    expect(erase("«|»")).toBe("|")
  })
  test("con algo dentro, borra como siempre", () => {
    expect(erase("(a|)")).toBeNull()
    expect(erase("a|b")).toBeNull()
  })
})
