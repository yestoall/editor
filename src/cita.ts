//· cita ·
// Una cita escrita en el editor, antes de guardarla: el texto con sus #tags,
// el autor y la fuente. Sin React ni red: lo que decide la pantalla que la
// escribe se prueba aquí.

export type CitaDraft = { text: string; author: string; source: string }

// Lo que se guarda en Citas
export type Cita = { content: string; author: string | null; source: string | null; tags: string[] }

// Por qué no se puede guardar: vacía (o solo tags), o pasa de un límite
export type CitaProblem = "empty" | "content" | "author" | "source" | "tags" | "tagLength"

export type ParsedCita = { ok: true; cita: Cita } | { ok: false; problems: CitaProblem[] }

// los mismos que exige el servidor que guarda las citas
export const CITA_LIMITS = { content: 500, author: 120, source: 200, tags: 12, tagLength: 40 } as const

// un #tag: letras, números, «_» (que vale espacio), y puntos y guiones por
// dentro («#web_2.0»); empieza y acaba en letra o número, así que la
// puntuación del final ya no es suya («#vida.»)
const WORD = "[\\p{L}\\p{N}](?:[\\p{L}\\p{N}_.-]*[\\p{L}\\p{N}])?"
// la # abre un tag al principio, tras un espacio o tras lo que abre; pegada a
// una palabra («C#sharp», «web#frag») es texto
const TAG = new RegExp(`(?<=^|[\\s(«"“'¿¡])#(${WORD})`, "gu")

// el mismo, para resaltarlos en el editor cuando escribe una cita
export const TAG_PATTERN = TAG

// las líneas del final hechas solo de #tags (y de espacios). En una línea
// con texto, el tag se queda como palabra aunque vaya al final: los que no
// son de la frase van en una línea aparte (decidido el 2026-10-05)
const TRAILING_TAGS = new RegExp(`(?:(?:^|\\n)[ \\t]*#${WORD}(?:[ \\t]+#${WORD})*[ \\t]*)+\\s*$`, "u")

// un tag repetido con otras mayúsculas cuenta una vez: la primera forma
const unique = (tags: string[]) => {
  const seen = new Map<string, string>()
  for (const tag of tags) if (!seen.has(tag.toLocaleLowerCase("es"))) seen.set(tag.toLocaleLowerCase("es"), tag)
  return [...seen.values()]
}

const spaced = (word: string) => word.replaceAll("_", " ")

// La forma ya guardada de un tag o un autor, sin distinguir mayúsculas (las
// tildes sí cuentan): si hay varias, la más usada; si no hay, la escrita
const storedForm = (name: string, entries: VocabularyEntry[]) => {
  const lower = name.toLocaleLowerCase("es")
  let best: VocabularyEntry | undefined
  for (const entry of entries)
    if (entry.name.toLocaleLowerCase("es") === lower && (!best || entry.count > best.count)) best = entry
  return best?.name ?? name
}

const EMPTY_VOCABULARY: CitasVocabulary = { tags: [], authors: [] }

export const parseCita = (
  { text, author, source }: CitaDraft,
  vocabulary: CitasVocabulary = EMPTY_VOCABULARY,
): ParsedCita => {
  const tags = unique([...text.matchAll(TAG)].map((match) => storedForm(spaced(match[1]), vocabulary.tags)))
  // fuera el bloque del final; en mitad de la frase, la palabra se queda
  const content = text
    .replace(TRAILING_TAGS, "")
    .replace(TAG, (_, word: string) => spaced(word))
    .trim()
  const cita = {
    content,
    author: author.trim() ? storedForm(author.trim(), vocabulary.authors) : null,
    source: source.trim() || null,
    tags,
  }

  if (!content) return { ok: false, problems: ["empty"] }
  const problems: CitaProblem[] = []
  if (content.length > CITA_LIMITS.content) problems.push("content")
  if ((cita.author?.length ?? 0) > CITA_LIMITS.author) problems.push("author")
  if ((cita.source?.length ?? 0) > CITA_LIMITS.source) problems.push("source")
  if (tags.length > CITA_LIMITS.tags) problems.push("tags")
  if (tags.some((tag) => tag.length > CITA_LIMITS.tagLength)) problems.push("tagLength")
  return problems.length ? { ok: false, problems } : { ok: true, cita }
}

//- el vocabulario de Citas: tags y autores con sus usos -

export type VocabularyEntry = { name: string; count: number }

export type CitasVocabulary = { tags: VocabularyEntry[]; authors: VocabularyEntry[] }

// para comparar: sin mayúsculas, sin tildes y con «_» como espacio
export const fold = (text: string) =>
  spaced(text)
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")

// Lo que casa con lo escrito, sin distinguir mayúsculas ni tildes: primero lo
// que empieza igual y, dentro, lo más usado (la lista ya llega así)
export const matchVocabulary = (query: string, entries: VocabularyEntry[], limit = 30) => {
  const wanted = fold(query)
  const starts: VocabularyEntry[] = []
  const contains: VocabularyEntry[] = []
  for (const entry of entries) {
    const name = fold(entry.name)
    if (name.startsWith(wanted)) starts.push(entry)
    else if (name.includes(wanted)) contains.push(entry)
  }
  return [...starts, ...contains].slice(0, limit)
}
