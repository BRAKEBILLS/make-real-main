// OCR功能测试文件
import { OCRResult, CharacterBox } from '../types/ocr'

/**
 * 创建模拟的OCR测试数据
 */
export function createMockOCRResult(): OCRResult {
  const mockCharBoxes: CharacterBox[] = [
    {
      id: 'c001',
      char: 'H',
      bbox: { x: 100, y: 50, w: 20, h: 30 },
      center: { x: 110, y: 65 },
      confidence: 0.95
    },
    {
      id: 'c002',
      char: 'e',
      bbox: { x: 125, y: 55, w: 15, h: 25 },
      center: { x: 132, y: 67 },
      confidence: 0.92
    },
    {
      id: 'c003',
      char: 'l',
      bbox: { x: 145, y: 50, w: 8, h: 30 },
      center: { x: 149, y: 65 },
      confidence: 0.88
    },
    {
      id: 'c004',
      char: 'l',
      bbox: { x: 158, y: 50, w: 8, h: 30 },
      center: { x: 162, y: 65 },
      confidence: 0.90
    },
    {
      id: 'c005',
      char: 'o',
      bbox: { x: 171, y: 55, w: 15, h: 25 },
      center: { x: 178, y: 67 },
      confidence: 0.94
    }
  ]

  return {
    imageId: 'test_ocr_001',
    timestamp: Date.now(),
    originalImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    preprocessedImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    fullText: 'Hello',
    charBoxes: mockCharBoxes,
    metadata: {
      imageWidth: 300,
      imageHeight: 100,
      processingTime: 2500
    }
  }
}

/**
 * 创建数学错误的测试数据
 */
export function createMathErrorMockData(): OCRResult {
  const mathCharBoxes: CharacterBox[] = [
    {
      id: 'c001',
      char: '1',
      bbox: { x: 50, y: 100, w: 12, h: 20 },
      center: { x: 56, y: 110 },
      confidence: 0.98
    },
    {
      id: 'c002',
      char: '+',
      bbox: { x: 70, y: 105, w: 10, h: 10 },
      center: { x: 75, y: 110 },
      confidence: 0.96
    },
    {
      id: 'c003',
      char: '2',
      bbox: { x: 90, y: 100, w: 12, h: 20 },
      center: { x: 96, y: 110 },
      confidence: 0.97
    },
    {
      id: 'c004',
      char: '=',
      bbox: { x: 110, y: 105, w: 10, h: 10 },
      center: { x: 115, y: 110 },
      confidence: 0.95
    },
    {
      id: 'c005',
      char: '4', // 错误答案，应该是3
      bbox: { x: 130, y: 100, w: 12, h: 20 },
      center: { x: 136, y: 110 },
      confidence: 0.93
    }
  ]

  return {
    imageId: 'test_math_error_001',
    timestamp: Date.now(),
    originalImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    preprocessedImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    fullText: '1+2=4',
    charBoxes: mathCharBoxes,
    metadata: {
      imageWidth: 200,
      imageHeight: 50,
      processingTime: 1800
    }
  }
}

/**
 * 测试OCR结果验证函数
 */
export function testOCRValidation() {
  console.log('=== OCR 验证测试 ===')
  
  const validResult = createMockOCRResult()
  console.log('有效OCR结果:', validResult)
  
  const mathErrorResult = createMathErrorMockData()
  console.log('数学错误测试数据:', mathErrorResult)
  
  // 测试平均置信度计算
  const avgConfidence = validResult.charBoxes.reduce((sum, char) => sum + char.confidence, 0) / validResult.charBoxes.length
  console.log('平均置信度:', (avgConfidence * 100).toFixed(1) + '%')
  
  // 测试字符映射
  const characterMap = new Map(validResult.charBoxes.map(char => [char.id, char]))
  console.log('字符映射:', characterMap)
  
  return {
    validResult,
    mathErrorResult,
    avgConfidence,
    characterMap
  }
}

/**
 * 测试坐标映射功能
 */
export function testCoordinateMapping() {
  console.log('=== 坐标映射测试 ===')
  
  const ocrResult = createMockOCRResult()
  
  // 模拟画布缩放
  const canvasScale = 1.5
  const scaledCoords = ocrResult.charBoxes.map(char => ({
    ...char,
    bbox: {
      x: char.bbox.x * canvasScale,
      y: char.bbox.y * canvasScale,
      w: char.bbox.w * canvasScale,
      h: char.bbox.h * canvasScale
    },
    center: {
      x: char.center.x * canvasScale,
      y: char.center.y * canvasScale
    }
  }))
  
  console.log('原始坐标:', ocrResult.charBoxes[0])
  console.log('缩放后坐标:', scaledCoords[0])
  
  return scaledCoords
}

/**
 * 运行所有测试
 */
export function runAllTests() {
  console.log('🚀 开始OCR功能测试...\n')
  
  try {
    const validationTest = testOCRValidation()
    const coordinateTest = testCoordinateMapping()
    
    console.log('\n✅ 所有测试完成!')
    return {
      validation: validationTest,
      coordinates: coordinateTest,
      success: true
    }
  } catch (error) {
    console.error('❌ 测试失败:', error)
    return {
      success: false,
      error
    }
  }
}

// 如果在浏览器环境中直接运行
if (typeof window !== 'undefined') {
  // 将测试函数暴露到全局对象，方便调试
  ;(window as any).ocrTest = {
    createMockOCRResult,
    createMathErrorMockData,
    testOCRValidation,
    testCoordinateMapping,
    runAllTests
  }
} 