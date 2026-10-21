//· gray-left ·
// Las palabras que dejas en la corrección en gris (gray-correction): cada vez
// que sigues escribiendo sin poner la propuesta, una más; a la segunda, esa
// palabra ya no se propone en este dispositivo. Una sola vez puede ser un
// descuido. Se guardan en el localStorage y se leen cada vez, para que las
// ventanas de captura y de citas (otras páginas) vean lo que se calla u
// olvida en la grande. Sin almacenamiento, no se recuerda nada.

type WordStore = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

const TIMES_TO_SILENCE = 2
const KEY = "ideas-gray-left"

export function createLeftWords(storage: WordStore | null) {
  const read = (): Record<string, number> => {
    try {
      const value = JSON.parse(storage?.getItem(KEY) ?? "{}")
      return value && typeof value === "object" ? value : {}
    } catch {
      return {}
    }
  }
  const write = (left: Record<string, number>) => {
    try {
      storage?.setItem(KEY, JSON.stringify(left))
    } catch {}
  }
  const silenced = () =>
    new Set(
      Object.entries(read())
        .filter(([, times]) => times >= TIMES_TO_SILENCE)
        .map(([word]) => word),
    )
  return {
    leave: (word: string) => {
      const left = read()
      const lower = word.toLowerCase()
      write({ ...left, [lower]: (left[lower] ?? 0) + 1 })
    },
    silenced,
    count: () => silenced().size,
    // en Ajustes: vuelven a proponerse todas
    forget: () => write({}),
  }
}

// las del editor: el localStorage de la página
export const leftWords = createLeftWords(typeof localStorage === "undefined" ? null : localStorage)
