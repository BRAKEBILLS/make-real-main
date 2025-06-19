import { Editor, TLDrawShape } from 'tldraw'
import simplify from 'simplify-js'

/** iink TStroke 类型定义 (基于官方文档) */
export interface TStroke {
  id: string
  pointerType: 'PEN' | 'TOUCH'
  x: number[]
  y: number[]
  t: number[]
  p: number[]
}

/** 将 tldraw DrawShape 转为 iink-TS 的 Stroke 数组 */
export function toStrokes(shape: TLDrawShape, editor: Editor): TStroke[] {
  const tf = editor.getShapePageTransform(shape)
  const strokes: TStroke[] = []

  shape.props.segments.forEach((seg, segId) => {
    const s: TStroke = {
      id: `${shape.id}-seg${segId}`,
      pointerType: 'PEN',
      x: [],
      y: [],
      t: [],
      p: [],
    }

    seg.points.forEach((pt, i) => {
      const page = tf.applyToPoint({ x: pt.x, y: pt.y })
      const scr = editor.pageToScreen(page)

      s.x.push(scr.x)
      s.y.push(scr.y)
      s.t.push(Date.now() + i * 10)
      s.p.push(Math.min(Math.max(pt.z ?? 0.5, 0.1), 1))
    })

    strokes.push(s)
  })

  return strokes
}

/** Douglas-Peucker 压缩（512 点阈值） */
export function compressStrokes(list: TStroke[]): TStroke[] {
  return list.map(stk => {
    if (stk.x.length <= 512) return stk

    const pts = stk.x.map((x, i) => ({
      x,
      y: stk.y[i],
      t: stk.t[i],
      p: stk.p[i],
    }))
    const simp = simplify(pts, 0.5, true)

    return {
      ...stk,
      x: simp.map(p => p.x),
      y: simp.map(p => p.y),
      t: simp.map(p => p.t),
      p: simp.map(p => p.p),
    }
  })
}

/** 打包为 Float32Array 方便传输 (虽然简化版不用Worker，但保持接口一致) */
export function strokesToF32(strokes: TStroke[]): Float32Array {
  const pts = strokes.reduce((n, s) => n + s.x.length, 0)
  const buf = new Float32Array(1 + strokes.length * 2 + pts * 4)
  let o = 0

  buf[o++] = strokes.length
  strokes.forEach(stk => {
    buf[o++] = stk.x.length
    for (let i = 0; i < stk.x.length; i++) {
      buf[o++] = stk.x[i]
      buf[o++] = stk.y[i]
      buf[o++] = stk.t[i]
      buf[o++] = stk.p[i]
    }
  })

  return buf
} 