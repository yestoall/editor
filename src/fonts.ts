//· fonts ·
// La letra del editor: la fuente y el peso con que se escribe. Ninguna va en
// el bundle: se piden por URL al usarlas, y no engordan la app. Las de Google
// Fonts, de Google; las iA Writer y Paper Mono (OFL), de la web que la app
// indique (origin), que las sirve en /fonts. Paper Mono es variable:
// en la web, un fichero con todos los pesos; en el iPhone, uno por peso. SF Mono la pone el sistema (su licencia no
// deja incrustarla), y en la web, donde no existe, va Geist Mono, que carga la
// app. Las comparten las pantallas (para elegir y pintar) y el DOM
// component del editor, así que aquí no entra react-native.

export type FontKey =
  | "sf-mono"
  | "geist-mono"
  | "jetbrains-mono"
  | "ibm-plex-mono"
  | "fira-code"
  | "dm-mono"
  | "space-mono"
  | "martian-mono"
  | "mono"
  | "duo"
  | "quattro"
  | "paper-mono"

// de cien en cien, del 100 al 800: los de una letra variable. Las demás tienen
// los tres de siempre, regular, medio y seminegrita
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800
export const ALL_WEIGHTS: FontWeight[] = [100, 200, 300, 400, 500, 600, 700, 800]
export const FONT_WEIGHTS: FontWeight[] = [400, 500, 600]
export const DEFAULT_WEIGHT: FontWeight = 400

// Los interruptores de una letra (OpenType), que se encienden o se apagan:
// juegos de estilo, una variante de carácter, el cero con barra
export type FontFeature = "ss01" | "ss02" | "ss03" | "ss04" | "cv01" | "zero"

export type FontPlatform = "web" | "native"

export type Font = {
  key: FontKey
  label: string
  family: string // el nombre en CSS y en Google Fonts
  source: "system" | "google" | "ia" | "variable"
  weights: FontWeight[] // los que tiene de verdad: no se finge ninguno
  file?: string // las iA y las variables: su fichero, en /fonts de origin
  weightFiles?: Partial<Record<FontWeight, string>> // las variables, en el iPhone: uno por peso
  features?: FontFeature[] // los interruptores que tiene, en su orden
}

// La de serie: en el iPhone y en Safari, SF Mono (ui-monospace); en la web,
// Geist Mono, cargada aparte y con todos los pesos (variable)
const SYSTEM: Font = {
  key: "sf-mono",
  label: "SF Mono",
  family: '"Geist Mono Variable",ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace',
  source: "system",
  weights: FONT_WEIGHTS,
}

const google = (key: FontKey, family: string, weights: FontWeight[] = FONT_WEIGHTS): Font => ({
  key,
  label: family,
  family,
  source: "google",
  weights,
})

// Las S, la versión de las iA con licencia OFL. Solo regular: la negrita no
// es ninguno de los tres pesos
const ia = (key: FontKey, name: string): Font => ({
  key,
  label: `iA ${name}`,
  family: `iA Writer ${name}`,
  source: "ia",
  weights: [400],
  file: `iAWriter${name}S-Regular.ttf`,
})

// Paper Mono (paper.design/mono, OFL), variable del 100 al 800. En la web, el
// fichero variable; React Native no sabe moverse por el eje de peso, así que
// en el iPhone va un fichero por peso
const PAPER_WEIGHT_NAMES: Record<FontWeight, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
}

const PAPER: Font = {
  key: "paper-mono",
  label: "Paper Mono",
  family: "Paper Mono",
  source: "variable",
  weights: ALL_WEIGHTS,
  file: "PaperMono-Variable.woff2",
  weightFiles: Object.fromEntries(ALL_WEIGHTS.map((weight) => [weight, `PaperMono-${PAPER_WEIGHT_NAMES[weight]}.ttf`])),
  features: ["ss01", "ss02", "ss03", "ss04", "cv01", "zero"],
}

export const isVariable = (font: Font) => font.source === "variable"

// Geist Mono va aparte solo en el iPhone: en la web ya es la de serie
const GEIST: Font = google("geist-mono", "Geist Mono")

const OTHERS: Font[] = [
  google("jetbrains-mono", "JetBrains Mono"),
  google("ibm-plex-mono", "IBM Plex Mono"),
  google("fira-code", "Fira Code"),
  google("dm-mono", "DM Mono", [400, 500]),
  google("space-mono", "Space Mono", [400]),
  google("martian-mono", "Martian Mono"),
  ia("mono", "Mono"),
  ia("duo", "Duo"),
  ia("quattro", "Quattro"),
  PAPER,
]

export const fontsFor = (platform: FontPlatform): Font[] =>
  platform === "web" ? [{ ...SYSTEM, label: "Geist Mono" }, ...OTHERS] : [SYSTEM, GEIST, ...OTHERS]

const ALL: Font[] = [SYSTEM, GEIST, ...OTHERS]
export const fontByKey = (key: FontKey) => ALL.find((font) => font.key === key)!

export const DEFAULT_FONT: FontKey = "sf-mono"

// Una guardada que ya no está, o que no es de este sitio, pasa a la de serie
export const isFontKey = (value: unknown, platform: FontPlatform): value is FontKey =>
  fontsFor(platform).some((font) => font.key === value)

export const isFontWeight = (value: unknown): value is FontWeight => ALL_WEIGHTS.includes(value as FontWeight)

// El peso que tiene la fuente, o el más cercano (a igual distancia, el fino)
export const closestWeight = (font: Font, weight: FontWeight): FontWeight =>
  font.weights.reduce((best, candidate) =>
    Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best,
  )

export const closestWeightOf = (key: FontKey, weight: FontWeight) => closestWeight(fontByKey(key), weight)

// Mientras no llega (la primera vez, sin red), la del sistema
const FALLBACK = 'ui-monospace,"SF Mono",Menlo,monospace'

// El valor de font-family en el CSS
export const fontFamily = (key: FontKey) => {
  const font = fontByKey(key)
  return font.source === "system" ? font.family : `"${font.family}",${FALLBACK}`
}

// display=swap: mientras llega, se escribe con la de detrás, nunca en blanco
export const googleCssUrl = (font: Font, weights: FontWeight[] = font.weights) =>
  `https://fonts.googleapis.com/css2?family=${font.family.replaceAll(" ", "+")}:wght@${weights.join(";")}&display=swap`

// El fichero de una iA, o el de un peso de una variable en el iPhone
export const fontFileUrl = (font: Font, weight: FontWeight, origin: string) =>
  `${origin}/fonts/${(isVariable(font) ? font.weightFiles?.[weight] : undefined) ?? font.file}`

// El CSS que hace llegar una fuente, con todos sus pesos. origin: la web que
// sirve los ficheros ("" si es la propia web; su URL, en el webview del iPhone)
export const fontCss = (key: FontKey, origin: string) => {
  const font = fontByKey(key)
  if (font.source === "google") return `@import url("${googleCssUrl(font)}");`
  if (font.source === "ia")
    return `@font-face{font-family:"${font.family}";font-weight:400;src:url("${origin}/fonts/${font.file}") format("truetype");font-display:swap}`
  if (font.source === "variable") {
    const range = `${font.weights[0]} ${font.weights.at(-1)}`
    return `@font-face{font-family:"${font.family}";font-weight:${range};src:url("${origin}/fonts/${font.file}") format("woff2");font-display:swap}`
  }
  return ""
}

// A quien no es un navegador (el iPhone, para expo-font), Google le da un TTF
// por peso en lugar de los woff2 por alfabeto
export const ttfUrls = (css: string): Partial<Record<FontWeight, string>> => {
  const urls: Partial<Record<FontWeight, string>> = {}
  for (const block of css.split("@font-face").slice(1)) {
    const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1])
    const url = block.match(/src:\s*url\(([^)]+\.ttf)\)/)?.[1]
    if (isFontWeight(weight) && url) urls[weight] = url
  }
  return urls
}

// Los interruptores encendidos que tiene la letra, como font-feature-settings
// de CSS (el editor, y lo que la app pinte con la misma letra); sin ninguno, normal
export const fontFeatureSettings = (key: FontKey, features: FontFeature[]) => {
  const own = fontByKey(key).features ?? []
  const on = own.filter((feature) => features.includes(feature))
  return on.length ? on.map((feature) => `"${feature}" 1`).join(", ") : "normal"
}

// WebKit (Safari, la app de Mac y el editor del iPhone) no sabe de los
// espacios estrechos (SS03): corta las líneas como si lo fueran, pero los
// pinta anchos, y el texto se sale del margen; además mide corta la última
// letra de cada línea, y el cursor de bloque se quedaba atrás. Ahí no se
// encienden; en Chromium, sí
export const isWebKit = (userAgent: string) =>
  /AppleWebKit/.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/.test(userAgent)

export const featuresForEngine = (features: FontFeature[], userAgent: string) =>
  isWebKit(userAgent) ? features.filter((feature) => feature !== "ss03") : features

// Fuera del webview, en React Native, solo hay juegos de estilo
// (fontVariant): la «a» de un piso y el cero con barra no llegan
const NATIVE_VARIANTS: Partial<Record<FontFeature, "stylistic-one" | "stylistic-two" | "stylistic-three" | "stylistic-four">> = {
  ss01: "stylistic-one",
  ss02: "stylistic-two",
  ss03: "stylistic-three",
  ss04: "stylistic-four",
}

export const nativeFontVariant = (key: FontKey, features: FontFeature[]) =>
  (fontByKey(key).features ?? [])
    .filter((feature) => features.includes(feature))
    .flatMap((feature) => NATIVE_VARIANTS[feature] ?? [])

// Tamaño de letra en px: el zoom cambia esto, no escala la página
export const FONT_SIZE = { min: 10, max: 34, initial: 19 } as const

export const clampFontSize = (size: number) => Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size)))
