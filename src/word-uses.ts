//· word-uses ·
// Dos cuentas de palabras para la palabra en gris (word-ghost): cuántas
// veces has aceptado cada una y cuántas la has escrito tú. En el propio
// dispositivo, en su localStorage: no gasta red, y lo que aprende un
// dispositivo se queda en él. Si no hay almacenamiento o falla (una ventana
// privada), cuenta en memoria.
//
// Con tope (limit), al pasarlo se van las que solo has escrito una vez, las
// más antiguas primero: casi todas las palabras distintas salen una vez y
// nunca más, y así no crece sin fin. Las demás no se tocan. El orden de las
// claves es el de su último cambio (cada cambio la pasa al final).

type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

export function createWordUses(storage: Storage | null, key = "ideas-word-uses", limit = Infinity) {
  let uses: Record<string, number> = {}
  try {
    uses = JSON.parse(storage?.getItem(key) ?? "{}") as Record<string, number>
  } catch {
    uses = {}
  }
  const change = (word: string, by: number) => {
    const next = (uses[word] ?? 0) + by
    const { [word]: _, ...rest } = uses
    uses = next > 0 ? { ...rest, [word]: next } : rest
    let extra = Object.keys(uses).length - limit
    if (extra > 0) {
      const kept: Record<string, number> = {}
      for (const [name, count] of Object.entries(uses))
        if (extra > 0 && count === 1 && name !== word) extra--
        else kept[name] = count
      uses = kept
    }
    try {
      storage?.setItem(key, JSON.stringify(uses))
    } catch {}
  }
  return {
    read: () => uses,
    record: (word: string) => change(word, 1),
    // una menos; a cero, fuera: se olvida
    forget: (word: string) => change(word, -1),
  }
}

// las del editor: el localStorage de la página (en el iPhone no hay sugerencias)
const pageStorage = typeof localStorage === "undefined" ? null : localStorage
export const wordUses = createWordUses(pageStorage)
// las que escribes, con tope: unos 40 KB como mucho
export const wordCounts = createWordUses(pageStorage, "ideas-word-counts", 2000)
