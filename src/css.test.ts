//· css tests ·
// La trama del fondo: papel milimetrado, un SVG en línea con el
// color del texto.

import { describe, expect, test } from "bun:test"

import { tramaImage } from "./css"

const svgOf = (image: string) => decodeURIComponent(image.slice('url("data:image/svg+xml,'.length, -'")'.length))

describe("tramaImage", () => {
  test("es un SVG en línea, válido como fondo de CSS", () => {
    const image = tramaImage("#e8e4dc")
    expect(image.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(image.endsWith('")')).toBe(true)
    expect(image.slice(5, -2)).not.toMatch(/["#<>\s]/) // nada sin escapar dentro de la URL
  })
  test("una baldosa de 70: cinco celdas de 14", () => {
    const svg = svgOf(tramaImage("#e8e4dc"))
    expect(svg).toContain('width="70" height="70"')
    expect(svg).toContain("M 14 0 V 70 M 0 14 H 70")
    expect(svg).toContain("M 56 0 V 70 M 0 56 H 70")
  })
  test("la línea mayor, en el color del texto al 10 %; las menores, finas y a la mitad", () => {
    const svg = svgOf(tramaImage("#e8e4dc"))
    expect(svg).toContain('d="M 70 0 L 0 0 0 70" fill="none" stroke="#e8e4dc" stroke-width="1" stroke-opacity="0.1"')
    expect(svg).toContain('stroke="#e8e4dc" stroke-width="0.5" stroke-opacity="0.05"')
  })
})
