//· fonts tests ·
// La letra del editor: qué fuentes hay en cada sitio, qué pesos tiene cada
// una y cómo se pide cada una por URL.

import { describe, expect, test } from "bun:test"

import {
  clampFontSize,
  closestWeight,
  featuresForEngine,
  fontByKey,
  fontCss,
  fontFamily,
  fontFeatureSettings,
  fontFileUrl,
  fontsFor,
  googleCssUrl,
  isFontKey,
  isFontWeight,
  isVariable,
  nativeFontVariant,
  ttfUrls,
} from "./fonts"

describe("las fuentes de cada sitio", () => {
  test("SF Mono es la de serie y la primera; en la web se llama Geist Mono", () => {
    expect(fontsFor("native")[0]).toMatchObject({ key: "sf-mono", label: "SF Mono" })
    expect(fontsFor("web")[0]).toMatchObject({ key: "sf-mono", label: "Geist Mono" })
  })

  test("Geist Mono aparte solo en el iPhone: en la web ya es la de serie", () => {
    expect(fontsFor("native").some((font) => font.key === "geist-mono")).toBe(true)
    expect(fontsFor("web").some((font) => font.key === "geist-mono")).toBe(false)
  })

  test("las iA, en los dos", () => {
    for (const platform of ["web", "native"] as const) {
      expect(fontsFor(platform).filter((font) => font.source === "ia").map((font) => font.key)).toEqual([
        "mono",
        "duo",
        "quattro",
      ])
    }
  })

  test("una clave que ya no está, o que no es de este sitio, no vale", () => {
    expect(isFontKey("jetbrains-mono", "web")).toBe(true)
    expect(isFontKey("geist-mono", "web")).toBe(false)
    expect(isFontKey("comic-sans", "native")).toBe(false)
  })
})

describe("el peso", () => {
  const font = (key: string) => fontsFor("native").find((candidate) => candidate.key === key)!

  test("si la fuente lo tiene, ese", () => {
    expect(closestWeight(font("jetbrains-mono"), 500)).toBe(500)
  })

  test("si no, el más cercano que tenga", () => {
    expect(closestWeight(font("dm-mono"), 600)).toBe(500)
    expect(closestWeight(font("space-mono"), 600)).toBe(400)
    expect(closestWeight(font("mono"), 500)).toBe(400)
  })
})

describe("por URL", () => {
  const font = (key: string) => fontsFor("web").find((candidate) => candidate.key === key)!

  test("Google Fonts: la familia con sus pesos, y que se escriba con otra mientras llega", () => {
    expect(googleCssUrl(font("ibm-plex-mono"), [400, 600])).toBe(
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap",
    )
  })

  test("la familia en CSS, con la del sistema detrás mientras no llega", () => {
    expect(fontFamily("jetbrains-mono")).toBe('"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace')
  })

  test("el CSS de una de Google, con todos sus pesos", () => {
    expect(fontCss("dm-mono", "")).toBe(
      '@import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap");',
    )
  })

  test("el CSS de una iA: su fichero, en la web que las sirve", () => {
    expect(fontCss("duo", "https://ideas.yestoall.com")).toBe(
      '@font-face{font-family:"iA Writer Duo";font-weight:400;src:url("https://ideas.yestoall.com/fonts/iAWriterDuoS-Regular.ttf") format("truetype");font-display:swap}',
    )
  })

  test("la del sistema no pide nada", () => {
    expect(fontCss("sf-mono", "")).toBe("")
  })
})

describe("los TTF que da Google a quien no es un navegador", () => {
  const css = [
    "@font-face {",
    "  font-family: 'JetBrains Mono';",
    "  font-weight: 400;",
    "  src: url(https://fonts.gstatic.com/s/jetbrainsmono/v24/a.ttf) format('truetype');",
    "}",
    "@font-face {",
    "  font-family: 'JetBrains Mono';",
    "  font-weight: 600;",
    "  src: url(https://fonts.gstatic.com/s/jetbrainsmono/v24/b.ttf) format('truetype');",
    "}",
  ].join("\n")

  test("uno por peso", () => {
    expect(ttfUrls(css)).toEqual({
      400: "https://fonts.gstatic.com/s/jetbrainsmono/v24/a.ttf",
      600: "https://fonts.gstatic.com/s/jetbrainsmono/v24/b.ttf",
    })
  })
})

describe("el tamaño de letra", () => {
  test("el pellizco y ⌘− bajan hasta 10, no más", () => {
    expect(clampFontSize(11)).toBe(11)
    expect(clampFontSize(10)).toBe(10)
    expect(clampFontSize(6)).toBe(10)
  })
  test("y suben hasta 34", () => {
    expect(clampFontSize(40)).toBe(34)
  })
})

describe("Paper Mono, la variable", () => {
  const paper = fontByKey("paper-mono")

  test("en los dos sitios, con los ocho pesos, del 100 al 800", () => {
    for (const platform of ["web", "native"] as const) expect(isFontKey("paper-mono", platform)).toBe(true)
    expect(paper.weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800])
    expect(isVariable(paper)).toBe(true)
    expect(isVariable(fontByKey("jetbrains-mono"))).toBe(false)
  })

  test("un peso es uno de los ocho, de cien en cien", () => {
    expect(isFontWeight(100)).toBe(true)
    expect(isFontWeight(800)).toBe(true)
    expect(isFontWeight(450)).toBe(false)
    expect(isFontWeight(900)).toBe(false)
  })

  test("en la web, un solo fichero variable con todo el rango de pesos", () => {
    expect(fontCss("paper-mono", "https://ideas.yestoall.com")).toBe(
      '@font-face{font-family:"Paper Mono";font-weight:100 800;src:url("https://ideas.yestoall.com/fonts/PaperMono-Variable.woff2") format("woff2");font-display:swap}',
    )
  })

  test("en el iPhone, un fichero por peso", () => {
    expect(fontFileUrl(paper, 600, "https://ideas.yestoall.com")).toBe(
      "https://ideas.yestoall.com/fonts/PaperMono-SemiBold.ttf",
    )
    expect(fontFileUrl(paper, 100, "")).toBe("/fonts/PaperMono-Thin.ttf")
  })

  test("el peso de otra letra, al pasar a Paper Mono, se queda; al volver, el más cercano", () => {
    expect(closestWeight(paper, 500)).toBe(500)
    expect(closestWeight(fontByKey("jetbrains-mono"), 800)).toBe(600)
    expect(closestWeight(fontByKey("jetbrains-mono"), 100)).toBe(400)
  })
})

describe("los interruptores de Paper Mono", () => {
  test("los seis, en su orden", () => {
    expect(fontByKey("paper-mono").features).toEqual(["ss01", "ss02", "ss03", "ss04", "cv01", "zero"])
    expect(fontByKey("jetbrains-mono").features).toBeUndefined()
  })

  test("en CSS, los encendidos que tiene la letra; sin ninguno, normal", () => {
    expect(fontFeatureSettings("paper-mono", ["ss02", "zero"])).toBe('"ss02" 1, "zero" 1')
    expect(fontFeatureSettings("paper-mono", [])).toBe("normal")
    expect(fontFeatureSettings("jetbrains-mono", ["ss02"])).toBe("normal")
  })

  test("en WebKit, sin los espacios estrechos; en Chromium, todos", () => {
    const safari =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
    const macApp = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"
    const chrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
    expect(featuresForEngine(["ss01", "ss03", "zero"], safari)).toEqual(["ss01", "zero"])
    expect(featuresForEngine(["ss01", "ss03", "zero"], macApp)).toEqual(["ss01", "zero"])
    expect(featuresForEngine(["ss01", "ss03", "zero"], chrome)).toEqual(["ss01", "ss03", "zero"])
  })

  test("en el iPhone (React Native) solo llegan los cuatro juegos de estilo", () => {
    expect(nativeFontVariant("paper-mono", ["ss01", "ss04", "cv01", "zero"])).toEqual(["stylistic-one", "stylistic-four"])
    expect(nativeFontVariant("jetbrains-mono", ["ss01"])).toEqual([])
  })
})
