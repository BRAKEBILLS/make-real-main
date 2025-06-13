// OCR Pixel → tldraw Page Mapping Utilities
// Author: AI assistant (2025-06-12)
//
// 该模块实现了按照 "像素 → 屏幕 → page" 链路的权威坐标转换，
// 并提供常用的验证辅助函数（联合 bbox 覆盖、RMSE、IoU）。

import { Editor } from 'tldraw'

/********************
 * 数据结构
 *******************/
export interface OcrPixelBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  [key: string]: any
}

export interface DomImageData {
  rect: { x: number; y: number; width: number; height: number }
  naturalWidth: number
  naturalHeight: number
}

export interface PageBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/********************
 * 核心转换函数
 *******************/

/**
 * 将 OCR 像素框映射到 tldraw page 坐标系。
 * 算法分三步：像素 → 屏幕 → page。
 */
export function pixelBoxToPageBox(
  box: any,
  img: DomImageData,
  editor: Editor
): PageBox {
  const bx = Number.isFinite(box.x) ? box.x : box.bbox?.x
  const by = Number.isFinite(box.y) ? box.y : box.bbox?.y
  const bw = Number.isFinite(box.w) ? box.w : box.bbox?.w
  const bh = Number.isFinite(box.h) ? box.h : box.bbox?.h

  if (!Number.isFinite(bx) || !Number.isFinite(by)) {
    return { id: box.id ?? 'unknown', x: NaN, y: NaN, w: NaN, h: NaN }
  }

  // 1. 计算缩放比例
  const scaleX = img.rect.width / img.naturalWidth
  const scaleY = img.rect.height / img.naturalHeight
  
  // 2. 图片的 rect 坐标已经是 page 坐标！
  // 直接在 page 空间中计算 OCR 框的位置
  const pageX1 = img.rect.x + bx * scaleX
  const pageY1 = img.rect.y + by * scaleY
  const pageX2 = img.rect.x + (bx + bw) * scaleX
  const pageY2 = img.rect.y + (by + bh) * scaleY

  // 开发模式下打印链路，便于校验
  if (
    process.env.NODE_ENV === 'development' &&
    ['c001','c002','c003'].includes(box.id)
  ) {
    console.table({ 
      id: box.id, 
      scaleX, 
      scaleY, 
      imgPageX: img.rect.x,
      imgPageY: img.rect.y,
      ocrPixelX: bx,
      ocrPixelY: by,
      pageX: pageX1,
      pageY: pageY1,
      pageW: pageX2 - pageX1,
      pageH: pageY2 - pageY1
    })
    
    // 如果是第一个字符，打印偏移分析
    if (box.id === 'c001') {
      console.log('🔍 偏移分析:')
      console.log(`图片位置: (${img.rect.x}, ${img.rect.y})`)
      console.log(`映射结果: (${pageX1}, ${pageY1})`)
      console.log(`需要的偏移: 大约 (${741 - pageX1}, ${-29 - pageY1}) 才能到达选区`)
    }
  }

  return {
    id: box.id,
    x: pageX1,
    y: pageY1,
    w: pageX2 - pageX1,
    h: pageY2 - pageY1,
  }
}

/** 批量转换 OCR 像素框 → page 框 */
export function mapOcrBoxesToPage(
  boxes: OcrPixelBox[],
  img: DomImageData,
  editor: Editor
): PageBox[] {
  return boxes.map(b => pixelBoxToPageBox(b, img, editor))
}

/********************
 * 校验 / 评估函数
 *******************/
export interface SelectionBounds {
  x: number
  y: number
  w: number
  h: number
  minX?: number
  minY?: number
  maxX?: number
  maxY?: number
}

export function calcUnionAndCoverage(
  pageBoxes: PageBox[],
  selection: SelectionBounds
) {
  const union = pageBoxes.reduce(
    (u, b) => ({
      minX: Math.min(u.minX, b.x),
      minY: Math.min(u.minY, b.y),
      maxX: Math.max(u.maxX, b.x + b.w),
      maxY: Math.max(u.maxY, b.y + b.h),
    }),
    {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    }
  )

  const covered =
    union.minX >= selection.x &&
    union.minY >= selection.y &&
    union.maxX <= selection.x + selection.w &&
    union.maxY <= selection.y + selection.h

  return { union, covered }
}

export function calcRmse(
  pageBoxes: PageBox[],
  groundBoxes: { x: number; y: number }[]
) {
  const n = Math.min(pageBoxes.length, groundBoxes.length)
  const sum = pageBoxes.slice(0, n).reduce((acc, b, i) => {
    const gx = groundBoxes[i].x
    const gy = groundBoxes[i].y
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    return acc + (cx - gx) ** 2 + (cy - gy) ** 2
  }, 0)
  return Math.sqrt(sum / (2 * n))
}

export function iou(boxA: PageBox, boxB: PageBox) {
  const interX1 = Math.max(boxA.x, boxB.x)
  const interY1 = Math.max(boxA.y, boxB.y)
  const interX2 = Math.min(boxA.x + boxA.w, boxB.x + boxB.w)
  const interY2 = Math.min(boxA.y + boxA.h, boxB.y + boxB.h)
  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1)
  if (!interArea) return 0
  const unionArea = boxA.w * boxA.h + boxB.w * boxB.h - interArea
  return interArea / unionArea
}
 