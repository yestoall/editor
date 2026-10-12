//· link-urls ·
// Las URLs del texto, que se abren como botones: en el Mac y la web, con un
// clic; en el iPhone, al tocarlas. Por ejemplo, la de un vídeo con su minuto.
// La puntuación de detrás y un paréntesis que no abrió la URL son de la
// frase, no de la URL.

// Una URL acaba en el primer espacio o comilla
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi
const TRAILING_PUNCTUATION = /[.,;:!?¡¿…»"']+$/

const count = (text: string, char: string) => text.split(char).length - 1

// Lo que de verdad es URL en lo que casó con el patrón
const trimUrl = (url: string): string => {
  let trimmed = url.replace(TRAILING_PUNCTUATION, "")
  for (const [open, close] of [["(", ")"], ["[", "]"]]) {
    while (trimmed.endsWith(close) && count(trimmed, close) > count(trimmed, open)) {
      trimmed = trimmed.slice(0, -1).replace(TRAILING_PUNCTUATION, "")
    }
  }
  return trimmed
}

export type UrlRange = { from: number; to: number; url: string }

export const urlRanges = (text: string): UrlRange[] =>
  [...text.matchAll(URL_PATTERN)].map((match) => {
    const url = trimUrl(match[0])
    return { from: match.index, to: match.index + url.length, url }
  })

//- abrir una con el ratón -
// En el Mac y la web, un clic en una URL la abre, como un botón. No la abre
// si el clic hace otra cosa: ⌥ pone el cursor para editarla, ⇧ estira la
// selección, y arrastrar selecciona (al soltar, la selección no está vacía).
// ⌘ y clic la abría antes: se sigue abriendo, al pulsar (el editor no llega a
// poner el cursor)
export type UrlClick = {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  selectionEmpty: boolean // tras el clic: arrastrar deja algo seleccionado
}

export const opensOnPress = ({ metaKey, ctrlKey }: Pick<UrlClick, "metaKey" | "ctrlKey">) => metaKey || ctrlKey

export const opensOnClick = (click: UrlClick) =>
  !opensOnPress(click) && !click.altKey && !click.shiftKey && click.selectionEmpty
