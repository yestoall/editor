# @yestoall/editor

Un editor de texto plano para apps de Expo, hecho con CodeMirror 6 dentro de
un componente DOM: el mismo editor en el iPhone (en un WKWebView), en la web y
en el Mac. Resalta los `#tags`, las `/skills` y las URLs, sigue las listas y
los pares de comillas, propone palabras en gris en la web y trae una barra
sobre el teclado del iPhone.

## Instalación

```bash
bun add github:yestoall/editor
```

Se instala el fuente en TypeScript y Metro lo transpila: no hay paso de build.
El lock lo fija a un commit, así que un cambio en el editor llega a tu app
cuando vuelves a fijarlo (`bun add github:yestoall/editor` otra vez).

Necesitas en la app `react`, `react-dom` (en la misma versión que `react`) y
`expo` con componentes DOM. En iOS, el webview es el de
`react-native-webview`: pasa `dom={{ useExpoDOMWebView: false }}`.

## Uso

El editor se importa de su subruta y lo monta un componente tuyo, que le pasa
los colores, la letra y el vocabulario de tu app:

```tsx
import DomEditor from "@yestoall/editor/dom-editor"
import { parseCita, matchVocabulary, fontsFor } from "@yestoall/editor"
```

Lo demás (letras, CSS, modelo de cita, vocabulario, skills, URLs) son módulos
puros, sin React Native, que puedes usar también fuera del editor.

## Tests

```bash
bun install
bun run check
```

## Licencia

MIT
