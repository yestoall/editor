//· tag-suggestions ·
// Los #tags que sugiere la barra del teclado del iPhone al escribir una cita:
// qué tag se está escribiendo según el cursor, cuáles del vocabulario casan y
// cómo se completa. Sin CodeMirror: el texto y la posición del cursor. En la
// web y el Mac lo hace el desplegable (tagCompletions, en completions).

import { fold, matchVocabulary, type VocabularyEntry } from "./cita"

// el #tag a medio escribir: de la # al final de la palabra, y lo escrito hasta
// el cursor
export type TagInProgress = { from: number; to: number; query: string }

// la # abre un tag al principio, tras un espacio o tras lo que abre, como en
// parseCita y tagCompletions; pegada a una palabra («C#») es texto
const BEFORE_CURSOR = /(?<=^|[\s(«"“'¿¡])#([\p{L}\p{N}_.-]*)$/u
const REST_OF_WORD = /^[\p{L}\p{N}_.-]*/u

export const tagAt = (text: string, cursor: number): TagInProgress | null => {
  const match = text.slice(0, cursor).match(BEFORE_CURSOR)
  if (!match || match.index === undefined) return null
  const rest = text.slice(cursor).match(REST_OF_WORD)?.[0] ?? ""
  return { from: match.index, to: cursor + rest.length, query: match[1] }
}

// el tag que se escribe y los que casan, sin tildes ni mayúsculas: primero los
// que empiezan igual y, dentro, los más usados. El que ya está escrito tal
// cual no sale. null si no hay nada que sugerir
export const suggestTags = (text: string, cursor: number, tags: VocabularyEntry[], limit = 30) => {
  const tag = tagAt(text, cursor)
  if (!tag) return null
  const options = matchVocabulary(tag.query, tags, limit).filter((entry) => fold(entry.name) !== fold(tag.query))
  return options.length ? { tag, options } : null
}

// el cambio que completa el tag: el nombre entero con «_» por espacio, y un
// espacio detrás para seguir escribiendo (si ya lo hay, el cursor lo salta)
export const completeTag = (text: string, tag: TagInProgress, name: string) => {
  const spaceAfter = /^\s/.test(text.slice(tag.to))
  const insert = `#${name.replaceAll(" ", "_")}${spaceAfter ? "" : " "}`
  return { from: tag.from, to: tag.to, insert, cursor: tag.from + insert.length + (spaceAfter ? 1 : 0) }
}
