//· gray-correction ·
// La corrección en gris: al terminar una palabra con un espacio, si está mal
// escrita, la que querías sale en gris detrás del cursor y Tab la pone (en la
// web y el Mac; en el iPhone corrige el teclado). Aquí, solo la decisión:
// qué palabra se propone y por cuál, sin DOM ni diccionarios, que llegan en
// un léxico (gray-lexicon). Probado sobre el texto de las ideas en el
// prototipo de ideas (rama prototype/autocorrector, ADR 0017 de ideas).

import { fold } from "./cita"

// Lo que el léxico sabe de las palabras, en minúsculas
export type Lexicon = {
  isWord(word: string): boolean // existe, en español o en inglés (la jerga)
  count(word: string): number // cuánto se usa en español; 0 si no está en la lista
  accented(folded: string): { term: string; count: number }[] // las que se escriben así sin tildes
  accentVariants(word: string): string[] // las que existen con una tilde (o la ñ) más
  suggest(word: string): { term: string; distance: number; count: number }[] // las parecidas, a una letra
}

// Lo que lleva delante la palabra: lo pegado («¿») y la palabra de antes
export type Around = { prefix?: string; previous?: string }

export type Correction = { to: string }

// Prudente: con las del prototipo, 21 de 22 erratas de las ideas y 3 palabras
// buenas propuestas (jerga y nombres en minúscula). Solo a una letra de
// diferencia (o tildes): las de dos no salían en las ideas, y prepararlas
// tardaba tres veces más al cargar
const MIN_LENGTH = 4 // las más cortas, nunca
const MIN_COUNT = 20_000 // la que se pone tiene que ser corriente (no «cartuja»)
const AMBIGUITY = 3 // si la segunda se usa más de un tercio de la primera, se duda
const ACCENT_RATIO = 8 // «circulo» → «círculo» si la de tilde se usa 8 veces más

const LETTERS = /^\p{L}+$/u
const INNER_UPPER = /^.+\p{Lu}/u

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Las que abren una pregunta o una exclamación llevan tilde: «¿Que» → «¿Qué»,
// también detrás de una preposición («¿Por que» → «¿Por qué»). Dentro de la
// pregunta no: «¿Hay manera… para que…» no la lleva
const INTERROGATIVES: Record<string, string> = {
  que: "qué",
  como: "cómo",
  cuando: "cuándo",
  donde: "dónde",
  adonde: "adónde",
  quien: "quién",
  quienes: "quiénes",
  cual: "cuál",
  cuales: "cuáles",
  cuanto: "cuánto",
  cuanta: "cuánta",
  cuantos: "cuántos",
  cuantas: "cuántas",
}
const PREPOSITION = /^(a|al|de|del|en|para|por|con|desde|hasta|hacia|sobre|sin|según)$/i
const OPENS_QUESTION = new RegExp(`^[¿¡]${PREPOSITION.source.slice(1)}`, "i")

export function questionAccent(word: string, { prefix = "", previous = "" }: Around): string | null {
  const accented = INTERROGATIVES[word.toLowerCase()]
  if (!accented) return null
  if (!/[¿¡]/.test(prefix) && !OPENS_QUESTION.test(previous)) return null
  return word === word.toLowerCase() ? accented : capitalize(accented)
}

// Al poner el «¿» o el «¡» (mark) delante de lo ya escrito (after): la tilde de
// la palabra de pregunta que lo abre, también detrás de una preposición
// («¿Por que no?»). Dónde va (desde el signo), cuánto ocupa y cómo queda
export function openingAccent(after: string, mark: string): { at: number; length: number; to: string } | null {
  const [first, second] = after.match(/^(\p{L}+)(\s+\p{L}+)?/u)?.slice(1) ?? []
  if (!first) return null
  const accented = questionAccent(first, { prefix: mark })
  if (accented) return { at: 0, length: first.length, to: accented }
  if (!second || !PREPOSITION.test(first)) return null
  const word = second.trimStart()
  const after2 = questionAccent(word, { previous: mark + first })
  return after2 ? { at: first.length + second.length - word.length, length: word.length, to: after2 } : null
}

// Las palabras sueltas de unos términos del vocabulario, en minúsculas: las
// que no se tocan. Una vez por lista
const vocabularyCache = new WeakMap<string[], Set<string>>()
export function vocabularyWords(terms: string[]): Set<string> {
  let words = vocabularyCache.get(terms)
  if (!words) {
    words = new Set(terms.flatMap((term) => term.toLowerCase().split(/[^\p{L}]+/u)).filter(Boolean))
    vocabularyCache.set(terms, words)
  }
  return words
}

// known: el vocabulario y las que has dejado, en minúsculas
export function correctionFor(word: string, lexicon: Lexicon, known: Set<string>, around: Around = {}): Correction | null {
  const lower = word.toLowerCase()
  if (known.has(lower)) return null
  const question = questionAccent(word, around)
  if (question) return { to: question }
  if (!LETTERS.test(word) || word.length < MIN_LENGTH || INNER_UPPER.test(word)) return null
  const capitalized = word !== lower
  const restore = (to: string) => (capitalized ? capitalize(to) : to)

  // existe, salvo que sin tildes la de tilde se use muchísimo más («circulo»);
  // si solo existe en inglés («extension»), basta con que sea corriente
  if (lexicon.isWord(lower)) {
    if (lower !== fold(lower)) return null
    const mine = lexicon.count(lower)
    const needed = mine ? mine * ACCENT_RATIO : MIN_COUNT
    const better = lexicon.accented(lower).find((v) => v.term !== lower && v.count >= needed)
    return better ? { to: restore(better.term) } : null
  }

  // solo le falta la tilde: siempre, también con mayúscula
  const withAccent = lexicon.accentVariants(lower)
  if (withAccent.length === 1) return { to: restore(withAccent[0]) }
  // con mayúscula y desconocida, un nombre
  if (capitalized) return null

  const suggestions = lexicon.suggest(lower)
  if (!suggestions.length) return null
  const distance = suggestions[0].distance
  if (distance > 1) return null
  const [top, second] = suggestions.filter((s) => s.distance === distance).sort((a, b) => b.count - a.count)
  if (top.count < MIN_COUNT) return null
  if (second && top.count < second.count * AMBIGUITY) return null
  return { to: top.term }
}
