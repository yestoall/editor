//· gray-correction tests ·
// La corrección en gris: qué palabra terminada se propone cambiar y por cuál,
// con un léxico pequeño de mentira (el de verdad, en gray-lexicon.test).

import { describe, expect, test } from "bun:test"

import { correctionFor, type Lexicon, vocabularyWords } from "./gray-correction"

type Suggestion = { term: string; distance: number; count: number }

// las palabras que existen, con sus usos; las parecidas de cada errata, y las
// que existen con una tilde más, como las daría el léxico de verdad
const lexicon = (
  words: Record<string, number>,
  suggestions: Record<string, Suggestion[]> = {},
  withAccent: Record<string, string[]> = {},
): Lexicon => ({
  isWord: (w) => w in words,
  count: (w) => words[w] ?? 0,
  accented: (folded) =>
    Object.entries(words)
      .filter(([w]) => w.normalize("NFD").replace(/\p{M}/gu, "") === folded)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count),
  accentVariants: (w) => withAccent[w] ?? [],
  suggest: (w) => suggestions[w] ?? [],
})

const none = new Set<string>()

describe("qué se propone", () => {
  test("la tilde que le falta", () => {
    const words = { navegación: 1_816_046, navegar: 900_000 }
    const lex = lexicon(words, {}, { navegacion: ["navegación"] })
    expect(correctionFor("navegacion", lex, none)?.to).toBe("navegación")
  })
  test("la más usada de las parecidas: letras cambiadas, de más o de menos", () => {
    const lex = lexicon(
      { quiero: 5_283_248, quieto: 400_000 },
      { queiro: [{ term: "quiero", distance: 1, count: 5_283_248 }, { term: "quieto", distance: 1, count: 400_000 }] },
    )
    expect(correctionFor("queiro", lex, none)?.to).toBe("quiero")
  })
  test("ninguna si la palabra existe, también en inglés", () => {
    const lex = lexicon({ librería: 900_000, commit: 0 }, { commit: [{ term: "comité", distance: 1, count: 2_000_000 }] })
    expect(correctionFor("librería", lex, none)).toBeNull()
    expect(correctionFor("commit", lex, none)).toBeNull()
  })
})

describe("la tilde de una que existe sin ella", () => {
  test("si la de tilde se usa muchísimo más", () => {
    const lex = lexicon({ circulo: 216_121, círculo: 2_318_943, videos: 101_130, vídeos: 35_491 })
    expect(correctionFor("circulo", lex, none)?.to).toBe("círculo")
    expect(correctionFor("videos", lex, none)).toBeNull()
  })
  test("si solo existe en inglés y en español lleva tilde", () => {
    const lex = lexicon({ extension: 0, extensión: 5_514_204, release: 0, reléase: 3_000 })
    expect(correctionFor("extension", lex, none)?.to).toBe("extensión")
    expect(correctionFor("Release", lex, none)).toBeNull()
  })
  test("nunca se la quita a una que la lleva", () => {
    expect(correctionFor("cómo", lexicon({ cómo: 20_000_000, como: 340_000_000 }), none)).toBeNull()
  })
})

describe("las preguntas", () => {
  const lex = lexicon({ que: 1e9, qué: 4e7, como: 3.4e8, cómo: 2e7, donde: 5e7, dónde: 1e7 })
  test("la que abre una pregunta o una exclamación lleva tilde, aunque sea corta", () => {
    expect(correctionFor("Que", lex, none, { prefix: "¿" })?.to).toBe("Qué")
    expect(correctionFor("como", lex, none, { prefix: "¡" })?.to).toBe("cómo")
  })
  test("también detrás de una preposición", () => {
    expect(correctionFor("que", lex, none, { previous: "¿Por" })?.to).toBe("qué")
    expect(correctionFor("donde", lex, none, { previous: "¿de" })?.to).toBe("dónde")
  })
  test("una que has dejado dos veces, tampoco en una pregunta", () => {
    expect(correctionFor("Que", lex, new Set(["que"]), { prefix: "¿" })).toBeNull()
  })
  test("dentro de la pregunta, no: «para que» no la lleva", () => {
    expect(correctionFor("que", lex, none, { previous: "para" })).toBeNull()
    expect(correctionFor("Que", lex, none)).toBeNull()
  })
})

describe("el vocabulario", () => {
  test("las palabras sueltas de sus términos, en minúsculas", () => {
    expect(vocabularyWords(["Palabra en gris", "use-dom", "QVO"])).toEqual(new Set(["palabra", "en", "gris", "use", "dom", "qvo"]))
  })
})

describe("qué no se toca", () => {
  const near = (term: string, count = 1_000_000, distance = 1) => [{ term, distance, count }]

  test("las de menos de cuatro letras", () => {
    expect(correctionFor("qeu", lexicon({ que: 1e9 }, { qeu: near("que") }), none)).toBeNull()
  })
  test("lo que no es solo letras, o lleva mayúsculas por dentro (código, nombres)", () => {
    const lex = lexicon({ mover: 1e6 }, { "use-dom": near("usado"), joytap: near("joya"), screenmovie: near("screen") })
    expect(correctionFor("use-dom", lex, none)).toBeNull()
    expect(correctionFor("JoyTap", lex, none)).toBeNull()
    expect(correctionFor("ScreenMovie", lex, none)).toBeNull()
  })
  test("las del vocabulario, sin mayúsculas", () => {
    expect(correctionFor("Herdr", lexicon({}, { herdr: near("herir") }), new Set(["herdr"]))).toBeNull()
  })
  test("una con mayúscula que no existe: es un nombre", () => {
    expect(correctionFor("Inguru", lexicon({}, { inguru: near("ingenuo") }), none)).toBeNull()
  })
  test("pero si solo le falta la tilde, sí, con su mayúscula", () => {
    const lex = lexicon({ habría: 7_716_003 }, {}, { habria: ["habría"] })
    expect(correctionFor("Habria", lex, none)?.to).toBe("Habría")
  })
  test("lo que llega a dos letras de diferencia, aunque sea larga", () => {
    expect(correctionFor("carátula", lexicon({}, { carátula: near("cartuja", 95_041, 2) }), none)).toBeNull()
    expect(correctionFor("navegacoin", lexicon({}, { navegacoin: near("navegación", 1_816_046, 2) }), none)).toBeNull()
  })
  test("ninguna rara: la que pone tiene que ser corriente", () => {
    expect(correctionFor("rodrigos", lexicon({}, { rodrigos: near("rodrigo", 15_000) }), none)).toBeNull()
  })
  test("ninguna si dudaría entre dos parecidas casi igual de usadas", () => {
    const lex = lexicon({}, { cosa: [{ term: "casa", distance: 1, count: 1_000_000 }, { term: "cose", distance: 1, count: 600_000 }] })
    expect(correctionFor("coza", { ...lex, suggest: () => lex.suggest("cosa") }, none)).toBeNull()
  })
})
