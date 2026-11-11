//· note-format ·
// La regla del formato de una nota del Timeline (ADR 0020 de ideas): la
// negrita, la cursiva y los enlaces en el texto, escritos con signos.

import { urlRanges } from "./link-urls"

export type FormatKind = "bold" | "italic" | "link"

// Un trozo con formato: lo que abarca con sus signos, el texto que se lee y
// dónde van los signos (en un enlace, «[» y «](url)»)
export type FormatSpan = {
  kind: FormatKind
  from: number
  to: number
  content: [number, number]
  signs: [number, number][]
  url?: string
}

// cada forma de escribir un trozo, con cuántos signos abre y cierra. Las de _,
// ni dentro de una palabra, también con tildes (\p{L}); la URL de un enlace en
// el texto admite un nivel de paréntesis (las de la Wikipedia)
const PATTERNS: { kind: FormatKind; re: RegExp; open: number; close: (m: RegExpMatchArray) => number }[] = [
  {
    kind: "link",
    re: /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/gu,
    open: 1,
    close: (m) => m[2].length + 3,
  },
  { kind: "bold", re: /\*\*(?=\S)([^\n]*?\S)\*\*/gu, open: 2, close: () => 2 },
  { kind: "bold", re: /(?<![\p{L}\p{N}_])__(?=\S)([^\n]*?\S)__(?![\p{L}\p{N}_])/gu, open: 2, close: () => 2 },
  { kind: "italic", re: /(?<![*\p{L}\p{N}_])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/gu, open: 1, close: () => 1 },
  { kind: "italic", re: /(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/gu, open: 1, close: () => 1 },
]

// Lo que ya ocupa el texto al ir eligiendo trozos: los elegidos y las URLs
// sueltas, que no tienen texto con formato dentro
type Taken = { from: number; to: number; content?: [number, number] }

// Dos trozos casan si no se tocan o si uno cabe entero en el texto del otro:
// los signos de uno no pueden caer en los del otro ni en una URL
const inside = (a: Taken, b: Taken) => !!b.content && a.from >= b.content[0] && a.to <= b.content[1]
const fits = (a: Taken, b: Taken) => a.to <= b.from || a.from >= b.to || inside(a, b) || inside(b, a)
const fitsAll = (a: Taken, taken: Taken[]) => taken.every((t) => fits(a, t))

const candidates = (text: string): FormatSpan[] =>
  PATTERNS.flatMap(({ kind, re, open, close }) =>
    [...text.matchAll(re)].map((m): FormatSpan => {
      const from = m.index
      const to = from + m[0].length
      const end = to - close(m)
      return {
        kind,
        from,
        to,
        content: [from + open, end],
        signs: [
          [from, from + open],
          [end, to],
        ],
        ...(kind === "link" ? { url: m[2] } : {}),
      }
    }),
  )

// Los trozos con formato de un texto, por orden. Mandan primero los enlaces,
// luego las URLs sueltas (que solo apartan), las negritas y las cursivas: uno
// que no casa con los de antes se queda como texto
export const formatSpans = (text: string): FormatSpan[] => {
  const all = candidates(text)
  const links = all.filter((s) => s.kind === "link")
  const taken: Taken[] = [...links]
  // las URLs sueltas, las mismas que el editor enseña como botones (link-urls)
  for (const { from, to } of urlRanges(text)) if (fitsAll({ from, to }, taken)) taken.push({ from, to })
  const spans = [...links]
  for (const span of all.filter((s) => s.kind !== "link")) {
    if (fitsAll(span, taken)) {
      taken.push(span)
      spans.push(span)
    }
  }
  return spans.sort((a, b) => a.from - b.from)
}

// El texto con cada signo cambiado por lo que diga `replace` (el signo, su
// trozo y si es el que cierra)
const rewrite = (text: string, replace: (span: FormatSpan, closing: boolean) => string) => {
  const signs = formatSpans(text)
    .flatMap((span) => span.signs.map(([from, to], i) => ({ from, to, span, closing: i === 1 })))
    .sort((a, b) => a.from - b.from)
  let out = ""
  let at = 0
  for (const { from, to, span, closing } of signs) {
    out += text.slice(at, from) + replace(span, closing)
    at = to
  }
  return out + text.slice(at)
}

// Sin signos, y cada enlace en el texto, solo su texto: para las
// descripciones, el JSON-LD y la imagen para redes
export const plainText = (text: string) => rewrite(text, () => "")

// Como va al post de X y Bluesky: sin signos, y cada enlace en el texto como
// «texto (url)», con la URL entera. Es lo que cuenta el tope de 250
export const postText = (text: string) =>
  rewrite(text, (span, closing) => (span.kind === "link" && closing ? ` (${span.url})` : ""))
