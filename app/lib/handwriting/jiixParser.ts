import { Editor } from 'tldraw'

export interface ParsedCharacter {
  id: string
  text: string
  bbox: { x: number; y: number; w: number; h: number }
  center: { x: number; y: number }
  confidence: number
  originalBbox: number[]
  wordId?: string
  shapeId?: string
}

/** 支持 camera 补偿的解析器 */
export function parseJIIX(
  jiix: any,
  shapeId: string,
  editor: Editor,
  cam?: { x: number; y: number; z: number },
): ParsedCharacter[] {
  const chars: ParsedCharacter[] = []
  let cid = 0

  jiix.words?.forEach((w: any, wi: number) =>
    w.glyphs?.forEach((g: any) => {
      if (!g['bounding-box']) return
      let [sx, sy, sw, sh] = g['bounding-box']
      if (cam) {
        sx = sx * cam.z + cam.x
        sy = sy * cam.z + cam.y
        sw = sw * cam.z
        sh = sh * cam.z
      }

      const tl = editor.screenToPage({ x: sx, y: sy })
      const br = editor.screenToPage({ x: sx + sw, y: sy + sh })

      chars.push({
        id: `c${String(++cid).padStart(3, '0')}`,
        text: g.label ?? '',
        bbox: {
          x: tl.x,
          y: tl.y,
          w: br.x - tl.x,
          h: br.y - tl.y,
        },
        center: {
          x: tl.x + (br.x - tl.x) / 2,
          y: tl.y + (br.y - tl.y) / 2,
        },
        confidence: g.confidence ?? 1,
        originalBbox: [sx, sy, sw, sh],
        wordId: w.id ?? `word-${wi}`,
        shapeId,
      })
    }),
  )

  return chars
} 