//· index ·
// Lo que usa una app desde fuera del componente. El editor en sí es el
// componente DOM, que se importa de su subruta, `@yestoall/editor/dom-editor`.
// Aquí, los módulos puros y los tipos que la app necesita para montarlo
// (letras, colores, reescritura, vocabulario, el modelo de cita y sus tags, y
// los diccionarios y las palabras dejadas de la corrección en gris).

export * from "./ai-row"
export * from "./cita"
export * from "./css"
export * from "./fonts"
export { fixReadyLabel } from "./fix-ready"
export * from "./gray-files"
export { leftWords } from "./gray-left"
export * from "./link-urls"
export * from "./rewrite"
export * from "./skills"
export * from "./tag-suggestions"
export * from "./vocabulary"
