//· format-commands tests ·
// ⌘B, ⌘I, ⌘K y pegar una URL en una nota, sobre un EditorState sin DOM.

import { history, undo } from "@codemirror/commands"
import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state"
import { describe, expect, test } from "bun:test"

import { linkSelection, pasteLink, toggleBold, toggleItalic } from "./format-commands"

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

const press = (marked: string, command: (state: EditorState) => TransactionSpec | null) => {
  const state = at(marked)
  return show(state, command(state))
}

describe("⌘B", () => {
  test("pone la negrita alrededor de la selección", () => {
    expect(press("hoy [mucho] sol", toggleBold)).toBe("hoy **[mucho]** sol")
  })

  test("otra vez, la quita", () => {
    expect(press("hoy **[mucho]** sol", toggleBold)).toBe("hoy [mucho] sol")
  })

  test("la quita también con los signos dentro de la selección", () => {
    expect(press("hoy [**mucho**] sol", toggleBold)).toBe("hoy [mucho] sol")
  })

  test("sin selección, deja los signos con el cursor en medio", () => {
    expect(press("hoy |", toggleBold)).toBe("hoy **|**")
  })

  test("sin selección, otra vez, quita los signos vacíos", () => {
    expect(press("hoy **|**", toggleBold)).toBe("hoy |")
  })

  test("con el cursor dentro de una negrita, se la quita entera", () => {
    expect(press("hoy **mu|cho** sol", toggleBold)).toBe("hoy mu|cho sol")
  })

  test("quita también la escrita con __", () => {
    expect(press("hoy __[mucho]__ sol", toggleBold)).toBe("hoy [mucho] sol")
  })

  test("sobre una parte de una negrita, se la quita solo a esa parte", () => {
    expect(press("**[mu]cho**", toggleBold)).toBe("[mu]**cho**")
    expect(press("**mu[cho]**", toggleBold)).toBe("**mu**[cho]")
    expect(press("**mu[ch]o**", toggleBold)).toBe("**mu**[ch]**o**")
  })

  test("sobre una cursiva con *, la negrita va con __ para que no queden tres asteriscos", () => {
    expect(press("hoy *[mucho]* sol", toggleBold)).toBe("hoy *__[mucho]__* sol")
    expect(press("hoy [*mucho*] sol", toggleBold)).toBe("hoy __[*mucho*]__ sol")
  })
})

describe("⌘I", () => {
  test("pone la cursiva alrededor de la selección", () => {
    expect(press("vi [Alien] ayer", toggleItalic)).toBe("vi *[Alien]* ayer")
  })

  test("otra vez, la quita", () => {
    expect(press("vi *[Alien]* ayer", toggleItalic)).toBe("vi [Alien] ayer")
  })

  test("quita también la escrita con _", () => {
    expect(press("vi _[Alien]_ ayer", toggleItalic)).toBe("vi [Alien] ayer")
  })

  test("sobre una negrita con **, la cursiva va con _ para que no queden tres asteriscos", () => {
    expect(press("vi **[Alien]** ayer", toggleItalic)).toBe("vi **_[Alien]_** ayer")
  })

  test("sin selección, deja los signos con el cursor en medio", () => {
    expect(press("vi |", toggleItalic)).toBe("vi *|*")
  })
})

describe("⌘K", () => {
  test("deja la selección como enlace, con el cursor entre los paréntesis", () => {
    expect(press("lee [esto] ya", linkSelection)).toBe("lee [esto](|) ya")
  })

  test("sin selección, deja el enlace vacío con el cursor en el texto", () => {
    expect(press("lee |", linkSelection)).toBe("lee [|]()")
  })
})

describe("pegar una URL", () => {
  const paste = (marked: string, pasted: string) => {
    const state = at(marked)
    return show(state, pasteLink(state, pasted))
  }

  test("sobre una selección, la convierte en enlace", () => {
    expect(paste("lee [esto] ya", "https://yestoall.com")).toBe("lee [esto](https://yestoall.com)| ya")
  })

  test("con espacios alrededor, también", () => {
    expect(paste("lee [esto] ya", "  https://yestoall.com\n")).toBe("lee [esto](https://yestoall.com)| ya")
  })

  test("sin selección, pega como siempre", () => {
    expect(paste("lee |", "https://yestoall.com")).toBeNull()
  })

  test("algo que no es una URL, pega como siempre", () => {
    expect(paste("lee [esto] ya", "hola")).toBeNull()
    expect(paste("lee [esto] ya", "https://a.com y más")).toBeNull()
  })
})

describe("⌘Z", () => {
  test("deshace un ⌘B de una vez, aunque vaya justo detrás de lo escrito", () => {
    let state = EditorState.create({ doc: "", extensions: history() })
    state = state.update({ changes: { from: 0, insert: "hola" }, selection: EditorSelection.range(0, 4), userEvent: "input.type" }).state
    state = state.update(toggleBold(state)).state
    expect(state.doc.toString()).toBe("**hola**")
    undo({ state, dispatch: (tr) => (state = tr.state) })
    expect(state.doc.toString()).toBe("hola")
  })

  test("lo que se escribe justo detrás de un ⌘B o un ⌘K se deshace aparte", () => {
    for (const [command, written] of [
      [toggleBold, "**z**"],
      [linkSelection, "[z]()"],
    ] as const) {
      let state = EditorState.create({ doc: "", extensions: history() })
      state = state.update(command(state)).state
      state = state.update({
        changes: { from: state.selection.main.head, insert: "z" },
        selection: EditorSelection.cursor(state.selection.main.head + 1),
        userEvent: "input.type",
      }).state
      expect(state.doc.toString()).toBe(written)
      undo({ state, dispatch: (tr) => (state = tr.state) })
      expect(state.doc.toString()).toBe(written.replace("z", ""))
    }
  })
})

describe("con varias selecciones", () => {
  test("cada una, la suya", () => {
    const state = EditorState.create({
      doc: "uno dos",
      selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)]),
      extensions: EditorState.allowMultipleSelections.of(true),
    })
    const bold = state.update(toggleBold(state)).state
    expect(bold.doc.toString()).toBe("**uno** **dos**")
    expect(bold.update(toggleBold(bold)).state.doc.toString()).toBe("uno dos")
    expect(state.update(toggleItalic(state)).state.doc.toString()).toBe("*uno* *dos*")
  })
})
