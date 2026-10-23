//· fix-ready tests ·
// El ✦ encendido: cuántas palabras cambian entre dos textos, y el vigilante
// que, tras una pausa, mira en silencio si hay algo que corregir, con un
// reloj y un modelo de mentira.

import { describe, expect, test } from "bun:test"

import { createFixWatcher, FIX_PAUSE_MS, wordChanges } from "./fix-ready"
import type { RewriteMode, RewriteResult } from "./rewrite"

describe("wordChanges", () => {
  test("una tilde o una coma pegada cuentan como su palabra", () => {
    expect(wordChanges("mas tarde lo vemos", "más tarde, lo vemos")).toBe(2)
  })
})

// un reloj de mentira: lo programado corre solo al avanzarlo
const fakeClock = () => {
  let now = 0
  let timers: { at: number; run: () => void }[] = []
  return {
    schedule(run: () => void, ms: number) {
      const timer = { at: now + ms, run }
      timers.push(timer)
      return () => {
        timers = timers.filter((t) => t !== timer)
      }
    },
    advance(ms: number) {
      now += ms
      const due = timers.filter((t) => t.at <= now)
      timers = timers.filter((t) => t.at > now)
      for (const timer of due) timer.run()
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

// un modelo de mentira que corrige con fix y apunta qué le piden
const fakeModel = (fix: (text: string) => string, slow: boolean) => {
  const asked: string[] = []
  return {
    asked,
    rewrite: async (text: string, _mode: RewriteMode): Promise<RewriteResult> => {
      asked.push(text)
      // lento: contesta en la vuelta siguiente, cuando ya se ha escrito más
      if (slow) await settle()
      return { ok: true, text: fix(text) }
    },
  }
}

const watcherWith = (fix: (text: string) => string, { active = true, slow = false } = {}) => {
  const clock = fakeClock()
  const model = fakeModel(fix, slow)
  const lit: number[] = []
  const state = { active }
  const watcher = createFixWatcher({
    rewrite: model.rewrite,
    isActive: () => state.active,
    onChange: (words) => lit.push(words),
    schedule: clock.schedule,
  })
  // escribir el texto entero y esperar la pausa y la respuesta del modelo
  const pause = async () => {
    clock.advance(FIX_PAUSE_MS)
    await settle()
  }
  return { watcher, clock, model, lit, state, pause }
}

const EIGHT = "hoy quiero contar una idea que no esta mal"
const accents = (text: string) => text.replace("esta", "está")

describe("el ✦ encendido", () => {
  test("tras la pausa con 8 palabras nuevas, si el modelo cambia algo, se enciende con las que cambian", async () => {
    const { watcher, lit, pause } = watcherWith(accents)
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    expect(lit.at(-1)).toBe(1)
  })
  test("con menos de 8 palabras nuevas, ni mira", async () => {
    const { watcher, model, pause } = watcherWith(accents)
    watcher.loaded("")
    watcher.edited("una idea que esta mal")
    await pause()
    expect(model.asked).toEqual([])
  })

  test("lo que había al abrir la idea no cuenta como nuevo", async () => {
    const { watcher, model, pause } = watcherWith(accents)
    watcher.loaded(EIGHT)
    watcher.edited(EIGHT + " y algo")
    await pause()
    expect(model.asked).toEqual([])
  })

  test("si el modelo la devuelve igual, no se enciende", async () => {
    const { watcher, lit, model, pause } = watcherWith((text) => text)
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    expect(model.asked).toEqual([EIGHT])
    expect(lit).toEqual([])
  })

  test("al seguir escribiendo, se apaga", async () => {
    const { watcher, lit, pause } = watcherWith(accents)
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    watcher.edited(EIGHT + " y")
    expect(lit).toEqual([1, 0])
  })
  test("apagado por seguir escribiendo, la siguiente pausa vuelve a mirar sin esperar a las 8", async () => {
    const { watcher, lit, model, pause } = watcherWith(accents)
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    watcher.edited(EIGHT + " y")
    await pause()
    expect(model.asked).toEqual([EIGHT, EIGHT + " y"])
    expect(lit).toEqual([1, 0, 1])
  })
  test("si la idea cambia mientras el modelo piensa, lo que contesta se tira", async () => {
    const { watcher, lit, clock } = watcherWith(accents, { slow: true })
    watcher.loaded("")
    watcher.edited(EIGHT)
    clock.advance(FIX_PAUSE_MS) // pregunta, y el modelo aún no contesta
    watcher.edited(EIGHT + " y")
    await settle()
    expect(lit).toEqual([])
  })
  test("sin el foco en la idea, no mira", async () => {
    const { watcher, model, pause } = watcherWith(accents, { active: false })
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    expect(model.asked).toEqual([])
  })

  test("encendido, Corregir aplica lo ya calculado sin preguntar otra vez", async () => {
    const { watcher, model, pause } = watcherWith(accents)
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    expect(await watcher.rewrite(EIGHT, "fix")).toEqual({ ok: true, text: accents(EIGHT) })
    expect(model.asked).toEqual([EIGHT])
  })

  test("con otro texto (un trozo seleccionado) o con Aclarar, pregunta al modelo", async () => {
    const { watcher, model, pause } = watcherWith(accents)
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    await watcher.rewrite("no esta mal", "fix")
    await watcher.rewrite(EIGHT, "clarify")
    expect(model.asked).toEqual([EIGHT, "no esta mal", EIGHT])
  })

  test("tras Corregir o Aclarar, se apaga y no vuelve a mirar lo que ya entró", async () => {
    const { watcher, lit, model, pause } = watcherWith(accents)
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    watcher.rewritten(accents(EIGHT))
    await pause()
    expect(lit).toEqual([1, 0])
    expect(model.asked).toEqual([EIGHT])
  })
  test("apagado mientras el modelo piensa, no se enciende ni guarda lo suyo", async () => {
    const { watcher, lit, model, clock } = watcherWith(accents, { slow: true })
    watcher.loaded("")
    watcher.edited(EIGHT)
    clock.advance(FIX_PAUSE_MS)
    watcher.stop()
    await settle()
    expect(lit).toEqual([])
    await watcher.rewrite(EIGHT, "fix")
    expect(model.asked).toEqual([EIGHT, EIGHT])
  })

  test("un cambio solo de espacios no lo enciende", async () => {
    const { watcher, lit, pause } = watcherWith((text) => text.replace(" ", "  "))
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    expect(lit).toEqual([])
  })

  test("Corregir mientras la pausa pregunta espera esa misma respuesta, sin preguntar otra vez", async () => {
    const { watcher, model, clock } = watcherWith(accents, { slow: true })
    watcher.loaded("")
    watcher.edited(EIGHT)
    clock.advance(FIX_PAUSE_MS)
    expect(await watcher.rewrite(EIGHT, "fix")).toEqual({ ok: true, text: accents(EIGHT) })
    expect(model.asked).toEqual([EIGHT])
  })

  test("deshacer una corrección no la vuelve a ofrecer", async () => {
    const { watcher, model, pause } = watcherWith((text) => text.toUpperCase())
    watcher.loaded("")
    watcher.edited(EIGHT)
    await pause()
    watcher.rewritten(EIGHT.toUpperCase())
    watcher.edited(EIGHT) // ⌘Z
    await pause()
    expect(model.asked).toEqual([EIGHT])
  })

  test("el texto de la idea que llega tarde quita la pausa de lo escrito antes", async () => {
    const { watcher, model, pause } = watcherWith(accents)
    watcher.edited(EIGHT) // escrito antes de que llegue el de la idea
    watcher.loaded("otra idea")
    await pause()
    expect(model.asked).toEqual([])
  })
})
