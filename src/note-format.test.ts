//· note-format tests ·
// La regla del formato de una nota del Timeline (ADR 0020 de ideas). Esta
// tabla es la misma, letra a letra, en yestoall.com: si cambia un caso, cambia
// en los dos sitios.

import { describe, expect, test } from "bun:test"

import { formatSpans, plainText, postText } from "./note-format"

// cada trozo, como «tipo: lo que abarca»
const spans = (text: string) => formatSpans(text).map((s) => `${s.kind}: ${text.slice(s.from, s.to)}`)

// texto → sus trozos, el texto sin signos y el del post
const CASES: { name: string; text: string; spans: string[]; plain: string; post: string }[] = [
  {
    name: "una negrita con **",
    text: "hoy **mucho** sol",
    spans: ["bold: **mucho**"],
    plain: "hoy mucho sol",
    post: "hoy mucho sol",
  },
  {
    name: "una negrita con __",
    text: "hoy __mucho__ sol",
    spans: ["bold: __mucho__"],
    plain: "hoy mucho sol",
    post: "hoy mucho sol",
  },
  {
    name: "una cursiva con *",
    text: "vi *Alien* ayer",
    spans: ["italic: *Alien*"],
    plain: "vi Alien ayer",
    post: "vi Alien ayer",
  },
  {
    name: "una cursiva con _",
    text: "vi _Alien_ ayer",
    spans: ["italic: _Alien_"],
    plain: "vi Alien ayer",
    post: "vi Alien ayer",
  },
  {
    name: "un enlace en el texto",
    text: "lee [esto](https://yestoall.com/timeline) ya",
    spans: ["link: [esto](https://yestoall.com/timeline)"],
    plain: "lee esto ya",
    post: "lee esto (https://yestoall.com/timeline) ya",
  },
  {
    name: "un enlace en el texto con paréntesis en la URL",
    text: "[la peli](https://en.wikipedia.org/wiki/Alien_(film)) ya",
    spans: ["link: [la peli](https://en.wikipedia.org/wiki/Alien_(film))"],
    plain: "la peli ya",
    post: "la peli (https://en.wikipedia.org/wiki/Alien_(film)) ya",
  },
  {
    name: "una negrita dentro de una cursiva",
    text: "_muy **rico** hoy_",
    spans: ["italic: _muy **rico** hoy_", "bold: **rico**"],
    plain: "muy rico hoy",
    post: "muy rico hoy",
  },
  {
    name: "una cursiva dentro de una negrita",
    text: "**muy *rico* hoy**",
    spans: ["bold: **muy *rico* hoy**", "italic: *rico*"],
    plain: "muy rico hoy",
    post: "muy rico hoy",
  },
  {
    name: "con el mismo signo dentro, solo la de dentro",
    text: "*muy **rico** hoy*",
    spans: ["bold: **rico**"],
    plain: "*muy rico hoy*",
    post: "*muy rico hoy*",
  },
  {
    name: "formato dentro del texto de un enlace",
    text: "[**esto**](https://a.com)",
    spans: ["link: [**esto**](https://a.com)", "bold: **esto**"],
    plain: "esto",
    post: "esto (https://a.com)",
  },
  {
    name: "un * suelto, entre números o un _ dentro de una palabra",
    text: "5 * 3, 2*3*4 y a_b_c",
    spans: [],
    plain: "5 * 3, 2*3*4 y a_b_c",
    post: "5 * 3, 2*3*4 y a_b_c",
  },
  {
    name: "un _ dentro de palabras con tilde",
    text: "José_María_Ñúñez",
    spans: [],
    plain: "José_María_Ñúñez",
    post: "José_María_Ñúñez",
  },
  {
    name: "un trozo sin cerrar",
    text: "**hola y *adiós",
    spans: [],
    plain: "**hola y *adiós",
    post: "**hola y *adiós",
  },
  {
    name: "un trozo partido por un salto de línea",
    text: "**hola\nadiós**",
    spans: [],
    plain: "**hola\nadiós**",
    post: "**hola\nadiós**",
  },
  {
    name: "un _ dentro de una URL suelta",
    text: "mira https://a.com/_x_/y y ya",
    spans: [],
    plain: "mira https://a.com/_x_/y y ya",
    post: "mira https://a.com/_x_/y y ya",
  },
  {
    name: "un * y un _ dentro de una URL suelta con paréntesis",
    text: "https://web.archive.org/web/*/a.com/* y https://a.com/x(_y_)",
    spans: [],
    plain: "https://web.archive.org/web/*/a.com/* y https://a.com/x(_y_)",
    post: "https://web.archive.org/web/*/a.com/* y https://a.com/x(_y_)",
  },
  {
    name: "un _ dentro de la URL de un enlace en el texto",
    text: "[esto](https://a.com/_x_)",
    spans: ["link: [esto](https://a.com/_x_)"],
    plain: "esto",
    post: "esto (https://a.com/_x_)",
  },
  {
    name: "signos que cruzan otro trozo sin estar dentro",
    text: "**a [b** c](https://a.com)",
    spans: ["link: [b** c](https://a.com)"],
    plain: "**a b** c",
    post: "**a b** c (https://a.com)",
  },
  {
    name: "un emoji dentro de una negrita",
    text: "**hola 🤟**",
    spans: ["bold: **hola 🤟**"],
    plain: "hola 🤟",
    post: "hola 🤟",
  },
  {
    name: "una negrita alrededor de una URL suelta",
    text: "**https://a.com**",
    spans: ["bold: **https://a.com**"],
    plain: "https://a.com",
    post: "https://a.com",
  },
  {
    name: "un texto sin formato va tal cual",
    text: "Estoy en huelga. Hoy nada de nada 🤟",
    spans: [],
    plain: "Estoy en huelga. Hoy nada de nada 🤟",
    post: "Estoy en huelga. Hoy nada de nada 🤟",
  },
  {
    name: "una nota entera",
    text: "Hoy **mucho** sol, vi _Alien_ y [esto](https://yestoall.com) me gustó",
    spans: ["bold: **mucho**", "italic: _Alien_", "link: [esto](https://yestoall.com)"],
    plain: "Hoy mucho sol, vi Alien y esto me gustó",
    post: "Hoy mucho sol, vi Alien y esto (https://yestoall.com) me gustó",
  },
]

describe("la regla del formato", () => {
  for (const c of CASES) {
    test(c.name, () => {
      expect(spans(c.text)).toEqual(c.spans)
      expect(plainText(c.text)).toBe(c.plain)
      expect(postText(c.text)).toBe(c.post)
    })
  }
})

describe("dónde van los signos", () => {
  test("los de un enlace en el texto, con su URL", () => {
    expect(formatSpans("lee [esto](https://yestoall.com/timeline) ya")).toEqual([
      {
        kind: "link",
        from: 4,
        to: 41,
        content: [5, 9],
        signs: [
          [4, 5],
          [9, 41],
        ],
        url: "https://yestoall.com/timeline",
      },
    ])
  })

  test("los de una negrita", () => {
    expect(formatSpans("**sí**")).toEqual([
      {
        kind: "bold",
        from: 0,
        to: 6,
        content: [2, 4],
        signs: [
          [0, 2],
          [4, 6],
        ],
      },
    ])
  })
})
