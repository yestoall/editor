//· cita tests ·
// Lo que se decide antes de guardar una cita: qué es la cita, qué sus
// tags, y si se puede guardar.

import { describe, expect, test } from "bun:test"

import { type Cita, citasVocabulary, draftFromCita, matchVocabulary, parseCita, TAG_PATTERN } from "./cita"

const parse = (text: string, author = "", source = "") => parseCita({ text, author, source })

describe("parseCita", () => {
  test("las líneas del final hechas solo de #tags no son de la cita: son sus tags", () => {
    expect(parse("El amor es ciego\n#amor #ceguera", "Groucho Marx")).toEqual({
      ok: true,
      cita: { content: "El amor es ciego", author: "Groucho Marx", source: null, tags: ["amor", "ceguera"] },
    })
  })

  test("un #tag en mitad de la frase deja la palabra, y «_» vale espacio", () => {
    expect(parse("Las #redes_sociales son la #vida moderna\n#humor")).toEqual({
      ok: true,
      cita: {
        content: "Las redes sociales son la vida moderna",
        author: null,
        source: null,
        tags: ["redes sociales", "vida", "humor"],
      },
    })
  })

  test("la puntuación del final no es del tag, la de dentro sí, y los repetidos cuentan una vez", () => {
    expect(parse("Todo es #web_2.0. Y la #vida, #vida.\n#vida")).toEqual({
      ok: true,
      cita: { content: "Todo es web 2.0. Y la vida, vida.", author: null, source: null, tags: ["web 2.0", "vida"] },
    })
  })

  test("sin texto, o solo con tags, no hay cita", () => {
    expect(parse("  \n ")).toEqual({ ok: false, problems: ["empty"] })
    expect(parse("#amor #vida", "Groucho Marx")).toEqual({ ok: false, problems: ["empty"] })
  })

  test("lo que pasa de los límites de Citas no se guarda, y se dice qué", () => {
    const tooManyTags = Array.from({ length: 13 }, (_, i) => `#t${i}`).join(" ")
    expect(parse(`${"a".repeat(501)} ${tooManyTags}`, "b".repeat(121), "c".repeat(201))).toEqual({
      ok: false,
      problems: ["content", "author", "source", "tags"],
    })
    expect(parse(`Corta #${"x".repeat(41)}`)).toEqual({ ok: false, problems: ["tagLength"] })
  })

  test("justo en los límites, sí", () => {
    const twelveTags = Array.from({ length: 12 }, (_, i) => `#t${i}`).join(" ")
    const result = parse(`${"a".repeat(500)}\n#${"x".repeat(40)} ${twelveTags}`.replace(" #t11", ""), "b".repeat(120), "c".repeat(200))
    expect(result.ok).toBe(true)
  })

  test("un tag empieza y acaba en letra o número: «#_» no es tag, y «#vida_» es «vida»", () => {
    expect(parse("Arriba #_ y abajo #vida_")).toEqual({
      ok: true,
      cita: { content: "Arriba #_ y abajo vida_", author: null, source: null, tags: ["vida"] },
    })
  })

  test("una # pegada a una palabra no abre un tag", () => {
    expect(parse("Programo en C#sharp y leo web#frag (#bien) «#mejor» ¿#seguro?")).toEqual({
      ok: true,
      cita: {
        content: "Programo en C#sharp y leo web#frag (bien) «mejor» ¿seguro?",
        author: null,
        source: null,
        tags: ["bien", "mejor", "seguro"],
      },
    })
  })

  test("un tag repetido con otras mayúsculas cuenta una vez, con la primera forma", () => {
    expect(parse("El #Amor y el #amor son lo mismo\n#AMOR")).toEqual({
      ok: true,
      cita: { content: "El Amor y el amor son lo mismo", author: null, source: null, tags: ["Amor"] },
    })
  })

  test("en una línea con texto, el tag se queda como palabra aunque vaya al final", () => {
    expect(parse("La vida es #bella #vida\n\n#optimismo  #luz \n")).toEqual({
      ok: true,
      cita: { content: "La vida es bella vida", author: null, source: null, tags: ["bella", "vida", "optimismo", "luz"] },
    })
  })
})

describe("matchVocabulary (el autorrelleno de tags y autores)", () => {
  const tags = [
    { name: "amor", count: 165 },
    { name: "Pasión", count: 40 },
    { name: "redes sociales", count: 29 },
    { name: "pasiones", count: 3 },
    { name: "compasión", count: 7 },
  ]

  test("sin distinguir mayúsculas ni tildes, lo que empieza igual primero y luego lo más usado", () => {
    expect(matchVocabulary("pasion", tags).map((entry) => entry.name)).toEqual(["Pasión", "pasiones", "compasión"])
  })

  test("«_» vale espacio", () => {
    expect(matchVocabulary("redes_so", tags).map((entry) => entry.name)).toEqual(["redes sociales"])
  })

  test("sin nada escrito, los más usados; y con un tope", () => {
    expect(matchVocabulary("", tags, 2).map((entry) => entry.name)).toEqual(["amor", "Pasión"])
  })
})

describe("parseCita con el vocabulario de Citas", () => {
  const vocabulary = {
    tags: [
      { name: "amor", count: 165 },
      { name: "Amor", count: 83 },
      { name: "UNIX", count: 4 },
    ],
    authors: [{ name: "Groucho Marx", count: 40 }],
  }
  const withVocabulary = (text: string, author = "") => parseCita({ text, author, source: "" }, vocabulary)

  test("un tag o un autor que ya existe con otras mayúsculas se guarda como ya está", () => {
    expect(withVocabulary("Todo es texto\n#unix", "groucho marx")).toEqual({
      ok: true,
      cita: { content: "Todo es texto", author: "Groucho Marx", source: null, tags: ["UNIX"] },
    })
  })

  test("si hay varias formas, gana la más usada", () => {
    const parsed = withVocabulary("Nada más\n#AMOR")
    expect(parsed.ok && parsed.cita.tags).toEqual(["amor"])
  })

  test("uno nuevo se queda como se escribió (y las tildes cuentan: «pasion» no es «Pasión»)", () => {
    const parsed = parseCita(
      { text: "Nada más\n#pasion #Ternura", author: "Ajo | micropoema", source: "" },
      { tags: [{ name: "Pasión", count: 40 }], authors: [] },
    )
    expect(parsed.ok && parsed.cita).toEqual({
      content: "Nada más",
      author: "Ajo | micropoema",
      source: null,
      tags: ["pasion", "Ternura"],
    })
  })
})

describe("draftFromCita", () => {
  test("el texto, una línea en blanco y los #tags, con «_» por espacio; autor y fuente aparte", () => {
    expect(
      draftFromCita({
        content: "Las redes son la vida moderna",
        author: "Groucho Marx",
        source: "Una cena",
        tags: ["redes sociales", "Madrid"],
      }),
    ).toEqual({
      text: "Las redes son la vida moderna\n\n#redes_sociales #Madrid",
      author: "Groucho Marx",
      source: "Una cena",
    })
  })

  test("sin tags, solo el texto; sin autor ni fuente, vacíos", () => {
    expect(draftFromCita({ content: "Nada más", author: null, source: null, tags: [] })).toEqual({
      text: "Nada más",
      author: "",
      source: "",
    })
  })

  // abrir una cita en el editor y guardarla sin tocar nada la deja igual
  const roundTrip = (cita: Cita) => parseCita(draftFromCita(cita))
  const citas: [string, Cita][] = [
    ["sin tags, autor ni fuente", { content: "Nada más", author: null, source: null, tags: [] }],
    [
      "con todo",
      { content: "El amor es ciego", author: "Groucho Marx", source: "Una cena", tags: ["amor", "ceguera"] },
    ],
    [
      "tags con espacios, mayúsculas y puntos",
      { content: "Todo es texto", author: null, source: null, tags: ["redes sociales", "UNIX", "web 2.0"] },
    ],
    ["varias líneas", { content: "Primera línea\r\nSegunda línea\n\nTercera", author: "Ajo", source: null, tags: ["poema"] }],
    [
      "un # a media frase, que sería un tag",
      { content: "Postulado nº3 acerca de la importancia del #socialmedia.", author: null, source: null, tags: ["twitter"] },
    ],
    ["un # al principio", { content: "#ramoncín es mi community manager favorito.", author: null, source: null, tags: [] }],
    [
      "una línea sola de #tags al final del texto",
      { content: "Anda, vístete y vamos.\r\n#frasesdespuesdeunpolvo", author: null, source: null, tags: ["sexo"] },
    ],
    ["un # que no es tag", { content: "Programo en C# y # suelto, #1 y #!", author: null, source: null, tags: [] }],
  ]
  for (const [name, cita] of citas)
    test(`ida y vuelta: ${name}`, () => {
      expect(roundTrip(cita)).toEqual({ ok: true, cita })
    })

  test("el # del texto se ve tal cual, pero no se resalta como tag", () => {
    const { text } = draftFromCita({ content: "La importancia del #socialmedia.", author: null, source: null, tags: [] })
    expect(text.replaceAll("\u2060", "")).toBe("La importancia del #socialmedia.")
    expect([...text.matchAll(TAG_PATTERN)]).toEqual([])
  })
})

describe("citasVocabulary", () => {
  test("cuenta en cuántas citas sale cada autor y cada tag, de más a menos usados", () => {
    expect(
      citasVocabulary([
        { author: "Groucho Marx", tags: ["humor", "amor"] },
        { author: "Groucho Marx", tags: ["humor"] },
        { author: "Ajo", tags: ["poema", "humor"] },
      ]),
    ).toEqual({
      tags: [
        { name: "humor", count: 3 },
        { name: "amor", count: 1 },
        { name: "poema", count: 1 },
      ],
      authors: [
        { name: "Groucho Marx", count: 2 },
        { name: "Ajo", count: 1 },
      ],
    })
  })

  // como /api/citas/vocabulary: juntar las formas lo decide quien las usa
  // (parseCita, sin distinguir mayúsculas)
  test("cada forma escrita es una entrada, y a igualdad va el orden alfabético", () => {
    expect(
      citasVocabulary([
        { author: null, tags: ["UNIX", "Árbol"] },
        { author: null, tags: ["unix", "abeto"] },
      ]).tags,
    ).toEqual([
      { name: "abeto", count: 1 },
      { name: "Árbol", count: 1 },
      { name: "unix", count: 1 },
      { name: "UNIX", count: 1 },
    ])
  })

  test("sin autor, o con el autor en blanco, no cuenta; las citas borradas, tampoco", () => {
    expect(
      citasVocabulary([
        { author: null, tags: [] },
        { author: "  ", tags: [] },
        { author: "Groucho Marx", tags: ["amor"], deleted: true },
      ]),
    ).toEqual({ tags: [], authors: [] })
  })
})
