// 手写OCR处理Hook
import { useCallback, useState, useEffect } from 'react'
import { useEditor, useToasts, TLShapeId, createShapeId, toRichText } from 'tldraw'
import { createFadeInText } from '../lib/fadeTextAnimation'
import { OCRResult, OCRProcessingResult, ImageProcessingOptions, ErrorAnalysisResponse } from '../types/ocr'
import { preprocessImage, canvasToBase64 } from '../lib/imagePreprocessing'
import { processImageOCR, validateOCRResult } from '../lib/tesseractOCR'
import { 
  saveOCRResultToLocalStorage, 
  downloadOCRResult,
  downloadCanvasAsImage,
  getAllOCRResultsFromLocalStorage,
  saveOCRResultToDataDirectory,
  saveErrorAnalysisToDataDirectory 
} from '../lib/dataStorage'
import { analyzeHandwritingErrors, validateErrorAnalysisResult, formatErrorReport } from '../lib/handwritingErrorAnalysis'
import { markErrorsOnCanvas, clearErrorMarks, markErrorsWithAnimation } from '../lib/canvasErrorMarking'
import { mapOcrBoxesToPage, DomImageData, pixelBoxToPageBox } from '../lib/ocrPixelToPageMapping'
// 导入TTS钩子
import { useTTS } from './useTTS'

// 新增：第三阶段智能建议相关导入
import { 
  createSpatialGrid, 
  optimizeMultipleErrorLayout, 
  SuggestionPlacement, 
  SpatialGrid,
  visualizeGrid 
} from '../lib/smartPositioning'

interface UseHandwritingOCROptions {
  autoSave?: boolean
  autoSaveToDataDirectory?: boolean
  enableErrorAnalysis?: boolean  // 是否启用错误分析
  autoMarkErrors?: boolean       // 是否自动标记错误
  enableSmartSuggestions?: boolean // 新增：是否启用智能建议显示
  autoShowSuggestions?: boolean    // 新增：是否自动显示建议卡片
  enableTTS?: boolean              // 新增：是否启用TTS功能
  preprocessingOptions?: ImageProcessingOptions
}

interface OCRState {
  isProcessing: boolean
  progress: number
  currentStep: string
  lastResult: OCRResult | null
  lastSelectionBounds: { x: number; y: number; w: number; h: number } | null  // 存储选区边界
  lastErrorAnalysis: ErrorAnalysisResponse | null  // 最后的错误分析结果
  errorMarkShapeIds: TLShapeId[]                    // 错误标记的Shape ID列表
  
  // 新增：第三阶段智能建议状态
  suggestionPlacements: SuggestionPlacement[]      // 建议卡片位置
  spatialGrid: SpatialGrid | null                  // 空间密度网格
  suggestionsVisible: boolean                      // 建议是否可见
  hintShapeMapping: Map<string, string>            // hint按钮shape ID到错误ID的映射
  
  error: string | null
}

export function useHandwritingOCR(options: UseHandwritingOCROptions = {}) {
  const editor = useEditor()
  const { addToast } = useToasts()
  
  // 初始化TTS钩子
  const tts = useTTS({
    voice: 'nova',
    style: 'friendly', 
    speed: 1.0
  })
  
  const [ocrState, setOCRState] = useState<OCRState>({
    isProcessing: false,
    progress: 0,
    currentStep: '',
    lastResult: null,
    lastSelectionBounds: null,
    lastErrorAnalysis: null,
    errorMarkShapeIds: [],
    
    // 新增：第三阶段状态初始化
    suggestionPlacements: [],
    spatialGrid: null,
    suggestionsVisible: false,
    hintShapeMapping: new Map(),
    
    error: null
  })

  // 默认预处理选项
  const defaultPreprocessingOptions: ImageProcessingOptions = {
    grayscale: true,
    binary: true,
    denoise: true,
    enhance: true,
    ...options.preprocessingOptions
  }

  /**
   * 更新OCR状态
   */
  const updateOCRState = useCallback((updates: Partial<OCRState>) => {
    setOCRState(prev => ({ ...prev, ...updates }))
  }, [])

  /**
   * 使用TTS朗读内容
   */
  const speakContent = useCallback(async (text: string, style: string = 'friendly') => {
    if (!options.enableTTS) return
    
    try {
      console.log(`🔊 开始朗读: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)
      await tts.speak(text, { style })
    } catch (error) {
      console.error('TTS播放失败:', error)
    }
  }, [tts, options.enableTTS])

  /**
   * 朗读OCR结果
   */
  const speakOCRResult = useCallback(async (ocrResult: OCRResult) => {
    if (!options.enableTTS) return
    
    if (ocrResult && ocrResult.fullText) {
      // 直接朗读OCR文本，不添加前缀
      await speakContent(ocrResult.fullText, 'friendly')
    }
  }, [speakContent, options.enableTTS])

  /**
   * 朗读错误分析结果
   */
  const speakErrorAnalysis = useCallback(async (errorAnalysis: ErrorAnalysisResponse) => {
    if (!options.enableTTS || !errorAnalysis?.success || !errorAnalysis.result) return
    
    const { result } = errorAnalysis
    
    if (result.hasErrors) {
      // 只朗读第一个错误的完整解释文本
      const firstError = result.results[0];
      if (firstError && firstError.explanation) {
        // 直接朗读完整的explanation，不添加任何额外文本
        await speakContent(firstError.explanation, 'teaching')
      }
    }
  }, [speakContent, options.enableTTS])

  /**
   * 新增：生成智能建议布局
   */
  const generateSmartSuggestionLayout = useCallback((errors: any[], selectionBounds: any) => {
    // 发送调试信息到服务器终端
    const sendDebugToTerminal = async (message: string) => {
      try {
        await fetch('/makereal.tldraw.com/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        })
      } catch (err) {
        // 忽略网络错误，不影响主要功能
      }
    }

    try {
      console.log('🧠 开始智能建议布局分析...')
      sendDebugToTerminal('🧠 开始智能建议布局分析...')
      
      sendDebugToTerminal(`📊 输入参数检查:
  errors数量: ${errors.length}
  selectionBounds: ${JSON.stringify(selectionBounds)}`)
      
      errors.forEach((error, index) => {
        const errorDebug = `  错误${index + 1}: ID=${error.id}, 类型=${error.errorType}, 建议="${error.suggestion}"`
        console.log(errorDebug)
        sendDebugToTerminal(errorDebug)
      })
      
      // 简化定位：直接在蓝框右侧显示
      const simplePlacements: SuggestionPlacement[] = errors.map((error, index) => {
        const cardWidth = 180
        const cardHeight = 120
        
        // 直接在蓝框右侧放置卡片
        const cardX = selectionBounds.x + selectionBounds.w + 20 // 蓝框右侧20px
        const cardY = selectionBounds.y + (index * 130) // 垂直排列
        
        const placement: SuggestionPlacement = {
          x: cardX,
          y: cardY,
          width: cardWidth,
          height: cardHeight,
          leadLineStart: {
            x: error.center.x,
            y: error.center.y
          },
          leadLineEnd: {
            x: cardX,
            y: cardY + cardHeight / 2
          },
          animationDelay: index * 300
        }
        
        const placementInfo = `  建议${index + 1}: 位置(${cardX}, ${cardY}), 延迟${placement.animationDelay}ms`
        console.log(placementInfo)
        sendDebugToTerminal(placementInfo)
        
        return placement
      })
      
      console.log(`🎯 智能布局完成: 为${errors.length}个错误生成了${simplePlacements.length}个建议位置`)
      sendDebugToTerminal(`🎯 智能布局完成: 为${errors.length}个错误生成了${simplePlacements.length}个建议位置`)

      return {
        placements: simplePlacements,
        grid: null
      }
    } catch (error) {
      const errorMsg = `❌ 智能布局分析失败: ${error}`
      console.error(errorMsg)
      sendDebugToTerminal(errorMsg)
      return {
        placements: [],
        grid: null
      }
    }
  }, [editor])

  /**
   * 新增：显示智能建议
   */
  const showSmartSuggestions = useCallback(async () => {
    // 发送调试信息到服务器终端
    const sendDebugToTerminal = async (message: string) => {
      try {
        await fetch('/makereal.tldraw.com/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        })
      } catch (err) {
        // 忽略网络错误，不影响主要功能
      }
    }

    console.log('🎯 开始显示智能建议...')
    sendDebugToTerminal('🎯 开始显示智能建议...')
    
    // 强制获取编辑器的选择边界
    let selectionBounds = ocrState.lastSelectionBounds;
    if (!selectionBounds && editor) {
      try {
        // 尝试直接从编辑器获取当前选择边界
        const editorSelectionBounds = editor.getSelectionPageBounds();
        if (editorSelectionBounds) {
          console.log('✅ 直接从编辑器获取选择边界成功')
          selectionBounds = editorSelectionBounds;
          // 更新状态
          updateOCRState({
            lastSelectionBounds: selectionBounds
          });
        }
      } catch (err) {
        console.error('❌ 尝试从编辑器获取选择边界失败:', err);
      }
    }
    
    // 确保当前状态已经是最新的
    const currentState = ocrState;
    
    // 详细记录当前状态
    const debugState = `🔍 当前状态检查:
  lastErrorAnalysis存在: ${!!currentState.lastErrorAnalysis}
  lastErrorAnalysis.success: ${currentState.lastErrorAnalysis?.success}
  hasErrors: ${currentState.lastErrorAnalysis?.result?.hasErrors}
  错误数量: ${currentState.lastErrorAnalysis?.result?.results?.length || 0}
  lastResult存在: ${!!currentState.lastResult}
  suggestionsVisible: ${currentState.suggestionsVisible}
  selectionBounds存在: ${!!selectionBounds}`
    
    console.log(debugState)
    sendDebugToTerminal(debugState)
    
    if (!currentState.lastErrorAnalysis?.result?.hasErrors || !currentState.lastResult) {
      const reason = !currentState.lastErrorAnalysis ? '没有错误分析结果' : 
                   !currentState.lastErrorAnalysis.result ? '错误分析结果为空' :
                   !currentState.lastErrorAnalysis.result.hasErrors ? '没有检测到错误' :
                   '没有OCR结果'
      
      const msg = `❌ 无法显示智能建议: ${reason}`
      console.log(msg)
      sendDebugToTerminal(msg)
      
      addToast({
        id: 'no-errors-for-suggestions',
        title: 'No suggestions to display',
        description: reason,
        severity: 'info'
      })
      return
    }
    
    // 如果没有选区边界，但有错误分析结果，尝试使用默认位置
    if (!selectionBounds && currentState.lastErrorAnalysis?.result?.hasErrors) {
      console.log('⚠️ 无法获取选区边界，将使用默认位置');
      // 创建一个默认选区，居中显示
      selectionBounds = {
        x: 400, // 页面中间位置
        y: 300,
        w: 200,
        h: 100
      };
    }

    try {
      updateOCRState({
          currentStep: 'Generating handwriting suggestions...'
      })

      const errors = ocrState.lastErrorAnalysis.result.results
        // selectionBounds已在前面部分设置好，此处不需要再次获取
      
      if (!selectionBounds) {
          const errorMsg = '❌ Unable to get selected area boundaries'
        sendDebugToTerminal(errorMsg)
          throw new Error('Unable to get selected area boundaries')
      }

      // 创建手写建议内容shapes
      const suggestionShapeIds: TLShapeId[] = []
      const hintMapping = new Map<string, string>() // 临时存储映射
      
      for (let i = 0; i < errors.length; i++) {
        const error = errors[i]
        
        // 计算建议内容位置（在选区下方）
        const contentX = selectionBounds.x
        const contentY = selectionBounds.y + selectionBounds.h + 20 + (i * 60) // 选区下方，每个错误间距60px
        
        // 创建手写建议内容 - 模拟用户手写样式
        const suggestionText = `Suggestion: ${error.suggestion} (${error.explanation})`
        
        try {
          // 使用新的渐变文本方法
          const textId = createFadeInText(
            editor,
            suggestionText,
            contentX,
            contentY,
            {
              font: 'draw',
              size: 'l',
              color: 'green', // 使用tldraw支持的颜色
              duration: 1200,
              delay: i * 300 // 序列化显示
            }
          )
          
          // 存储创建的ID用于后续清理
          suggestionShapeIds.push(textId)
        
        // 存储映射关系
          hintMapping.set(textId, error.id)
          
          sendDebugToTerminal(`✅ 创建手写建议内容 ${i + 1}: "${suggestionText}", 位置(${contentX}, ${contentY})`)
        } catch (shapeError) {
          sendDebugToTerminal(`❌ 创建手写建议内容 ${i + 1} 失败: ${shapeError}`)
        }
      }
      
      updateOCRState({
        suggestionPlacements: [], // 不再使用DOM方式
        spatialGrid: null,
        suggestionsVisible: true,
        currentStep: 'Handwriting suggestions generated',
        // 存储shape IDs用于后续清理
        errorMarkShapeIds: [...ocrState.errorMarkShapeIds, ...suggestionShapeIds],
        hintShapeMapping: hintMapping
      })

      const successMsg = `✅ 手写建议显示成功: 创建了${suggestionShapeIds.length}个手写shapes`
      console.log(successMsg)
      sendDebugToTerminal(successMsg)

      addToast({
        id: 'smart-suggestions-shown',
        title: 'Handwriting suggestions displayed',
        description: `Generated handwriting suggestions for ${errors.length} errors`,
        severity: 'success'
      })

    } catch (error) {
      const errorMsg = `❌ 显示手写建议失败: ${error}`
      console.error(errorMsg)
      sendDebugToTerminal(errorMsg)
      
      addToast({
        id: 'smart-suggestions-failed',
        title: 'Handwriting suggestions failed',
        description: 'Unable to generate handwriting suggestions',
        severity: 'warning'
      })
    }
  }, [ocrState.lastErrorAnalysis, ocrState.lastResult, ocrState.lastSelectionBounds, ocrState.errorMarkShapeIds, editor, updateOCRState, addToast])

  /**
   * 新增：隐藏智能建议
   */
  const hideSmartSuggestions = useCallback(() => {
    // 发送调试信息到服务器终端
    const sendDebugToTerminal = async (message: string) => {
      try {
        await fetch('/makereal.tldraw.com/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        })
      } catch (err) {
        // 忽略网络错误，不影响主要功能
      }
    }

    console.log('🙈 hideSmartSuggestions被调用...')
    sendDebugToTerminal('🙈 hideSmartSuggestions被调用...')
    
    // 清除建议相关的shapes（包括错误标记和建议卡片）
    if (ocrState.errorMarkShapeIds.length > 0) {
      try {
        // 筛选出仍然存在的shapes
        const existingShapes = ocrState.errorMarkShapeIds.filter(id => editor.getShape(id))
        if (existingShapes.length > 0) {
          editor.deleteShapes(existingShapes)
          sendDebugToTerminal(`🗑️ 清除了 ${existingShapes.length} 个建议相关shapes`)
        }
      } catch (error) {
        sendDebugToTerminal(`❌ 清除shapes失败: ${error}`)
      }
    }
    
    updateOCRState({
      suggestionsVisible: false,
      suggestionPlacements: [],
      spatialGrid: null,
      errorMarkShapeIds: [], // 清空所有shape IDs
      hintShapeMapping: new Map()
    })
    
    console.log('✅ 智能建议已隐藏')
    sendDebugToTerminal('✅ 智能建议已隐藏')
    
    addToast({
      id: 'smart-suggestions-hidden',
              title: 'Suggestions hidden',
        description: 'Smart suggestion cards have been closed',
      severity: 'info'
    })
  }, [ocrState.errorMarkShapeIds, editor, updateOCRState, addToast])

  /**
   * 新增：切换智能建议显示状态
   */
  const toggleSmartSuggestions = useCallback(async () => {
    // 发送调试信息到服务器终端
    const sendDebugToTerminal = async (message: string) => {
      try {
        await fetch('/makereal.tldraw.com/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        })
      } catch (err) {
        // 忽略网络错误，不影响主要功能
      }
    }

    console.log('🔄 toggleSmartSuggestions被调用...')
    sendDebugToTerminal('🔄 toggleSmartSuggestions被调用...')
    
    const currentState = `📊 当前状态检查:
  suggestionsVisible: ${ocrState.suggestionsVisible}
  suggestionPlacements数量: ${ocrState.suggestionPlacements.length}
  spatialGrid存在: ${!!ocrState.spatialGrid}`
    
    console.log(currentState)
    sendDebugToTerminal(currentState)
    
    if (ocrState.suggestionsVisible) {
      console.log('🙈 当前建议可见，准备隐藏...')
      sendDebugToTerminal('🙈 当前建议可见，准备隐藏...')
      hideSmartSuggestions()
    } else {
      console.log('👁️ 当前建议隐藏，准备显示...')
      sendDebugToTerminal('👁️ 当前建议隐藏，准备显示...')
      showSmartSuggestions()
    }

    // 当suggestions被显示时，朗读错误解释
    if (!ocrState.suggestionsVisible && options.enableTTS && ocrState.lastErrorAnalysis?.result?.results.length > 0) {
      const error = ocrState.lastErrorAnalysis.result.results[0];
      if (error && error.explanation) {
        speakContent(error.explanation, 'informative')
      }
    }
  }, [ocrState.suggestionsVisible, hideSmartSuggestions, showSmartSuggestions, options.enableTTS, speakContent])

  /**
   * 从tldraw画布截取选中区域进行OCR处理
   */
  const processSelectedShapes = useCallback(async (): Promise<OCRProcessingResult> => {
    const startTime = Date.now()
    
    // 发送调试信息到服务器终端
    const sendDebugToTerminal = async (message: string) => {
      try {
        await fetch('/makereal.tldraw.com/api/debug-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        })
      } catch (err) {
        // 忽略网络错误，不影响主要功能
      }
    }
    
    try {
      updateOCRState({
        isProcessing: true,
        progress: 0,
        currentStep: 'Preparing to process...',
        error: null,
        // 重置第三阶段状态
        suggestionPlacements: [],
        spatialGrid: null,
        suggestionsVisible: false
      })

      // 🎯 方案A：只截蓝框给OCR (推荐，最简单)
      // 1️⃣ 取得当前选中的 shapeIds
      const shapeIds = editor.getSelectedShapeIds()     // string[]
      
      if (shapeIds.length === 0) {
        throw new Error('请先选择要识别的手写内容区域')
      }
      
      console.log('🔍 准备截取选中区域:')
      console.log('  选中的ShapeIds:', shapeIds)
      console.log('  ShapeIds数量:', shapeIds.length)

      // 获取选中区域的边界框
      const selectionBounds = editor.getSelectionPageBounds()
      if (!selectionBounds) {
        throw new Error('无法获取选中区域边界')
      }
      
      console.log('📐 选中区域边界:', selectionBounds)

      // 2️⃣ 只导出这些 shape（正确调用方式）
      const { blob, width, height } = await editor.toImage(shapeIds, {
        background: true,            // 是否带白底
        format: 'png',               // 图像格式
        scale: 1,                    // 🔧 修复：使用1:1比例，避免缩放导致的坐标偏移
        padding: 0,                  // 不要额外留白
      })

      if (!blob) {
        throw new Error('无法截取画布图像')
      }

      // 3️⃣ 快速自检
      console.table({
        'shapeIds数量': shapeIds.length,
        'blob大小(KB)': Math.round(blob.size / 1024),
        'selection宽度': selectionBounds.w,
        'selection高度': selectionBounds.h,
        '图像宽度': width,
        '图像高度': height,
        '尺寸匹配': (Math.abs(width - selectionBounds.w) < 1 && Math.abs(height - selectionBounds.h) < 1) ? '✅ 完美匹配' : '❌ 不匹配',
        '缩放比例': `X=${(width / selectionBounds.w).toFixed(3)}, Y=${(height / selectionBounds.h).toFixed(3)}`
      })
      
      console.log('🎯 Scale=1验证:')
      console.log('  图像尺寸与选区应该完全一致')
      console.log('  实际图像尺寸:', width, '×', height)
      console.log('  选区尺寸:', selectionBounds.w.toFixed(1), '×', selectionBounds.h.toFixed(1))
      console.log('  尺寸差异: ΔW =', Math.abs(width - selectionBounds.w).toFixed(1), ', ΔH =', Math.abs(height - selectionBounds.h).toFixed(1))
      
      if (Math.abs(width - selectionBounds.w) > 1 || Math.abs(height - selectionBounds.h) > 1) {
        console.warn('⚠️ 警告: 图像尺寸与选区尺寸不匹配，可能仍有缩放问题')
      } else {
        console.log('✅ 图像尺寸与选区完美匹配，scale=1生效')
      }

      updateOCRState({
        progress: 20,
        currentStep: 'Converting image format...'
      })

      // 将blob转换为canvas
      const originalCanvas = await blobToCanvas(blob)

      updateOCRState({
        progress: 30,
        currentStep: 'Preprocessing image...'
      })

      // 图像预处理
      const preprocessedCanvas = preprocessImage(originalCanvas, defaultPreprocessingOptions)

      // 🎯 方案A核心：crop 即是 bounds，sel 与 crop 完全一致
      // OCR坐标直接基于蓝框内容(0,0)开始，无需复杂转换
      const cropBounds = { ...selectionBounds }    // crop完全等于selection
      const selBounds = { ...selectionBounds }     // sel也完全等于selection
      
      console.log('🎯 方案A实现详情:')
      console.log('  蓝框区域 (selection):', selectionBounds)
      console.log('  裁剪区域 (crop):', cropBounds)
      console.log('  映射目标 (sel):', selBounds)
      console.log('  三者完全一致:', 
        JSON.stringify(cropBounds) === JSON.stringify(selectionBounds) &&
        JSON.stringify(selBounds) === JSON.stringify(selectionBounds)
      )
      
      console.log('📸 OCR图像信息:')
      console.log('  toImage返回尺寸:', width, 'x', height)
      console.log('  Canvas实际尺寸:', originalCanvas.width, 'x', originalCanvas.height)
      console.log('  预处理图像尺寸:', preprocessedCanvas.width, 'x', preprocessedCanvas.height)
      console.log('  选区与图像比例: X =', (width / selectionBounds.w).toFixed(4), 
                  ', Y =', (height / selectionBounds.h).toFixed(4))

      updateOCRState({
        progress: 50,
        currentStep: 'Performing OCR recognition...'
      })

      // 执行OCR识别，传递正确的图像尺寸信息
      const ocrResult = await processImageOCR(originalCanvas, preprocessedCanvas)
      
      // 🎯 方案A关键修正：强制使用正确的图像尺寸
      // 因为OCR应该基于选中区域，而不是全画布
      ocrResult.metadata.imageWidth = width
      ocrResult.metadata.imageHeight = height
      
      console.log('🎯 OCR结果metadata修正:')
      console.log('  修正前Canvas尺寸:', originalCanvas.width, 'x', originalCanvas.height)
      console.log('  修正后OCR尺寸:', ocrResult.metadata.imageWidth, 'x', ocrResult.metadata.imageHeight)
      console.log('  选区尺寸:', selectionBounds.w, 'x', selectionBounds.h)

      updateOCRState({
        progress: 80,
        currentStep: 'Validating recognition results...'
      })

      // 验证OCR结果质量
      const validation = validateOCRResult(ocrResult)
      if (!validation.isValid) {
        console.warn('OCR质量警告:', validation.issues)
        addToast({
          id: 'ocr-quality-warning',
          title: 'OCR质量警告',
          description: validation.issues.join(', '),
          severity: 'warning'
        })
      }

      updateOCRState({
        progress: 90,
        currentStep: 'Saving results...'
      })

      // 自动保存到localStorage
      if (options.autoSave !== false) {
        saveOCRResultToLocalStorage(ocrResult)
      }

      // 自动保存到/data目录（包含可视化图像）
      if (options.autoSaveToDataDirectory !== false) {
        try {
          const savedFiles = await saveOCRResultToDataDirectory(
            ocrResult,
            originalCanvas,
            preprocessedCanvas
          )
          
          addToast({
            id: 'data-save-success',
                    title: 'Recognition completed',
        description: `Recognized ${ocrResult.charBoxes.length} characters and saved to /data directory`,
            severity: 'success'
          })
        } catch (error) {
          console.error('保存到/data目录失败:', error)
          addToast({
            id: 'data-save-error',
                    title: 'Save failed',
        description: 'Unable to save to /data directory, please check browser download settings',
            severity: 'warning'
          })
        }
      }

      // 错误分析步骤
      let errorAnalysisResult: ErrorAnalysisResponse | null = null
      let errorMarkShapeIds: TLShapeId[] = []

      if (options.enableErrorAnalysis !== false) {
        updateOCRState({
          progress: 92,
          currentStep: 'Analyzing handwriting errors...'
        })

        try {
          errorAnalysisResult = await analyzeHandwritingErrors(ocrResult, originalCanvas)
          
          if (errorAnalysisResult.success && errorAnalysisResult.result) {
            // 在处理GPT响应后立即验证和修正坐标
            if (errorAnalysisResult.result.hasErrors) {
              // 验证并修正GPT坐标
              const fixedErrors = validateAndFixGPTCoordinates(
                errorAnalysisResult.result.results,
                ocrResult.charBoxes
              )
              
              // 更新错误分析结果
              errorAnalysisResult.result.results = fixedErrors
              
              const fixedCount = fixedErrors.filter((e, i) => e !== errorAnalysisResult.result.results[i]).length
              sendDebugToTerminal(`🔧 验证GPT坐标: 修正了${fixedCount}个坐标`)
            }
            
            // 验证错误分析结果
            const validation = validateErrorAnalysisResult(
              errorAnalysisResult.result.results,
              ocrResult.charBoxes
            )
            
            if (!validation.isValid) {
              console.warn('错误分析结果验证失败:', validation.issues)
            }

            // 🔧 新增：保存GPT分析结果到data目录
            try {
              sendDebugToTerminal('📁 正在保存GPT错误分析结果到data目录...')
              const analysisFilename = await saveErrorAnalysisToDataDirectory(
                errorAnalysisResult, 
                ocrResult, 
                ocrResult.fullText
              )
              sendDebugToTerminal(`✅ GPT分析结果已保存: ${analysisFilename}`)
              
              console.log(`📁 GPT分析结果保存成功: ${analysisFilename}`)
            } catch (saveError) {
              const errorMsg = `❌ 保存GPT分析结果失败: ${saveError}`
              console.error(errorMsg)
              sendDebugToTerminal(errorMsg)
            }

            if (errorAnalysisResult.result.hasErrors) {
              console.log(`🚨 发现 ${errorAnalysisResult.result.results.length} 个错误`)
              
              // 🎯 自动标记错误
              if (options.autoMarkErrors && errorAnalysisResult.result.hasErrors && errorAnalysisResult.result.results.length > 0) {
                console.log(`🎯 自动标记 ${errorAnalysisResult.result.results.length} 个错误...`)
                sendDebugToTerminal(`🎯 开始自动标记 ${errorAnalysisResult.result.results.length} 个错误...`)
                
                // 转换错误坐标到tldraw坐标系 - 使用新算法
                const convertedErrors = (() => {
                  // 构建图片DOM数据结构
                  const imageData: DomImageData = {
                    rect: {
                      x: selectionBounds.x,
                      y: selectionBounds.y,
                      width: selectionBounds.w,
                      height: selectionBounds.h
                    },
                    naturalWidth: width,  // OCR处理的原始图像宽度
                    naturalHeight: height // OCR处理的原始图像高度
                  }
                  
                  sendDebugToTerminal('🔄 使用新算法映射GPT错误坐标...')
                  sendDebugToTerminal(`📐 选区边界: (${selectionBounds.x.toFixed(1)}, ${selectionBounds.y.toFixed(1)}, ${selectionBounds.w.toFixed(1)}×${selectionBounds.h.toFixed(1)})`)
                  sendDebugToTerminal(`🖼️ OCR图像尺寸: ${width}×${height}`)
                  
                  // 对每个错误应用新的坐标映射算法
                  return errorAnalysisResult.result.results.map((error, index) => {
                    // 使用 pixelBoxToPageBox 进行单个框的转换
                    const mappedBox = pixelBoxToPageBox(
                      {
                        id: error.id,
                        x: error.bbox.x,
                        y: error.bbox.y,
                        w: error.bbox.w,
                        h: error.bbox.h
                      },
                      imageData,
                      editor
                    )
                    
                    sendDebugToTerminal(`  📍 错误 ${error.id}: 像素(${error.bbox.x},${error.bbox.y},${error.bbox.w}×${error.bbox.h}) → page(${mappedBox.x.toFixed(1)},${mappedBox.y.toFixed(1)},${mappedBox.w.toFixed(1)}×${mappedBox.h.toFixed(1)})`)
                    
                    // 验证映射结果
                    if (isNaN(mappedBox.x) || isNaN(mappedBox.y)) {
                      console.warn(`⚠️ 错误 ${error.id} 映射失败，使用原始坐标`)
                      return error
                    }
                    
                    return {
                      ...error,
                      bbox: {
                        x: mappedBox.x,
                        y: mappedBox.y,
                        w: mappedBox.w,
                        h: mappedBox.h
                      },
                      center: {
                        x: mappedBox.x + mappedBox.w / 2,
                        y: mappedBox.y + mappedBox.h / 2
                      }
                    }
                  })
                })()
                
                // 🎬 使用智能动画标记代替静态标记
                sendDebugToTerminal('🎬 使用智能动画标记错误...')
                errorMarkShapeIds = markErrorsWithAnimation(editor, convertedErrors, 300)
                
                sendDebugToTerminal(`✅ 创建了 ${errorMarkShapeIds.length} 个智能动画错误标记`)
                
                // 立即更新状态以确保错误分析结果可用
                const newState = {
                  lastErrorAnalysis: { success: true, result: errorAnalysisResult.result, processingTime: 0 },
                  errorMarkShapeIds: [...ocrState.errorMarkShapeIds, ...errorMarkShapeIds]
                };
                
                // 同步更新本地状态
                setOCRState(prev => ({ ...prev, ...newState }));
                
                // 通知状态更新
                updateOCRState(newState)
              } else {
                updateOCRState({
                  lastErrorAnalysis: { success: true, result: errorAnalysisResult.result, processingTime: 0 }
                })
              }
            } else {
              addToast({
                id: 'no-errors-found',
                title: 'Error analysis completed',
                description: 'No errors found in handwriting content',
                severity: 'success'
              })
            }
          }
        } catch (analysisError) {
          console.error('错误分析失败:', analysisError)
          addToast({
            id: 'error-analysis-failed',
                      title: 'Error analysis failed',
          description: 'Unable to analyze handwriting errors, please try again later',
            severity: 'warning'
          })
        }
      }

      // 新增：第三阶段智能建议自动生成
      let suggestionPlacements: SuggestionPlacement[] = []
      let spatialGrid: SpatialGrid | null = null

      if (options.enableSmartSuggestions !== false && errorAnalysisResult?.result?.hasErrors) {
        updateOCRState({
          progress: 98,
          currentStep: 'Generating smart suggestions...'
        })

        try {
          const { placements, grid } = generateSmartSuggestionLayout(
            errorAnalysisResult.result.results,
            selectionBounds
          )
          
          suggestionPlacements = placements
          spatialGrid = grid

          console.log('🎯 智能建议数据准备完成 - 建议数量:', placements.length)

          // 更新错误信息到每个建议卡片
          if (suggestionPlacements.length > 0) {
            console.log('✅ 成功准备智能建议数据，可供前端直接使用')
          }
        } catch (suggestionError) {
          console.error('生成智能建议失败:', suggestionError)
        }
      }

      updateOCRState({
        progress: 100,
        currentStep: 'Processing completed',
        lastResult: ocrResult,
        lastSelectionBounds: selectionBounds,
        lastErrorAnalysis: errorAnalysisResult,
        errorMarkShapeIds: errorMarkShapeIds,
        
        // 更新智能建议状态
        suggestionPlacements: suggestionPlacements,
        spatialGrid: spatialGrid,
        // 注意：suggestionsVisible保持为false，由界面组件控制显示时机
        suggestionsVisible: false,
        
        isProcessing: false
      })
      
      // 如果启用了自动显示建议且存在错误，直接使用当前的errorAnalysisResult
      if (options.autoShowSuggestions !== false && errorAnalysisResult?.result?.hasErrors) {
        console.log('🎯 准备自动显示智能建议...')
        console.log(`📊 检测到${errorAnalysisResult.result.results.length}个错误，将在动画完成后显示`)
        
        // 保存错误分析结果的引用，确保不受状态更新影响
        const currentErrorAnalysis = errorAnalysisResult;
        
                  // 延迟足够时间让动画标记完成
          setTimeout(() => {
            console.log('🎬 准备显示智能建议...')
            console.log(`📊 使用已缓存的错误分析结果: ${currentErrorAnalysis.result.results.length}个错误`)
            
            // 直接创建建议内容，不依赖于ocrState中的lastErrorAnalysis
            try {
              // 获取当前选区边界 - 直接使用传入的selectionBounds参数，不依赖状态
              // 注意：selectionBounds在此作用域内一定存在，因为它是参数
              console.log(`📐 使用确认存在的选区边界: ${JSON.stringify(selectionBounds)}`)
            
            // 创建手写建议内容shapes
            const suggestionShapeIds: TLShapeId[] = [];
            const hintMapping = new Map<string, string>(); // 临时存储映射
            
            for (let i = 0; i < currentErrorAnalysis.result.results.length; i++) {
              const error = currentErrorAnalysis.result.results[i];
              
              // 计算建议内容位置（在选区下方）
              const contentX = selectionBounds.x;
              const contentY = selectionBounds.y + selectionBounds.h + 20 + (i * 60);
              
              // 创建手写建议内容 - 模拟用户手写样式
              const suggestionText = `Suggestion: ${error.suggestion} (${error.explanation})`;
              
              try {
                // 使用新的渐变文本方法
                const textId = createFadeInText(
                  editor,
                  suggestionText,
                  contentX,
                  contentY,
                  {
                    font: 'draw',
                    size: 'l',
                    color: 'green',
                    duration: 1200,
                    delay: i * 300
                  }
                );
                
                // 存储创建的ID用于后续清理
                suggestionShapeIds.push(textId);
                
                // 存储映射关系
                hintMapping.set(textId, error.id);
                
                console.log(`✅ 创建手写建议内容 ${i + 1}: "${suggestionText.substring(0, 50)}${suggestionText.length > 50 ? '...' : ''}", 位置(${contentX}, ${contentY})`);
              } catch (shapeError) {
                console.error(`❌ 创建手写建议内容 ${i + 1} 失败: ${shapeError}`);
              }
            }
            
            // 更新状态，记录创建的shapes
            updateOCRState({
              suggestionsVisible: true,
              errorMarkShapeIds: [...ocrState.errorMarkShapeIds, ...suggestionShapeIds],
              hintShapeMapping: hintMapping
            });
            
            console.log(`✅ 手写建议显示成功: 创建了${suggestionShapeIds.length}个手写shapes`);
            
            addToast({
              id: 'smart-suggestions-shown',
              title: 'Handwriting suggestions displayed',
              description: `Generated handwriting suggestions for ${currentErrorAnalysis.result.results.length} errors`,
              severity: 'success'
            });
            
          } catch (error) {
            console.error(`❌ 显示手写建议失败: ${error}`);
          }
        }, 1800); // 给足够时间让动画标记完成
      }

      // 显示错误分析结果通知
      if (errorAnalysisResult?.result) {
        // 显示分析结果通知
        addToast({
          id: 'error-analysis-result',
          title: errorAnalysisResult.result.hasErrors 
            ? `Found ${errorAnalysisResult.result.results.length} errors` 
            : 'Great job! No errors found',
          description: errorAnalysisResult.result.hasErrors
            ? `Detected errors in "${errorAnalysisResult.result.originalContent.substring(0, 30)}${errorAnalysisResult.result.originalContent.length > 30 ? '...' : ''}"`
            : 'Your handwriting is correct',
          severity: errorAnalysisResult.result.hasErrors ? 'warning' : 'success'
        })
      }
      
      // 自动朗读OCR和错误分析结果
      if (options.enableTTS) {
        if (ocrResult) {
          // 等待一小段时间让界面更新
          setTimeout(() => {
            // 只有当有错误分析结果时才朗读错误解释
            if (errorAnalysisResult && errorAnalysisResult.result && errorAnalysisResult.result.hasErrors) {
              // 直接朗读错误解释，不朗读OCR内容
              speakErrorAnalysis(errorAnalysisResult)
            } else {
              // 如果没有错误或错误分析结果表示没有错误，朗读表扬短语
              speakContent("Well done! You got it all right.", "excited")
            }
          }, 1000)
        }
      }

      return {
        success: true,
        result: ocrResult,
        processingTime: Date.now() - startTime
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      
      updateOCRState({
        isProcessing: false,
        error: errorMessage,
        // 重置第三阶段状态
        suggestionPlacements: [],
        spatialGrid: null,
        suggestionsVisible: false
      })

      addToast({
        id: 'ocr-error',
        title: 'OCR processing failed',
        description: errorMessage,
        severity: 'error'
      })

      return {
        success: false,
        error: errorMessage,
        processingTime: Date.now() - startTime
      }
    }
  }, [editor, addToast, options, defaultPreprocessingOptions, updateOCRState, generateSmartSuggestionLayout, speakOCRResult, speakErrorAnalysis])

  /**
   * 处理整个画布
   */
  const processEntireCanvas = useCallback(async (): Promise<OCRProcessingResult> => {
    try {
      updateOCRState({
        isProcessing: true,
        progress: 0,
        currentStep: 'Preparing to process entire canvas...',
        error: null
      })

      // 获取画布上的所有形状
      const allShapes = editor.getCurrentPageShapes()
      
      if (allShapes.length === 0) {
        throw new Error('画布上没有内容可以识别')
      }

      // 选择所有形状
      editor.selectAll()
      
      // 然后执行选中区域的处理
      return await processSelectedShapes()

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      
      updateOCRState({
        isProcessing: false,
        error: errorMessage
      })

      return {
        success: false,
        error: errorMessage,
        processingTime: 0
      }
    }
  }, [editor, processSelectedShapes, updateOCRState])

  /**
   * 获取历史OCR结果
   */
  const getOCRHistory = useCallback((): OCRResult[] => {
    return getAllOCRResultsFromLocalStorage()
  }, [])

  /**
   * 重置OCR状态
   */
  const resetOCRState = useCallback(() => {
    setOCRState({
      isProcessing: false,
      progress: 0,
      currentStep: '',
      lastResult: null,
      lastSelectionBounds: null,
      lastErrorAnalysis: null,
      errorMarkShapeIds: [],
      
      // 重置第三阶段状态
      suggestionPlacements: [],
      spatialGrid: null,
      suggestionsVisible: false,
      hintShapeMapping: new Map(),
      
      error: null
    })
  }, [])

  /**
   * 清除画布上的错误标记
   */
  const clearErrorMarksFromCanvas = useCallback(() => {
    if (ocrState.errorMarkShapeIds.length > 0) {
      try {
        clearErrorMarks(editor, ocrState.errorMarkShapeIds)
        updateOCRState({
          errorMarkShapeIds: []
        })
        
        addToast({
          id: 'error-marks-cleared',
                  title: 'Clear completed',
        description: 'Error marks on canvas have been cleared',
          severity: 'info'
        })
      } catch (error) {
        console.error('清除错误标记失败:', error)
        addToast({
          id: 'clear-error-marks-failed',
                  title: 'Clear failed',
        description: 'Unable to clear error marks',
          severity: 'warning'
        })
      }
    }
  }, [editor, ocrState.errorMarkShapeIds, updateOCRState, addToast])

  /**
   * 将最新的 OCR 结果挂载到 window.ocrResults，供 FullDataExporter 使用。
   */
  useEffect(() => {
    if (typeof window !== 'undefined' && ocrState.lastResult) {
      // 1. 公开 OCR 结果
      ;(window as any).ocrResults = ocrState.lastResult.charBoxes || []

      // 2. 在页面上放置 / 更新 OCR 图片元素，方便 FullDataExporter 获取 DOM 几何数据
      try {
        const imgId = 'scan'
        const base64Img = ocrState.lastResult.originalImage || ocrState.lastResult.preprocessedImage
        const { imageWidth, imageHeight } = ocrState.lastResult.metadata

        // 获取或创建 <img>
        let img = document.getElementById(imgId) as HTMLImageElement | null
        if (!img) {
          img = document.createElement('img')
          img.id = imgId
          img.setAttribute('data-ocr-image', 'true')
          img.style.position = 'absolute'
          img.style.pointerEvents = 'none'
          img.style.opacity = '0.001' // 几乎不可见，避免干扰操作
          document.body.appendChild(img)
        }

        // 设置图片源
        if (base64Img) {
          img.src = base64Img
        }

        // 计算图片在屏幕上的位置与尺寸（匹配选区范围）
        if (ocrState.lastSelectionBounds && editor) {
          const { x, y, w, h } = ocrState.lastSelectionBounds
          const camera = editor.getCamera()
          const screenX = (x - camera.x) * camera.z
          const screenY = (y - camera.y) * camera.z
          const screenW = w * camera.z
          const screenH = h * camera.z

          img.style.left = `${screenX}px`
          img.style.top = `${screenY}px`
          img.style.width = `${screenW}px`
          img.style.height = `${screenH}px`
        } else {
          // fallback：如果没有选区信息，就使用 natural 尺寸放在左上角
          img.style.left = '0px'
          img.style.top = '0px'
          img.style.width = `${imageWidth}px`
          img.style.height = `${imageHeight}px`
        }
      } catch (err) {
        console.error('❌ 注入 OCR 图片元素失败:', err)
      }
    }
  }, [ocrState.lastResult, ocrState.lastSelectionBounds, editor])

  return {
    // 状态
    ocrState,
    
    // 操作函数
    processSelectedShapes,
    processEntireCanvas,
    getOCRHistory,
    resetOCRState,
    clearErrorMarksFromCanvas,
    
    // 新增：第三阶段智能建议函数
    showSmartSuggestions,
    hideSmartSuggestions,
    toggleSmartSuggestions,
    generateSmartSuggestionLayout,
    
    // 便捷属性
    isProcessing: ocrState.isProcessing,
    progress: ocrState.progress,
    currentStep: ocrState.currentStep,
    lastResult: ocrState.lastResult,
    lastErrorAnalysis: ocrState.lastErrorAnalysis,
    errorMarkShapeIds: ocrState.errorMarkShapeIds,
    
    // 新增：第三阶段状态属性
    suggestionPlacements: ocrState.suggestionPlacements,
    spatialGrid: ocrState.spatialGrid,
    suggestionsVisible: ocrState.suggestionsVisible,
    hintShapeMapping: ocrState.hintShapeMapping,
    
    error: ocrState.error,
    
    // 添加TTS相关API
    speakContent,
    speakOCRResult,
    speakErrorAnalysis,
    ttsState: {
      isPlaying: tts.isPlaying,
      isLoading: tts.isLoading,
      currentText: tts.currentText,
      error: tts.error
    },
    ttsControls: {
      stop: tts.stop,
      pause: tts.pause,
      resume: tts.resume
    }
  }
}

/**
 * 验证并修正GPT返回的坐标
 * 确保GPT使用的是OCR提供的精确坐标
 */
function validateAndFixGPTCoordinates(
  gptErrors: any[],
  ocrCharBoxes: any[]
): any[] {
  const charMap = new Map(ocrCharBoxes.map((char: any) => [char.id, char]))
  
  return gptErrors.map(error => {
    const ocrChar = charMap.get(error.id)
    
    if (!ocrChar) {
      console.warn(`⚠️ GPT错误引用了不存在的字符ID: ${error.id}`)
      return error
    }
    
    // 检查GPT的坐标是否与OCR坐标匹配
    const coordsMatch = (
      error.bbox.x === ocrChar.bbox.x &&
      error.bbox.y === ocrChar.bbox.y &&
      error.bbox.w === ocrChar.bbox.w &&
      error.bbox.h === ocrChar.bbox.h
    )
    
    if (!coordsMatch) {
      console.warn(`🔧 修正GPT坐标: ${error.id}`)
      console.warn(`  GPT坐标: (${error.bbox.x},${error.bbox.y},${error.bbox.w}×${error.bbox.h})`)
      console.warn(`  OCR坐标: (${ocrChar.bbox.x},${ocrChar.bbox.y},${ocrChar.bbox.w}×${ocrChar.bbox.h})`)
      
      // 使用OCR的精确坐标替换GPT的坐标
      return {
        ...error,
        bbox: { ...ocrChar.bbox },
        center: { ...ocrChar.center }
      }
    }
    
    return error
  })
}

/**
 * 从画布中获取图片形状的精确位置
 * 这个函数可以用于获取更准确的图片位置信息
 */
function getImageShapeData(editor: any, selectionBounds: any, width: number, height: number): DomImageData | null {
  try {
    // 尝试找到图片DOM元素
    const img: HTMLImageElement | null = document.querySelector('#scan') || 
                                        document.querySelector('img[data-ocr-image="true"]')
    
    if (!img || !img.complete || img.naturalWidth === 0) {
      return null
    }
    
    // 优先从选中的形状中找到图片形状
    const selectedShapes = editor.getSelectedShapes()
    const imageShape = selectedShapes.find((shape: any) => 
      shape.type === 'image' || 
      (shape as any).props?.assetId ||
      (shape as any).props?.url
    )
    
    if (imageShape) {
      const shapePageBounds = editor.getShapePageBounds(imageShape)
      if (shapePageBounds) {
        return {
          rect: {
            x: shapePageBounds.x,
            y: shapePageBounds.y,
            width: shapePageBounds.w,
            height: shapePageBounds.h,
          },
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        }
      }
    }
    
    // 回退：使用选区坐标
    return {
      rect: {
        x: selectionBounds.x,
        y: selectionBounds.y,
        width: selectionBounds.w,
        height: selectionBounds.h
      },
      naturalWidth: width,
      naturalHeight: height
    }
  } catch (error) {
    console.error('获取图片数据失败:', error)
    return null
  }
}

/**
 * 将Blob转换为Canvas的辅助函数
 */
async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      
      resolve(canvas)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
} 