//· css ·
// El CSS del editor, dentro del webview. Tamaño, fuente y colores van en
// variables (--fs, --font, --bg, --fg…) para cambiarlos sin reconstruir
// CodeMirror. Los colores llegan como props desde la pantalla: en el iPhone el
// webview no ve las variables de CSS de la app.

// Los que usa el editor
export type EditorColors = {
  bg: string
  fg: string
  dim: string
  accent: string
  onAccent: string
  surface: string
  line: string
}

// La trama del fondo: papel milimetrado, celda
// de 14 px con línea mayor cada 5, la mayor al 10 % y las menores
// finas y a la mitad. En el color del texto y no en blanco, para que se vea
// también en fondos claros. Un SVG en línea: el webview no tiene
// react-native-svg.
const CELL = 14
const MAJOR = CELL * 5
// lo que mide una pieza de la trama, para repetirla fuera del editor
export const TRAMA_TILE = MAJOR
const TRAMA_OPACITY = 0.1
const MINOR_LINES = Array.from({ length: 4 }, (_, i) => (i + 1) * CELL)
  .map((p) => `M ${p} 0 V ${MAJOR} M 0 ${p} H ${MAJOR}`)
  .join(" ")
export const tramaImage = (fg: string) => {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAJOR}" height="${MAJOR}">`,
    `<path d="${MINOR_LINES}" fill="none" stroke="${fg}" stroke-width="0.5" stroke-opacity="${TRAMA_OPACITY / 2}"/>`,
    `<path d="M ${MAJOR} 0 L 0 0 0 ${MAJOR}" fill="none" stroke="${fg}" stroke-width="1" stroke-opacity="${TRAMA_OPACITY}"/>`,
    "</svg>",
  ].join("")
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export const colorVariables = (colors: EditorColors) => [
  ...Object.entries(colors).map(([name, value]) => [`--${name}`, value] as const),
  ["--trama", tramaImage(colors.fg)] as const,
]

import { DEFAULT_FONT, DEFAULT_WEIGHT, FONT_SIZE, fontFamily } from "./fonts"

// La fuente no va aquí: llega por URL (fonts.ts) en su propio
// <style>, que el editor cambia al cambiar la letra
export const EDITOR_CSS = [
  `:root{--fs:${FONT_SIZE.initial}px;--font:${fontFamily(DEFAULT_FONT)};--fw:${DEFAULT_WEIGHT};--ff:normal;--margin:22px;--margin-end:22px}`,
  `html,body,#root{margin:0;height:100%;background:var(--bg);overscroll-behavior:none;-webkit-text-size-adjust:100%}`,
  `body{-webkit-tap-highlight-color:transparent}`,
  // el #root de Expo es un flex en horizontal: sin ancho, el editor y la barra
  // de debajo medían lo que el texto escrito y crecían letra a letra
  `.idea-shell{display:flex;flex-direction:column;flex:1;width:100%;min-width:0;height:100%}`,
  `.idea-editor{flex:1;min-height:0;touch-action:pan-y}`,
  `.cm-editor{height:100%;background:var(--bg);font-size:var(--fs)}`,
  // la trama (tramaImage), en el fondo de .cm-editor, que no se desplaza: el
  // texto pasa por encima y ella se queda
  `.cm-editor{background-image:var(--trama);background-size:${MAJOR}px ${MAJOR}px}`,
  `.cm-editor.cm-focused{outline:none}`,
  // trampa del prototipo: el tema base fija font-family y line-height en
  // .cm-scroller con más especificidad que una regla suelta
  `.cm-editor .cm-scroller{font-family:var(--font),serif !important;font-weight:var(--fw);font-feature-settings:var(--ff);line-height:1.6 !important}`,
  // la misma trampa: el tema base fija el padding de .cm-content. A los lados,
  // --margin (izquierda) y --margin-end (derecha) menos los 6 que pone
  // CodeMirror a cada línea: así el texto queda donde el resto de la pantalla
  `.cm-editor .cm-content{padding:4px calc(var(--margin-end) - 6px) 25vh calc(var(--margin) - 6px) !important;caret-color:transparent}`,
  // con la escritura centrada (typewriter), media pantalla arriba y
  // abajo: sin ella, una idea corta cabía entera, no había nada que desplazar
  // y su primera línea no podía bajar al centro (ni la última subir)
  `.cm-editor.cm-typewriter .cm-content{padding-top:50vh !important;padding-bottom:50vh !important}`,
  // donde cae lo que se arrastra (dropCursor)
  `.cm-editor .cm-dropCursor{border-left:2px solid var(--accent)}`,
  // párrafo activo en el color principal; el resto, apagado. Sin foco, todo legible.
  `.cm-line{color:var(--dim);transition:color 140ms ease-out}`,
  // el texto de ejemplo de una idea vacía, apagado
  `.cm-editor .cm-placeholder{color:var(--dim);opacity:.6}`,
  // la palabra en gris detrás del cursor (word-ghost), como lo gris del editor vacío
  `.cm-word-ghost{color:var(--dim);opacity:.6}`,
  `.cm-line.cm-paragraph-active,.cm-editor:not(.cm-focused) .cm-line{color:var(--fg)}`,
  // las skills (/git), en acento también fuera del párrafo activo
  `.cm-line .cm-skill{color:var(--accent)}`,
  // las URLs, como botones (se abren con un clic, o al tocarlas en un enlace
  // del iPhone): en una pastilla, y con el ratón encima, en el acento. El
  // margen de la pastilla es una sombra, no padding: el padding movería el
  // texto, y el cursor de bloque y la selección se medirían mal. Seleccionada,
  // sin pastilla: taparía la selección, que va por detrás del texto
  `.cm-line .cm-url{background:color-mix(in srgb,var(--fg) 12%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--fg) 12%,transparent);border-radius:3px;-webkit-box-decoration-break:clone;box-decoration-break:clone;cursor:pointer;transition:background-color 120ms ease-out,box-shadow 120ms ease-out,color 120ms ease-out}`,
  `@media (hover:hover){.cm-line .cm-url:hover{background:var(--accent);box-shadow:0 0 0 3px var(--accent);color:var(--onAccent)}}`,
  `.cm-line .cm-url:has(.cm-selectedText),.cm-line .cm-selectedText .cm-url{background:transparent;box-shadow:none}`,
  // los fondos de serie se ocultan (los pinta la capa que se ciñe al texto); los
  // tiradores de iOS viven en la misma capa y se quedan
  `.cm-editor .cm-selectionLayer .cm-selectionBackground{display:none}`,
  // la selección, en el acento entero y con la letra en el color de encima
  // (selectedText, en selection.ts), también la de las skills
  `.cm-editor .cm-selectionBackground,.cm-editor.cm-focused .cm-selectionBackground{background:var(--accent) !important;border-radius:3px}`,
  `.cm-line .cm-selectedText,.cm-line .cm-selectedText .cm-skill,.cm-line .cm-skill .cm-selectedText{color:var(--onAccent)}`,
  `.cm-content ::selection{background:transparent}`,
  // tiradores de CodeMirror en iOS: por defecto van en currentColor, negro aquí
  `.cm-editor .cm-selectionHandle{background-color:var(--accent) !important;width:2px}`,
  `.cm-editor .cm-selectionHandle-start::before,.cm-editor .cm-selectionHandle-end::before{width:10px;height:10px;left:-4px}`,
  // cursor propio (blockCursor): bloque de acento con la letra de debajo en el
  // color del fondo, que se desliza y parpadea con fundido. El de serie, oculto.
  `.cm-editor .cm-cursorLayer{display:none}`,
  `.cm-blockCursorLayer{pointer-events:none}`,
  `.cm-editor:not(.cm-focused) .cm-blockCursorLayer{display:none}`,
  `.idea-editor:not(.is-still) .cm-editor.cm-focused .cm-blockCursorLayer{animation:idea-blink 1.1s ease-in-out infinite}`,
  // en reposo (10 s sin tocar nada), un pulso lento en vez del parpadeo
  `.idea-editor.is-idle:not(.is-still) .cm-editor.cm-focused .cm-blockCursorLayer{animation:idea-breathe 3.2s ease-in-out infinite}`,
  // con «Reducir movimiento», el cursor se queda quieto
  `@media (prefers-reduced-motion:reduce){.cm-blockCursorLayer{animation:none !important}}`,
  `.cm-blockCursor{position:absolute;min-width:1ch;background:var(--accent);color:var(--bg);border-radius:2px;white-space:pre;transition:left 90ms cubic-bezier(.2,.8,.3,1),top 90ms cubic-bezier(.2,.8,.3,1),width 90ms cubic-bezier(.2,.8,.3,1),height 90ms}`,
  `.idea-editor.is-typing .cm-blockCursor{transition:left 40ms linear,top 40ms linear,width 40ms linear}`,
  // barra sobre el teclado del iPhone
  `.keyboard-bar{display:flex;align-items:center;gap:2px;height:46px;padding:0 8px;background:var(--surface);border-top:1px solid var(--line);border-radius:var(--bar-radius,0) var(--bar-radius,0) 0 0;color:var(--fg);user-select:none;-webkit-user-select:none}`,
  `.keyboard-pad{flex:1;height:32px;border-radius:9px;background:var(--line);touch-action:none;transition:background 120ms}`,
  `.keyboard-pad.is-dragging{background:color-mix(in srgb,var(--accent) 20%,transparent)}`,
  `.keyboard-button{width:36px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;touch-action:none}`,
  `.keyboard-button:active{background:var(--line)}`,
  // «/» y las skills: las pastillas, con la fuente y el color de las skills en el texto
  `.keyboard-slash{font-size:20px;font-weight:600}`,
  `.keyboard-slash.is-open{color:var(--accent);background:var(--line)}`,
  // la fila de las skills, encima de la barra, del mismo fondo y con su raya
  `.keyboard-skills{display:flex;align-items:center;gap:6px;height:44px;padding:0 8px;background:var(--surface);border-top:1px solid var(--line);overflow-x:auto;touch-action:pan-x;scrollbar-width:none;user-select:none;-webkit-user-select:none}`,
  `.keyboard-skills::-webkit-scrollbar{display:none}`,
  `.keyboard-skill{flex:none;height:28px;padding:0 11px;border-radius:14px;display:flex;align-items:center;background:var(--line);color:var(--accent);font-family:var(--font),serif;font-size:13px;white-space:nowrap}`,
  // la fila del ✦: los modos en la condensada del sistema (la SF condensada,
  // del sistema), no en la de las skills
  `.keyboard-button.is-open{color:var(--accent);background:var(--line)}`,
  `.keyboard-mode{gap:6px;padding:0 16px;font-family:system-ui,-apple-system,sans-serif;font-stretch:condensed;font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;transition:opacity 120ms}`,
  `.keyboard-mode.is-off{opacity:.35}`,
  `.keyboard-beat{width:6px;height:6px;border-radius:3px;background:var(--accent);animation:idea-breathe 1.8s ease-in-out infinite}`,
  `.keyboard-ai-message{flex:1;min-width:0;color:var(--dim);font-size:13px;line-height:1.25;white-space:normal}`,
  // las sugerencias (completions), en la web: la letra de las ideas, la
  // superficie de la barra y la elegida en el acento
  // el panel de buscar y reemplazar (search), arriba: sobre la
  // superficie de la barra, con la letra de las ideas y los colores de la app
  `.cm-editor .cm-panels{background:var(--surface);color:var(--fg);border-color:var(--line)}`,
  `.cm-editor .cm-panel.cm-search{font-family:var(--font),serif;font-size:calc(var(--fs) * 0.8);padding:8px calc(var(--margin) - 6px)}`,
  `.cm-editor .cm-search .cm-textfield{background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font:inherit}`,
  `.cm-editor .cm-search .cm-textfield:focus{outline:none;border-color:var(--accent)}`,
  `.cm-editor .cm-search .cm-button{background:none;color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 10px;font:inherit;cursor:pointer}`,
  `.cm-editor .cm-search .cm-button:hover{background:var(--accent);border-color:var(--accent);color:var(--onAccent)}`,
  `.cm-editor .cm-search label{color:var(--dim)}`,
  `.cm-editor .cm-search input[type=checkbox]{accent-color:var(--accent)}`,
  `.cm-editor .cm-search button[name=close]{color:var(--dim);font-size:1.4em;cursor:pointer}`,
  // lo que casa, en el acento: suave, y la elegida, llena
  `.cm-editor .cm-searchMatch{background:color-mix(in srgb,var(--accent) 30%,transparent)}`,
  `.cm-editor .cm-searchMatch-selected{background:var(--accent);color:var(--onAccent)}`,
  `.cm-tooltip.cm-tooltip-autocomplete{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px;overflow:hidden}`,
  `.cm-tooltip-autocomplete>ul{font-family:var(--font),serif !important;font-size:calc(var(--fs) * 0.9);max-height:14em}`,
  `.cm-tooltip-autocomplete>ul>li{padding:6px 12px !important;border-radius:6px;color:var(--fg)}`,
  `.cm-tooltip-autocomplete>ul>li[aria-selected]{background:var(--accent) !important;color:var(--onAccent) !important}`,
  `.cm-tooltip-autocomplete .cm-completionLabel{white-space:nowrap}`,
  `.cm-completionMatchedText{text-decoration:none;font-weight:700}`,
  `@media (prefers-reduced-motion:reduce){.keyboard-beat{animation:none}}`,
  `@keyframes idea-blink{0%,30%{opacity:1}55%,80%{opacity:0}100%{opacity:1}}`,
  `@keyframes idea-breathe{0%,100%{opacity:1}50%{opacity:.2}}`,
].join("\n")
