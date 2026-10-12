//· skills ·
// Una palabra con barra en el texto (/git, /ask-matt, /yestoall:idea) es una
// skill: la instrucción a un agente de cómo hacer lo que se pide. Aquí solo se
// encuentran, para resaltarlas en el editor. Sin react-native: lo usa el
// editor, dentro del webview.

// Delante, el principio o lo que abre; detrás, nada que siga la palabra: así
// una ruta (/src/lib), una URL o un fichero (/package.json) no cuentan. Sin
// lookbehind: el delante va en el primer grupo.
export const SKILL_PATTERN = /(^|[\s(«"“'¿¡])(\/[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)(?![\w/-]|\.\w)/g

export type TextPart = { text: string; skill: boolean }

export const splitSkills = (text: string): TextPart[] => {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(new RegExp(SKILL_PATTERN))) {
    const start = match.index + match[1].length
    if (start > last) parts.push({ text: text.slice(last, start), skill: false })
    parts.push({ text: match[2], skill: true })
    last = start + match[2].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), skill: false })
  return parts
}

// Las skills que más usa quien escribe, para la barra del teclado del iPhone:
// las cuenta en sus textos (los de origen "user"; los que escribió una IA, no),
// cada vez que aparecen; en empate, la usada más hace poco
export type SkillSource = { text: string; origin: string; updatedAt: number }

export const topSkills = (ideas: SkillSource[], limit = 6): string[] => {
  const uses = new Map<string, { count: number; last: number }>()
  for (const idea of ideas) {
    if (idea.origin !== "user") continue
    for (const part of splitSkills(idea.text)) {
      if (!part.skill) continue
      const use = uses.get(part.text) ?? { count: 0, last: 0 }
      use.count++
      use.last = Math.max(use.last, idea.updatedAt)
      uses.set(part.text, use)
    }
  }
  return [...uses]
    .sort(([, a], [, b]) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map(([skill]) => skill)
}
