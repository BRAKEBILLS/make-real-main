// 可视化工具 - 在图像上绘制OCR结果
import { CharacterBox, OCRResult } from '../types/ocr'

/**
 * 在Canvas上绘制字符边界框和中心点
 */
export function drawOCRVisualization(
  sourceCanvas: HTMLCanvasElement,
  charBoxes: CharacterBox[],
  options: {
    showBoundingBoxes?: boolean
    showCenterPoints?: boolean
    showCharacterIds?: boolean
    showCharacterText?: boolean
    boundingBoxColor?: string
    centerPointColor?: string
    textColor?: string
    fontSize?: number
  } = {}
): HTMLCanvasElement {
  // 默认选项
  const {
    showBoundingBoxes = true,
    showCenterPoints = true,
    showCharacterIds = true,
    showCharacterText = false,
    boundingBoxColor = '#ff0000', // 红色边界框
    centerPointColor = '#00ff00',  // 绿色中心点
    textColor = '#ff0000',         // 红色文字
    fontSize = 12
  } = options

  // 创建新的canvas用于绘制可视化结果
  const visualCanvas = document.createElement('canvas')
  visualCanvas.width = sourceCanvas.width
  visualCanvas.height = sourceCanvas.height
  
  const ctx = visualCanvas.getContext('2d')!
  
  // 首先绘制原始图像
  ctx.drawImage(sourceCanvas, 0, 0)
  
  // 设置绘制样式
  ctx.font = `${fontSize}px Arial`
  ctx.textBaseline = 'top'
  
  // 遍历每个字符，绘制可视化元素
  charBoxes.forEach((char, index) => {
    const { bbox, center, id, char: character } = char
    
    // 绘制边界框
    if (showBoundingBoxes) {
      ctx.strokeStyle = boundingBoxColor
      ctx.lineWidth = 2
      ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h)
    }
    
    // 绘制中心点
    if (showCenterPoints) {
      ctx.fillStyle = centerPointColor
      ctx.beginPath()
      ctx.arc(center.x, center.y, 3, 0, 2 * Math.PI)
      ctx.fill()
      
      // 绘制十字标记
      ctx.strokeStyle = centerPointColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(center.x - 5, center.y)
      ctx.lineTo(center.x + 5, center.y)
      ctx.moveTo(center.x, center.y - 5)
      ctx.lineTo(center.x, center.y + 5)
      ctx.stroke()
    }
    
    // 绘制字符ID
    if (showCharacterIds) {
      ctx.fillStyle = textColor
      ctx.fillText(id, bbox.x, bbox.y - fontSize - 2)
    }
    
    // 绘制字符内容（可选）
    if (showCharacterText) {
      ctx.fillStyle = textColor
      ctx.fillText(`"${character}"`, bbox.x, bbox.y + bbox.h + 2)
    }
  })
  
  return visualCanvas
}

/**
 * 创建包含置信度信息的可视化
 */
export function drawConfidenceVisualization(
  sourceCanvas: HTMLCanvasElement,
  charBoxes: CharacterBox[]
): HTMLCanvasElement {
  const visualCanvas = document.createElement('canvas')
  visualCanvas.width = sourceCanvas.width
  visualCanvas.height = sourceCanvas.height
  
  const ctx = visualCanvas.getContext('2d')!
  
  // 绘制原始图像
  ctx.drawImage(sourceCanvas, 0, 0)
  
  charBoxes.forEach((char) => {
    const { bbox, center, confidence, id } = char
    
    // 根据置信度选择颜色 (绿色=高置信度, 红色=低置信度)
    const hue = confidence * 120 // 0-120度，从红到绿
    const color = `hsl(${hue}, 100%, 50%)`
    
    // 绘制置信度相关的边界框
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, confidence * 3)
    ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h)
    
    // 绘制置信度数值
    ctx.fillStyle = color
    ctx.font = '10px Arial'
    ctx.fillText(
      `${id}: ${(confidence * 100).toFixed(0)}%`,
      bbox.x,
      bbox.y - 12
    )
  })
  
  return visualCanvas
}

/**
 * 创建详细的分析图像（包含所有信息）
 */
export function createDetailedVisualization(
  originalCanvas: HTMLCanvasElement,
  preprocessedCanvas: HTMLCanvasElement,
  ocrResult: OCRResult
): HTMLCanvasElement {
  const margin = 20
  const labelHeight = 30
  
  // 计算组合图像的尺寸
  const totalWidth = Math.max(originalCanvas.width, preprocessedCanvas.width) * 2 + margin * 3
  const maxHeight = Math.max(originalCanvas.height, preprocessedCanvas.height)
  const totalHeight = maxHeight + labelHeight * 2 + margin * 3
  
  // 创建组合canvas
  const combinedCanvas = document.createElement('canvas')
  combinedCanvas.width = totalWidth
  combinedCanvas.height = totalHeight
  
  const ctx = combinedCanvas.getContext('2d')!
  
  // 设置背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, totalWidth, totalHeight)
  
  // 绘制标题
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 16px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(
    `OCR Analysis - ${ocrResult.imageId}`,
    totalWidth / 2,
    20
  )
  
  // 绘制原始图像标签
  ctx.font = '14px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('Original Image', margin, labelHeight + margin)
  
  // 绘制原始图像
  ctx.drawImage(
    originalCanvas,
    margin,
    labelHeight + margin + 20,
    originalCanvas.width,
    originalCanvas.height
  )
  
  // 绘制预处理图像标签
  ctx.fillText(
    'Preprocessed + OCR Results',
    originalCanvas.width + margin * 2,
    labelHeight + margin
  )
  
  // 在预处理图像上绘制OCR结果
  const visualizedCanvas = drawOCRVisualization(preprocessedCanvas, ocrResult.charBoxes, {
    showBoundingBoxes: true,
    showCenterPoints: true,
    showCharacterIds: true,
    boundingBoxColor: '#ff0000',
    centerPointColor: '#00ff00',
    textColor: '#ff0000',
    fontSize: 10
  })
  
  // 绘制带OCR结果的预处理图像
  ctx.drawImage(
    visualizedCanvas,
    originalCanvas.width + margin * 2,
    labelHeight + margin + 20,
    preprocessedCanvas.width,
    preprocessedCanvas.height
  )
  
  // 绘制统计信息
  const statsY = labelHeight + margin + 20 + maxHeight + 20
  ctx.font = '12px Arial'
  ctx.fillStyle = '#333333'
  
  const stats = [
    `Characters detected: ${ocrResult.charBoxes.length}`,
    `Full text: "${ocrResult.fullText}"`,
    `Processing time: ${ocrResult.metadata.processingTime}ms`,
    `Average confidence: ${ocrResult.charBoxes.length > 0 
      ? Math.round((ocrResult.charBoxes.reduce((sum, char) => sum + char.confidence, 0) / ocrResult.charBoxes.length) * 100)
      : 0}%`,
    `Timestamp: ${new Date(ocrResult.timestamp).toLocaleString()}`
  ]
  
  stats.forEach((stat, index) => {
    ctx.fillText(stat, margin, statsY + index * 15)
  })
  
  return combinedCanvas
}

/**
 * 将Canvas保存为Blob
 */
export function canvasToBlob(canvas: HTMLCanvasElement, quality: number = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to convert canvas to blob'))
      }
    }, 'image/png', quality)
  })
}

/**
 * 生成文件名
 */
export function generateVisualizationFilename(imageId: string, type: 'original' | 'preprocessed' | 'visualization' | 'detailed'): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
  return `${type}_${imageId}_${timestamp}.png`
} 