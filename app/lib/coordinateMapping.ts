// OCR坐标到tldraw坐标映射库
// 解决OCR识别基于整个大画布，而tldraw选区只是画布一部分的坐标映射问题

export interface BoundingBox {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}







/**
 * 简化的局部坐标映射（用于OCR截图的情况）
 * 当OCR处理的是截取的图像时，OCR坐标是相对于截图左上角的局部坐标
 */
export function mapLocalOcrCoordinates<T extends BoundingBox | Point>(
  ocrCoord: T,
  selectionBounds: BoundingBox
): T {
  if ('w' in ocrCoord && 'h' in ocrCoord) {
    // BBox mapping
    return {
      x: selectionBounds.x + ocrCoord.x,  // 只需平移
      y: selectionBounds.y + ocrCoord.y,
      w: ocrCoord.w,                       // 等长
      h: ocrCoord.h
    } as T
  } else {
    // Point mapping
    return {
      x: selectionBounds.x + ocrCoord.x,
      y: selectionBounds.y + ocrCoord.y
    } as T
  }
}



/**
 * 🔧 临时修复：应用2倍缩放修正因子（解决Tesseract内部缩放问题）
 * 这是方案B：前端修正，直接将OCR坐标除以2
 */
export function applyScaleCorrectionToOCRCoordinates(
  ocrCoord: { x: number; y: number; w?: number; h?: number },
  correctionFactor: number = 2
): { x: number; y: number; w?: number; h?: number } {
  const result: any = {
    x: ocrCoord.x / correctionFactor,
    y: ocrCoord.y / correctionFactor,
  }
  
  if (ocrCoord.w !== undefined) {
    result.w = ocrCoord.w / correctionFactor
  }
  
  if (ocrCoord.h !== undefined) {
    result.h = ocrCoord.h / correctionFactor
  }
  
  return result
}

/**
 * 🎯 增强版局部坐标映射（包含自动缩放检测）
 * 检测OCR坐标是否被内部放大，并自动应用修正
 */
export function mapLocalOcrCoordinatesWithAutoCorrection(
  ocrCoord: { x: number; y: number; w?: number; h?: number },
  selectionBounds: { x: number; y: number; w: number; h: number },
  imageSize: { width: number; height: number },
  detectedInternalScaleFactor?: number // 🔧 新增：来自OCR结果的检测到的内部缩放因子
): { x: number; y: number; w?: number; h?: number } {
  // 自动检测是否需要缩放修正
  let correctedOcrCoord = ocrCoord
  let appliedScaleFactor = 1
  
  // 🎯 优先使用OCR结果中检测到的缩放因子
  if (detectedInternalScaleFactor && detectedInternalScaleFactor > 1) {
    appliedScaleFactor = detectedInternalScaleFactor
    console.log('🔧 使用OCR检测到的内部缩放因子:', appliedScaleFactor)
    correctedOcrCoord = applyScaleCorrectionToOCRCoordinates(ocrCoord, appliedScaleFactor)
  } else {
    // 🔍 降级为原有的启发式检测
    const isOversized = (
      ocrCoord.x > imageSize.width * 1.5 ||
      ocrCoord.y > imageSize.height * 1.5 ||
      (ocrCoord.w && ocrCoord.w > imageSize.width * 0.8) ||
      (ocrCoord.h && ocrCoord.h > imageSize.height * 0.8)
    )
    
    if (isOversized) {
      appliedScaleFactor = 2
      console.log('🔧 启发式检测到OCR坐标超出合理范围，应用2倍修正:', {
        original: ocrCoord,
        imageSize,
        isOversized: true
      })
      correctedOcrCoord = applyScaleCorrectionToOCRCoordinates(ocrCoord, appliedScaleFactor)
    }
  }
  
  // 应用局部坐标映射
  return mapLocalOcrCoordinates(correctedOcrCoord, selectionBounds)
} 