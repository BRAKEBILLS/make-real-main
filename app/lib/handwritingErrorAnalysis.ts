// 手写错误分析核心功能
import { OCRResult, ErrorAnalysisRequest, ErrorAnalysisResponse } from '../types/ocr'

/**
 * 分析手写内容错误
 */
export async function analyzeHandwritingErrors(
  ocrResult: OCRResult,
  originalCanvas: HTMLCanvasElement
): Promise<ErrorAnalysisResponse> {
  const startTime = Date.now()
  
  try {
    console.log('🔍 开始分析手写错误...')
    
    // 准备请求数据
    const requestData: ErrorAnalysisRequest = {
      image: ocrResult.originalImage, // 使用OCR阶段的原始图像
      charBoxes: ocrResult.charBoxes,
      fullText: ocrResult.fullText
    }
    
    console.log(`📝 分析文本: "${requestData.fullText}"`)
    console.log(`🔢 字符数量: ${requestData.charBoxes.length}`)
    
    // 调用OpenAI错误分析API
    const response = await fetch('/api/handwriting-correction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API调用失败: ${response.status} ${errorText}`)
    }
    
    const apiResult = await response.json()
    
    if (!apiResult.success) {
      throw new Error(apiResult.error || 'API返回错误')
    }
    
    console.log('✅ 错误分析完成')
    console.log(`🚨 发现错误: ${apiResult.result.hasErrors}`)
    
    if (apiResult.result.hasErrors) {
      console.log(`📊 错误数量: ${apiResult.result.results.length}`)
      apiResult.result.results.forEach((error: any, index: number) => {
        console.log(`   ${index + 1}. 字符ID: ${error.id}, 类型: ${error.errorType}, 建议: "${error.suggestion}"`)
        console.log(`      📍 坐标: bbox(${error.bbox.x}, ${error.bbox.y}, ${error.bbox.w}x${error.bbox.h}), center(${error.center.x}, ${error.center.y})`)
      })
      
      // 对比原始OCR数据
      console.log('🔍 对比原始OCR字符数据:')
      requestData.charBoxes.forEach((char: any) => {
        console.log(`   字符"${char.char}" ID:${char.id} bbox(${char.bbox.x}, ${char.bbox.y}, ${char.bbox.w}x${char.bbox.h}) center(${char.center.x}, ${char.center.y})`)
      })
    }
    
    return {
      success: true,
      result: apiResult.result,
      processingTime: Date.now() - startTime
    }
    
  } catch (error) {
    console.error('❌ 手写错误分析失败:', error)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      processingTime: Date.now() - startTime
    }
  }
}

/**
 * 验证错误分析结果
 */
export function validateErrorAnalysisResult(
  errors: any[],
  originalCharBoxes: any[]
): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = []
  
  // 检查错误中的ID是否在原始字符列表中存在
  const originalIds = new Set(originalCharBoxes.map(char => char.id))
  
  errors.forEach((error, index) => {
    if (!originalIds.has(error.id)) {
      issues.push(`错误 ${index + 1}: ID "${error.id}" 在原始字符列表中不存在`)
    }
    
    if (!error.bbox || !error.center) {
      issues.push(`错误 ${index + 1}: 缺少bbox或center坐标`)
    }
    
    if (!error.suggestion || error.suggestion.trim() === '') {
      issues.push(`错误 ${index + 1}: 缺少建议修正值`)
    }
  })
  
  return {
    isValid: issues.length === 0,
    issues
  }
}

/**
 * 格式化错误分析报告
 */
export function formatErrorReport(
  originalContent: string,
  errors: any[]
): string {
  if (errors.length === 0) {
    return `✅ 手写内容 "${originalContent}" 没有发现错误。`
  }
  
  let report = `📋 手写内容: "${originalContent}"\n`
  report += `🚨 发现 ${errors.length} 个错误:\n\n`
  
  errors.forEach((error, index) => {
    report += `${index + 1}. 字符ID: ${error.id}\n`
    report += `   错误类型: ${error.errorType}\n`
    report += `   建议修正: "${error.suggestion}"\n`
    report += `   说明: ${error.explanation}\n`
    report += `   位置: (${error.center.x}, ${error.center.y})\n\n`
  })
  
  return report
} 