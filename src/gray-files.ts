//· gray-files ·
// Los ficheros de los diccionarios de la corrección en gris (gray-lexicon),
// con estos nombres, en la carpeta que la app sirve y pasa al editor. Aparte
// del léxico para que la app los conozca sin cargar sus librerías.

export const LEXICON_FILES = {
  wasm: "spellchecker-wasm.wasm", // SymSpell (spellchecker-wasm)
  spanish: "es-frecuencias.txt", // «palabra usos», una por línea (la de spellchecker-wasm)
  english: "en-palabras.txt", // una por línea, sin usos
  aff: "es.aff", // el Hunspell español (dictionary-es)
  dic: "es-dic.txt", // en .txt: Vercel sirve el .dic como código C y no lo comprime
} as const
