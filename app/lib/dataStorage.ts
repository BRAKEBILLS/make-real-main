// 数据存储工具
import { OCRResult, ErrorAnalysisResponse } from '../types/ocr'
import { 
  drawOCRVisualization, 
  createDetailedVisualization,
  canvasToBlob,
  generateVisualizationFilename 
} from './visualizationUtils'

/**
 * 浏览器端文件下载工具
 */
export function downloadAsFile(content: string, filename: string, mimeType: string = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

/**
 * 将Canvas保存为图片文件
 */
export function downloadCanvasAsImage(canvas: HTMLCanvasElement, filename: string, quality: number = 0.9): void {
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(url)
    }
  }, 'image/png', quality)
}

/**
 * 保存OCR结果到本地存储
 */
export function saveOCRResultToLocalStorage(ocrResult: OCRResult): void {
  try {
    const key = `ocr_result_${ocrResult.imageId}`
    localStorage.setItem(key, JSON.stringify(ocrResult))
    console.log(`OCR result saved to localStorage with key: ${key}`)
  } catch (error) {
    console.error('Failed to save OCR result to localStorage:', error)
  }
}

/**
 * 从本地存储获取OCR结果
 */
export function getOCRResultFromLocalStorage(imageId: string): OCRResult | null {
  try {
    const key = `ocr_result_${imageId}`
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored) as OCRResult
    }
  } catch (error) {
    console.error('Failed to get OCR result from localStorage:', error)
  }
  return null
}

/**
 * 获取所有存储的OCR结果
 */
export function getAllOCRResultsFromLocalStorage(): OCRResult[] {
  const results: OCRResult[] = []
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('ocr_result_')) {
        const stored = localStorage.getItem(key)
        if (stored) {
          results.push(JSON.parse(stored) as OCRResult)
        }
      }
    }
  } catch (error) {
    console.error('Failed to get OCR results from localStorage:', error)
  }
  
  return results.sort((a, b) => b.timestamp - a.timestamp) // 按时间倒序
}

/**
 * 删除OCR结果从本地存储
 */
export function deleteOCRResultFromLocalStorage(imageId: string): boolean {
  try {
    const key = `ocr_result_${imageId}`
    localStorage.removeItem(key)
    console.log(`OCR result deleted from localStorage: ${key}`)
    return true
  } catch (error) {
    console.error('Failed to delete OCR result from localStorage:', error)
    return false
  }
}

/**
 * 清理所有OCR结果
 */
export function clearAllOCRResults(): number {
  let deletedCount = 0
  
  try {
    const keysToDelete = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('ocr_result_')) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => {
      localStorage.removeItem(key)
      deletedCount++
    })
    
    console.log(`Cleared ${deletedCount} OCR results from localStorage`)
  } catch (error) {
    console.error('Failed to clear OCR results:', error)
  }
  
  return deletedCount
}

/**
 * 下载OCR结果为JSON文件
 */
export function downloadOCRResult(ocrResult: OCRResult): void {
  const filename = `ocr_${ocrResult.imageId}_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`
  const content = JSON.stringify(ocrResult, null, 2)
  downloadAsFile(content, filename, 'application/json')
}

/**
 * 自动保存OCR结果到服务器端/data目录
 */
export async function saveOCRResultToDataDirectory(
  ocrResult: OCRResult,
  originalCanvas: HTMLCanvasElement,
  preprocessedCanvas: HTMLCanvasElement
): Promise<{
  jsonFile: string
  visualizationImageFile: string
}> {
  try {
    // 生成文件名
    const baseFilename = `${ocrResult.imageId}_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`
    const jsonFilename = `ocr_result_${baseFilename}.json`
    const visualizationImageFilename = `visualization_${baseFilename}.png`
    
    // 1. 创建可视化图像
    const visualizationCanvas = drawOCRVisualization(originalCanvas, ocrResult.charBoxes, {
      showBoundingBoxes: true,
      showCenterPoints: true,
      showCharacterIds: true,
      boundingBoxColor: '#ff0000',
      centerPointColor: '#00ff00',
      textColor: '#ff0000',
      fontSize: Math.max(10, Math.min(originalCanvas.width, originalCanvas.height) / 50)
    })
    
    // 2. 准备JSON数据
    const jsonContent = JSON.stringify({
      ...ocrResult,
      visualizationImageFile: visualizationImageFilename
    }, null, 2)
    
    // 3. 获取可视化图像的base64数据
    const visualizationImageData = visualizationCanvas.toDataURL('image/png')
    
    // 4. 通过API保存JSON文件到服务器
    const jsonResponse = await fetch('/api/data-directory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save-file',
        filename: jsonFilename,
        content: jsonContent,
        type: 'json'
      })
    })
    
    if (!jsonResponse.ok) {
      throw new Error('Failed to save JSON file')
    }
    
    // 5. 通过API保存可视化图像到服务器
    const imageResponse = await fetch('/api/data-directory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save-file',
        filename: visualizationImageFilename,
        content: visualizationImageData,
        type: 'image'
      })
    })
    
    if (!imageResponse.ok) {
      throw new Error('Failed to save visualization image')
    }
    
    console.log('✅ OCR结果已保存到服务器/data目录：')
    console.log('- JSON结果:', `data/ocr-results/${jsonFilename}`)
    console.log('- 可视化图像:', `data/visualizations/${visualizationImageFilename}`)
    console.log(`- 识别字符数: ${ocrResult.charBoxes.length}`)
    console.log(`- 识别文本: "${ocrResult.fullText}"`)
    
    return {
      jsonFile: jsonFilename,
      visualizationImageFile: visualizationImageFilename
    }
  } catch (error) {
    console.error('保存OCR结果到/data目录失败:', error)
    throw error
  }
}

/**
 * 创建可视化图像的便捷函数
 */
export function createAndDownloadVisualization(
  sourceCanvas: HTMLCanvasElement,
  ocrResult: OCRResult,
  type: 'basic' | 'confidence' | 'detailed' = 'basic'
): void {
  let visualCanvas: HTMLCanvasElement
  let filename: string
  
  switch (type) {
    case 'confidence':
      // 这里需要导入置信度可视化函数
      visualCanvas = drawOCRVisualization(sourceCanvas, ocrResult.charBoxes, {
        showBoundingBoxes: true,
        showCenterPoints: false,
        showCharacterIds: true,
        boundingBoxColor: '#ff0000'
      })
      filename = `confidence_${ocrResult.imageId}.png`
      break
      
    case 'detailed':
      // 创建包含原始图像的详细分析
      const preprocessedCanvas = document.createElement('canvas')
      preprocessedCanvas.width = sourceCanvas.width
      preprocessedCanvas.height = sourceCanvas.height
      visualCanvas = createDetailedVisualization(sourceCanvas, preprocessedCanvas, ocrResult)
      filename = `detailed_${ocrResult.imageId}.png`
      break
      
    default:
      visualCanvas = drawOCRVisualization(sourceCanvas, ocrResult.charBoxes)
      filename = `visualization_${ocrResult.imageId}.png`
  }
  
  downloadCanvasAsImage(visualCanvas, filename)
}

/**
 * 下载所有OCR结果为ZIP格式的JSON文件集合
 */
export function downloadAllOCRResults(): void {
  const allResults = getAllOCRResultsFromLocalStorage()
  
  if (allResults.length === 0) {
    alert('No OCR results found to download')
    return
  }
  
  // 由于我们在浏览器环境中，简化为下载单个合并的JSON文件
  const combinedData = {
    exportDate: new Date().toISOString(),
    totalResults: allResults.length,
    results: allResults
  }
  
  const filename = `all_ocr_results_${new Date().toISOString().slice(0, 10)}.json`
  const content = JSON.stringify(combinedData, null, 2)
  downloadAsFile(content, filename, 'application/json')
}

/**
 * 从base64图像数据中提取图像信息
 */
export function extractImageInfo(base64Data: string): {
  format: string
  size: number
  dimensions?: { width: number; height: number }
} {
  const header = base64Data.split(',')[0]
  const data = base64Data.split(',')[1]
  
  // 提取MIME类型
  const mimeMatch = header.match(/data:image\/(\w+)/)
  const format = mimeMatch ? mimeMatch[1] : 'unknown'
  
  // 计算大小（字节）
  const size = Math.round((data.length * 3) / 4)
  
  return { format, size }
}

/**
 * 格式化文件大小显示
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 获取存储使用情况
 */
export function getStorageUsage(): {
  used: number
  available: number
  ocrResultsCount: number
  ocrResultsSize: number
} {
  let ocrResultsSize = 0
  let ocrResultsCount = 0
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('ocr_result_')) {
        const value = localStorage.getItem(key)
        if (value) {
          ocrResultsSize += new Blob([value]).size
          ocrResultsCount++
        }
      }
    }
  } catch (error) {
    console.error('Failed to calculate storage usage:', error)
  }
  
  // 估算总的localStorage使用量
  let totalUsed = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key)
        if (value) {
          totalUsed += new Blob([key + value]).size
        }
      }
    }
  } catch (error) {
    totalUsed = ocrResultsSize // fallback
  }
  
  // localStorage通常限制为5-10MB，这里假设5MB
  const available = 5 * 1024 * 1024 - totalUsed
  
  return {
    used: totalUsed,
    available: Math.max(0, available),
    ocrResultsCount,
    ocrResultsSize
  }
}

/**
 * 保存GPT错误分析结果到/data目录
 */
export async function saveErrorAnalysisToDataDirectory(
  errorAnalysis: ErrorAnalysisResponse,
  ocrResult: OCRResult,
  originalText: string
): Promise<string> {
  try {
    // 生成文件名
    const baseFilename = `${ocrResult.imageId}_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`
    const analysisFilename = `gpt_error_analysis_${baseFilename}.json`
    
    // 准备详细的分析数据
    const analysisData = {
      timestamp: new Date().toISOString(),
      imageId: ocrResult.imageId,
      originalText: originalText,
      ocrFullText: ocrResult.fullText,
      ocrCharacterCount: ocrResult.charBoxes.length,
      
      // GPT分析结果
      gptAnalysis: {
        success: errorAnalysis.success,
        processingTime: errorAnalysis.processingTime,
        originalContent: errorAnalysis.result?.originalContent || '',
        hasErrors: errorAnalysis.result?.hasErrors || false,
        errorCount: errorAnalysis.result?.results?.length || 0,
        errors: errorAnalysis.result?.results || []
      },
      
      // 详细的错误信息
      errorDetails: errorAnalysis.result?.results?.map((error, index) => ({
        errorNumber: index + 1,
        characterId: error.id,
        errorType: error.errorType,
        suggestion: error.suggestion,
        explanation: error.explanation,
        animationAction: error.action,
        position: {
          bbox: error.bbox,
          center: error.center
        },
        // 查找对应的OCR字符信息
        ocrCharacterInfo: ocrResult.charBoxes.find(char => char.id === error.id) || null
      })) || [],
      
      // OCR参考数据
      ocrReference: {
        fullText: ocrResult.fullText,
        characterCount: ocrResult.charBoxes.length,
        characters: ocrResult.charBoxes.map(char => ({
          id: char.id,
          character: char.char,
          confidence: char.confidence,
          bbox: char.bbox,
          center: char.center
        }))
      },
      
      // 分析总结
      analysisSummary: {
        totalCharacters: ocrResult.charBoxes.length,
        errorsFound: errorAnalysis.result?.results?.length || 0,
        errorRate: ocrResult.charBoxes.length > 0 
          ? ((errorAnalysis.result?.results?.length || 0) / ocrResult.charBoxes.length * 100).toFixed(2) + '%'
          : '0%',
        errorTypes: Array.from(new Set(errorAnalysis.result?.results?.map(e => e.errorType) || [])),
        animationActions: Array.from(new Set(errorAnalysis.result?.results?.map(e => e.action) || []))
      }
    }
    
    const jsonContent = JSON.stringify(analysisData, null, 2)
    
    // 通过API保存到服务器
    const response = await fetch('/api/data-directory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save-file',
        filename: analysisFilename,
        content: jsonContent,
        type: 'json'
      })
    })
    
    if (!response.ok) {
      throw new Error(`保存GPT分析结果失败: ${response.statusText}`)
    }
    
    console.log(`✅ GPT错误分析结果已保存: ${analysisFilename}`)
    console.log(`📊 分析总结: 发现${errorAnalysis.result?.results?.length || 0}个错误`)
    
    return analysisFilename
    
  } catch (error) {
    console.error('❌ 保存GPT错误分析结果失败:', error)
    throw error
  }
} 