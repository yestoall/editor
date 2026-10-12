//· vocabulary ·
// Las palabras que el editor propone al escribir en la web y el Mac: las de
// los textos del proyecto, de la más usada a la menos. Sirven sobre todo los
// nombres que hay que escribir bien (IdeaCard, src/editor/pairs.ts,
// use-app-size) y los términos del proyecto. Las cortas no ahorran nada; las
// skills tienen su propia lista (skills) y las URL no se escriben a mano.

import { SKILL_PATTERN } from "./skills"

const MIN_LENGTH = 5
const URL = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi
// una palabra: letras y números, con puntos, guiones y barras por dentro
const WORD = /[\p{L}\p{N}_][\p{L}\p{N}_./-]*/gu

export function projectVocabulary(texts: string[], limit = 300): string[] {
  const uses = new Map<string, number>()
  for (const text of texts) {
    const plain = text.replace(URL, " ").replace(SKILL_PATTERN, "$1 ")
    for (const match of plain.matchAll(WORD)) {
      // sin el punto o el guion de detrás («la captura.»)
      const word = match[0].replace(/[./-]+$/, "")
      if (word.length >= MIN_LENGTH) uses.set(word, (uses.get(word) ?? 0) + 1)
    }
  }
  // en empate, la que salió antes (el orden del Map)
  return [...uses]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([word]) => word)
}

// Lo que sugiere el editor: primero el vocabulario del repo (docs/vocabulario.md,
// que sube /documenta), sin sus comillas invertidas, y detrás las palabras de
// las ideas; cada una, una vez
export function suggestionWords(terms: string[], ideaWords: string[]): string[] {
  const clean = terms.map((term) => term.replace(/`/g, "").trim()).filter(Boolean)
  return [...new Set([...clean, ...ideaWords])]
}

//- añadir un término desde el editor -
// Lo seleccionado, si puede ser un término: una línea, con alguna letra o
// número y sin los espacios, las comillas ni la puntuación de los bordes
// («la captura.» da «captura.» → «captura»). Si no, null
const TERM_MAX = 60
const EDGES = /^[\s"'`«»“”‘’¿¡([{.,;:!?…—–-]+|[\s"'`«»“”‘’.,;:!?…)\]}—–-]+$/gu

export function vocabularyCandidate(selection: string): string | null {
  const trimmed = selection.trim()
  if (!trimmed || /[\r\n]/.test(trimmed)) return null
  const term = trimmed.replace(EDGES, "")
  if (!term || term.length > TERM_MAX || !/[\p{L}\p{N}]/u.test(term)) return null
  return term
}

// El mismo término aunque cambien las mayúsculas o las comillas invertidas,
// como lo compara la API al añadirlo
export const termKey = (term: string) => term.replace(/`/g, "").trim().toLowerCase()

export const knowsTerm = (terms: string[], term: string) => terms.some((known) => termKey(known) === termKey(term))
