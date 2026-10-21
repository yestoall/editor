//· gray-lexicon ·
// El léxico de la corrección en gris (gray-correction), con tres diccionarios:
// SymSpell (spellchecker-wasm) con la lista de español por frecuencia, para
// proponer las parecidas; y para saber si una palabra existe, además el
// Hunspell español (nspell + dictionary-es), que tiene las formas que no
// están en la lista («librería», «tocándolo»), y una lista inglesa, para no
// tocar la jerga. Unos 2 MB comprimidos: no van en el editor, la app los sirve
// y se piden por URL al abrirlo (ADR 0017 de ideas).

import nspell from "nspell"
import { SpellcheckerWasm } from "spellchecker-wasm"

import { fold } from "./cita"
import type { Lexicon } from "./gray-correction"
import { LEXICON_FILES } from "./gray-files"


export type LexiconFiles = {
  wasm: BufferSource
  spanish: string
  english: string
  aff: string
  dic: string
}

// a una letra: a dos, SymSpell tardaba más del triple en prepararse (632 ms
// frente a 180, medido el 2026-10-21), y en las ideas no había erratas así
const MAX_DISTANCE = 1
// las tildes (y la ñ) que se prueban en cada letra
const ACCENTS: Record<string, string[]> = { a: ["á"], e: ["é"], i: ["í"], o: ["ó"], u: ["ú", "ü"], n: ["ñ"] }

export async function createLexicon(files: LexiconFiles): Promise<Lexicon> {
  const symspell = new SpellcheckerWasm()
  await symspell.prepareSpellchecker(
    new Response(files.wasm, { headers: { "content-type": "application/wasm" } }),
    new Response(files.spanish),
    undefined,
    { dictionaryEditDistance: MAX_DISTANCE, countThreshold: 1 },
  )
  const hunspell = nspell({ aff: files.aff, dic: files.dic })

  const counts = new Map<string, number>()
  const byFold = new Map<string, { term: string; count: number }[]>()
  for (const line of files.spanish.split("\n")) {
    const [term, uses] = line.trim().split(/\s+/)
    if (!term) continue
    const count = Number(uses)
    counts.set(term, count)
    const folded = fold(term)
    byFold.set(folded, [...(byFold.get(folded) ?? []), { term, count }])
  }
  for (const list of byFold.values()) list.sort((a, b) => b.count - a.count)
  const english = new Set(files.english.split("\n").map((word) => word.trim()))

  const exists = (word: string) => counts.has(word) || hunspell.correct(word)
  return {
    isWord: (word) => exists(word) || english.has(word),
    count: (word) => counts.get(word) ?? 0,
    accented: (folded) => byFold.get(folded) ?? [],
    accentVariants: (word) => {
      const found = new Set<string>()
      for (let i = 0; i < word.length; i++)
        for (const accent of ACCENTS[word[i]] ?? []) {
          const variant = word.slice(0, i) + accent + word.slice(i + 1)
          if (exists(variant)) found.add(variant)
        }
      return [...found]
    },
    suggest: (word) =>
      symspell
        .suggest(word, { maxEditDistance: MAX_DISTANCE, verbosity: 1, includeUnknown: false, includeSelf: false })
        .map((s) => ({ term: s.term, distance: s.distance, count: s.count })),
  }
}

// Los pide a la carpeta (la URL acaba en «/») una sola vez por página; si
// falla, el siguiente que lo pida lo vuelve a intentar
let loading: { base: string; lexicon: Promise<Lexicon> } | null = null

export function loadLexicon(base: string): Promise<Lexicon> {
  if (loading?.base === base) return loading.lexicon
  const get = (name: string) =>
    fetch(base + name).then((response) => {
      if (!response.ok) throw new Error(`${name}: ${response.status}`)
      return response
    })
  const text = (name: string) => get(name).then((response) => response.text())
  const lexicon = Promise.all([
    get(LEXICON_FILES.wasm).then((response) => response.arrayBuffer()),
    Promise.all([text(LEXICON_FILES.spanish), text(LEXICON_FILES.english), text(LEXICON_FILES.aff), text(LEXICON_FILES.dic)]),
  ]).then(([wasm, [spanish, english, aff, dic]]) => createLexicon({ wasm, spanish, english, aff, dic }))
  loading = { base, lexicon }
  lexicon.catch(() => {
    if (loading?.base === base) loading = null
  })
  return lexicon
}

// El léxico cuando la página esté quieta: montarlo para la página casi medio
// segundo (Hunspell y SymSpell), y así no cae al abrir el editor ni al
// escribir. Sin diccionarios no se propone nada: si fallan, onReady no llega
// y la próxima vez se vuelve a intentar. Devuelve con qué cancelarlo
export function lexiconWhenIdle(base: string, onReady: (lexicon: Lexicon) => void): () => void {
  let cancelled = false
  const load = () =>
    loadLexicon(base).then(
      (lexicon) => !cancelled && onReady(lexicon),
      () => {},
    )
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(load, { timeout: 5000 })
    return () => {
      cancelled = true
      cancelIdleCallback(id)
    }
  }
  const timer = setTimeout(load, 1000)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
