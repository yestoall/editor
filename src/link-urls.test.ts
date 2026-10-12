//· link-urls tests ·
// Qué trozos del texto de un enlace son URLs que se pueden abrir.

import { describe, expect, test } from "bun:test"

import { opensOnClick, opensOnPress, urlRanges } from "./link-urls"

const urls = (text: string) => urlRanges(text).map(({ url }) => url)

describe("las URLs del texto", () => {
  test("la de arriba del resumen y la de cada segmento, con su minuto", () => {
    const text = [
      "Cómo trabajo con agentes — Matt Pocock",
      "https://youtu.be/BsJGo1wFTvQ",
      "- Los tickets (04:54 https://youtu.be/BsJGo1wFTvQ?t=294).",
    ].join("\n")
    expect(urls(text)).toEqual(["https://youtu.be/BsJGo1wFTvQ", "https://youtu.be/BsJGo1wFTvQ?t=294"])
  })

  test("sin comerse el paréntesis de cierre ni la puntuación de la frase", () => {
    expect(urls("(https://example.com/a)")).toEqual(["https://example.com/a"])
    expect(urls("Mira https://example.com/b, y https://example.com/c.")).toEqual([
      "https://example.com/b",
      "https://example.com/c",
    ])
  })

  test("un paréntesis que es de la URL se queda", () => {
    expect(urls("https://es.wikipedia.org/wiki/Foo_(bar)")).toEqual(["https://es.wikipedia.org/wiki/Foo_(bar)"])
  })

  test("dónde está cada una en el texto", () => {
    const text = "Ver (https://a.com/x) y https://b.com"
    expect(urlRanges(text)).toEqual([
      { from: 5, to: 20, url: "https://a.com/x" },
      { from: 24, to: 37, url: "https://b.com" },
    ])
    for (const { from, to, url } of urlRanges(text)) expect(text.slice(from, to)).toBe(url)
  })

  test("solo http y https", () => {
    expect(urls("ftp://example.com javascript:alert(1) www.example.com")).toEqual([])
  })
})

describe("abrir una URL con el ratón", () => {
  const plain = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, selectionEmpty: true }
  test("un clic simple la abre, como un botón", () => {
    expect(opensOnClick(plain)).toBe(true)
  })
  test("con ⌥ pone el cursor, con ⇧ estira la selección y arrastrando selecciona", () => {
    expect(opensOnClick({ ...plain, altKey: true })).toBe(false)
    expect(opensOnClick({ ...plain, shiftKey: true })).toBe(false)
    expect(opensOnClick({ ...plain, selectionEmpty: false })).toBe(false)
  })
  test("con ⌘ (o Ctrl) se abre al pulsar, no otra vez al soltar", () => {
    expect(opensOnPress({ metaKey: true, ctrlKey: false })).toBe(true)
    expect(opensOnPress({ metaKey: false, ctrlKey: true })).toBe(true)
    expect(opensOnPress(plain)).toBe(false)
    expect(opensOnClick({ ...plain, metaKey: true })).toBe(false)
  })
})
