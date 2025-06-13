// Tesseract.js OCR集成
import { createWorker, RecognizeResult, PSM, OEM } from 'tesseract.js'
import { CharacterBox, OCRResult, TesseractCharacter } from '../types/ocr'
import { nanoid } from 'nanoid'

/**
 * Tesseract OCR工作器类
 */
export class TesseractOCRProcessor {
  private worker: Tesseract.Worker | null = null
  private isInitialized = false

  /**
   * 初始化OCR工作器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      this.worker = await createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
          }
        }
      })

      // 设置OCR参数优化手写识别
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+=-.()[]{}?!@#$%^&*_|\\:;"\'<>,./~`',
        tessedit_pageseg_mode: '6', // 单个统一文本块
        tessedit_ocr_engine_mode: '1', // LSTM OCR引擎
        preserve_interword_spaces: '1',
      } as any)

      this.isInitialized = true
      console.log('Tesseract OCR initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Tesseract OCR:', error)
      throw error
    }
  }

  /**
   * 执行OCR识别
   */
  async recognize(imageData: string | HTMLCanvasElement): Promise<RecognizeResult> {
    if (!this.worker || !this.isInitialized) {
      throw new Error('OCR worker not initialized. Call initialize() first.')
    }

    try {
      const result = await this.worker.recognize(imageData)
      return result
    } catch (error) {
      console.error('OCR recognition failed:', error)
      throw error
    }
  }

  /**
   * 提取字符级别的边界框信息
   */
  extractCharacterBoxes(
    tesseractResult: RecognizeResult,
    imageId: string
  ): CharacterBox[] {
    const characters: CharacterBox[] = []
    let charIndex = 0

    // 遍历所有段落
    tesseractResult.data.paragraphs.forEach((paragraph) => {
      paragraph.lines.forEach((line) => {
        line.words.forEach((word) => {
          // 检查word是否有symbols属性
          if (word.symbols && word.symbols.length > 0) {
            word.symbols.forEach((symbol) => {
              if (symbol.text.trim() !== '') {
                const charId = `c${String(charIndex + 1).padStart(3, '0')}`
                
                // 计算边界框
                const bbox = {
                  x: symbol.bbox.x0,
                  y: symbol.bbox.y0,
                  w: symbol.bbox.x1 - symbol.bbox.x0,
                  h: symbol.bbox.y1 - symbol.bbox.y0
                }

                // 计算中心点
                const center = {
                  x: Math.round(bbox.x + bbox.w / 2),
                  y: Math.round(bbox.y + bbox.h / 2)
                }

                characters.push({
                  id: charId,
                  char: symbol.text,
                  bbox,
                  center,
                  confidence: symbol.confidence / 100 // 转换为0-1范围
                })

                charIndex++
              }
            })
          }
        })
      })
    })

    return characters
  }

  /**
   * 完整的OCR处理流程
   */
  async processImage(
    originalCanvas: HTMLCanvasElement,
    preprocessedCanvas: HTMLCanvasElement,
    imageId?: string
  ): Promise<OCRResult> {
    const startTime = Date.now()
    
    if (!imageId) {
      imageId = `ocr_${nanoid(10)}`
    }

    try {
      // 确保OCR已初始化
      await this.initialize()

      // 🔍 调试：记录传入OCR的图像尺寸
      console.log('🔍 传入Tesseract的图像尺寸:')
      console.log('  originalCanvas:', originalCanvas.width, 'x', originalCanvas.height)
      console.log('  preprocessedCanvas:', preprocessedCanvas.width, 'x', preprocessedCanvas.height)

      // 使用预处理后的图像进行OCR识别
      const tesseractResult = await this.recognize(preprocessedCanvas)
      
      // 🔍 调试：检查Tesseract返回的图像信息
      console.log('🔍 Tesseract返回的结果信息:')
      console.log('  recognizedText length:', tesseractResult.data.text.length)
      console.log('  paragraphs count:', tesseractResult.data.paragraphs.length)
      
      // 检查第一个字符的原始坐标
      let firstCharInfo: any = null
      let internalScaleFactor = 1 // 🔧 新增：检测到的内部缩放因子
      
      if (tesseractResult.data.paragraphs.length > 0) {
        const firstParagraph = tesseractResult.data.paragraphs[0]
        if (firstParagraph.lines.length > 0) {
          const firstLine = firstParagraph.lines[0]
          if (firstLine.words.length > 0) {
            const firstWord = firstLine.words[0]
            if (firstWord.symbols && firstWord.symbols.length > 0) {
              const firstSymbol = firstWord.symbols[0]
              firstCharInfo = {
                char: firstSymbol.text,
                bbox: firstSymbol.bbox,
                originalCoords: {
                  x: firstSymbol.bbox.x0,
                  y: firstSymbol.bbox.y0,
                  w: firstSymbol.bbox.x1 - firstSymbol.bbox.x0,
                  h: firstSymbol.bbox.y1 - firstSymbol.bbox.y0
                }
              }
              console.log('🔍 第一个字符的Tesseract原始坐标:', firstCharInfo)
              
              // 🔧 检测内部缩放因子（但不直接修改OCR结果）
              const charHeightRatio = firstCharInfo.originalCoords.h / preprocessedCanvas.height
              console.log('🔍 字符高度分析:')
              console.log('  第一个字符高度:', firstCharInfo.originalCoords.h)
              console.log('  图像总高度:', preprocessedCanvas.height)
              console.log('  字符高度比例:', charHeightRatio.toFixed(4))
              
              if (charHeightRatio > 0.5) {
                internalScaleFactor = 2
                console.log('🚨 检测到Tesseract内部2倍缩放因子:', internalScaleFactor)
                console.log('📝 注意：OCR结果保持原始状态，只在坐标映射时应用修正')
              } else {
                console.log('✅ Tesseract坐标正常，无内部缩放')
              }
            }
          }
        }
      }
      
      // 提取字符级别信息（保持原始坐标，不修改）
      const charBoxes = this.extractCharacterBoxes(tesseractResult, imageId)

      // 构建OCR结果（完全保持原始状态）
      const ocrResult: OCRResult = {
        imageId,
        timestamp: Date.now(),
        originalImage: originalCanvas.toDataURL('image/png', 0.9),
        preprocessedImage: preprocessedCanvas.toDataURL('image/png', 0.9),
        fullText: tesseractResult.data.text.trim(),
        charBoxes, // 原始坐标，不修改
        metadata: {
          imageWidth: originalCanvas.width,
          imageHeight: originalCanvas.height,
          processingTime: Date.now() - startTime,
          // 🔧 新增：记录检测到的内部缩放因子，供坐标映射使用
          detectedInternalScaleFactor: internalScaleFactor
        }
      }

      console.log(`OCR completed in ${ocrResult.metadata.processingTime}ms`)
      console.log(`Recognized ${charBoxes.length} characters`)
      console.log(`Full text: "${ocrResult.fullText}"`)
      console.log(`Detected internal scale factor: ${internalScaleFactor} (stored in metadata, OCR results unchanged)`)

      return ocrResult
    } catch (error) {
      console.error('OCR processing failed:', error)
      throw error
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.isInitialized = false
      console.log('Tesseract OCR worker terminated')
    }
  }
}

/**
 * 单例OCR处理器实例
 */
let ocrProcessor: TesseractOCRProcessor | null = null

/**
 * 获取OCR处理器实例
 */
export function getOCRProcessor(): TesseractOCRProcessor {
  if (!ocrProcessor) {
    ocrProcessor = new TesseractOCRProcessor()
  }
  return ocrProcessor
}

/**
 * 便捷的OCR处理函数
 */
export async function processImageOCR(
  originalCanvas: HTMLCanvasElement,
  preprocessedCanvas: HTMLCanvasElement,
  imageId?: string
): Promise<OCRResult> {
  const processor = getOCRProcessor()
  return await processor.processImage(originalCanvas, preprocessedCanvas, imageId)
}

/**
 * 验证OCR结果质量
 */
export function validateOCRResult(ocrResult: OCRResult): {
  isValid: boolean
  issues: string[]
  suggestions: string[]
} {
  const issues: string[] = []
  const suggestions: string[] = []

  // 检查是否识别到文本
  if (!ocrResult.fullText || ocrResult.fullText.length === 0) {
    issues.push('No text was recognized')
    suggestions.push('Try improving image quality or adjusting preprocessing settings')
  }

  // 检查字符数量
  if (ocrResult.charBoxes.length === 0) {
    issues.push('No character boxes were extracted')
    suggestions.push('Image may be too blurry or text too small')
  }

  // 检查平均置信度
  const avgConfidence = ocrResult.charBoxes.reduce((sum, char) => sum + char.confidence, 0) / ocrResult.charBoxes.length
  if (avgConfidence < 0.5) {
    issues.push(`Low average confidence: ${(avgConfidence * 100).toFixed(1)}%`)
    suggestions.push('Consider improving image preprocessing or using different OCR settings')
  }

  // 检查字符分布
  const hasLowConfidenceChars = ocrResult.charBoxes.some(char => char.confidence < 0.3)
  if (hasLowConfidenceChars) {
    issues.push('Some characters have very low confidence')
    suggestions.push('Manual review may be needed for low-confidence characters')
  }

  return {
    isValid: issues.length === 0,
    issues,
    suggestions
  }
} 