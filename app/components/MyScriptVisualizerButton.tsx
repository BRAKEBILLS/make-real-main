'use client'

import React, { useState } from 'react'
import { 
  TldrawUiButton, 
  TldrawUiButtonLabel, 
  TldrawUiIcon,
  useEditor, 
  useToasts,
  createShapeId,
  TLShapeId,
  toRichText
} from 'tldraw'
import { markErrorsWithAnimation } from '../lib/canvasErrorMarking'
import { HandwritingError } from '../types/ocr'
import { createFadeInText } from '../lib/fadeTextAnimation'

export function MyScriptVisualizerButton() {
  const editor = useEditor()
  const { addToast } = useToasts()
  const [isVisualized, setIsVisualized] = useState(false)
  const [visualizedShapeIds, setVisualizedShapeIds] = useState<TLShapeId[]>([])

  // 🎯 简化版：直接分析手写形状并发送给GPT
  const analyzeHandwritingShapes = async () => {
    const shapeIds: TLShapeId[] = []
    
    try {
      // 清除现有的可视化
      if (isVisualized) {
        clearVisualization()
        return
      }

      // 获取所有手写形状
      const allDrawShapes = editor.getCurrentPageShapes().filter(s => s.type === 'draw')
      
      if (allDrawShapes.length === 0) {
        addToast({
          icon: 'warning-triangle',
          title: '没有找到手写内容',
          description: '请先在画布上绘制内容'
        })
        return
      }

      console.log('📝 发现手写形状:', allDrawShapes.length)

      // 🎯 只显示灰色虚线矩形（这些就是我们需要的精确坐标）
      const handwritingCoordinates = allDrawShapes.map((shape, index) => {
        const bounds = editor.getShapePageBounds(shape.id)
        if (bounds) {
          // 🎯 验证边界框尺寸，确保宽度和高度都是正数
          const minSize = 10 // 最小尺寸，防止创建0尺寸的形状
          const validatedBounds = {
            x: bounds.x,
            y: bounds.y,
            w: Math.max(bounds.w, minSize),
            h: Math.max(bounds.h, minSize)
          }

          console.log(`🔍 形状 ${index + 1} 边界框验证:`, {
            原始bounds: bounds,
            验证后bounds: validatedBounds,
            是否需要调整: bounds.w < minSize || bounds.h < minSize
          })

          // 创建灰色虚线边界框
          const refRectId = createShapeId()
          editor.createShape({
            id: refRectId,
            type: 'geo',
            x: validatedBounds.x,
            y: validatedBounds.y,
            props: {
              geo: 'rectangle',
              w: validatedBounds.w,
              h: validatedBounds.h,
              color: 'grey',
              fill: 'none',
              dash: 'dotted',
              size: 's',
            }
          })
          shapeIds.push(refRectId)

          // 🎯 修改：使用c00x格式的标签
          const labelId = `c${String(index + 1).padStart(3, '0')}`  // c001, c002, c003...
          
          const refTextId = createShapeId()
          editor.createShape({
            id: refTextId,
            type: 'text',
            x: bounds.x,
            y: bounds.y - 25,
            props: {
              richText: toRichText(labelId),
              size: 's',
              color: 'grey',
              font: 'mono',
              textAlign: 'start',
              w: 120,
              autoSize: true,
            }
          })
          shapeIds.push(refTextId)

          // 🎯 返回GPT兼容的坐标数据格式
          return {
            id: labelId,                    // c001, c002, c003...
            shapeId: shape.id,             // tldraw原始shape ID
            type: 'handwritten_content',
            char: `手写区域${index + 1}`,    // 描述信息
            confidence: 1.0,               // 默认置信度
            bbox: {                        // GPT期待的bbox格式
              x: bounds.x,
              y: bounds.y,
              w: bounds.w,
              h: bounds.h
            },
            center: {                      // GPT期待的center格式
              x: bounds.x + bounds.w / 2,
              y: bounds.y + bounds.h / 2
            },
            source: 'tldraw_native_coordinates',
            label: labelId                 // 额外保存label用于匹配
          }
        }
        return null
      }).filter(Boolean)

      console.log('🎯 提取的手写坐标:', handwritingCoordinates)

      // 🎯 NEW: 添加详细的坐标验证日志
      console.log('🔍 坐标格式验证报告:')
      console.log('1. 灰色矩形可视化状态:', {
        已创建灰色矩形数量: handwritingCoordinates.length,
        矩形样式: 'grey color, dotted dash, no fill',
        标签格式: handwritingCoordinates.map(c => c.label),
        是否显示标签: true
      })
      
      console.log('2. 坐标数据格式验证:', {
        生成的坐标格式: handwritingCoordinates.map(coord => ({
          id: coord.id,
          label: coord.label,
          bbox: coord.bbox,
          center: coord.center,
          类型: coord.type
        })),
        bbox格式检查: handwritingCoordinates.every(c => 
          c.bbox && typeof c.bbox.x === 'number' && typeof c.bbox.y === 'number' && 
          typeof c.bbox.w === 'number' && typeof c.bbox.h === 'number'
        ),
        center格式检查: handwritingCoordinates.every(c => 
          c.center && typeof c.center.x === 'number' && typeof c.center.y === 'number'
        ),
        ID格式检查: handwritingCoordinates.every(c => 
          c.id && c.id.startsWith('c') && c.id.length === 4
        )
            })
            
      // 🎯 NEW: 生成整个画布的截图（而不仅仅是手写内容）
      const fullCanvasImage = await generateFullCanvasScreenshot()
      
      // 🎯 NEW: 单独保存画布截图到 /data/canvas-screenshots/
      const screenshotFilename = await saveCanvasScreenshot(fullCanvasImage, handwritingCoordinates)
      
      // 🎯 NEW: 保存手写区域坐标到 /data/coordinates/
      const coordinatesFilename = await saveHandwritingCoordinates(handwritingCoordinates)
      
      // 🎯 直接发送给GPT分析（使用灰色矩形坐标 + 完整画布截图）
      const gptAnalysis = await analyzeWithGPT(fullCanvasImage, handwritingCoordinates)
      
      // 保存分析结果到 /data/gpt-analysis/
      await saveAnalysisResults(handwritingCoordinates, gptAnalysis, fullCanvasImage, screenshotFilename)

      setVisualizedShapeIds(shapeIds)
      setIsVisualized(true)

      addToast({
        icon: 'check',
        title: '手写分析完成',
        description: `已分析${handwritingCoordinates.length}个手写区域，GPT分析${gptAnalysis.result?.hasErrors ? '发现' : '未发现'}错误`
      })

      // 如果发现错误，使用动画标记系统
      if (gptAnalysis.result?.hasErrors) {
        console.log(`🚨 GPT发现 ${gptAnalysis.result.results.length} 个错误`)
        
        // 🎬 将GPT结果转换为HandwritingError格式并使用动画标记
        const convertedErrors: HandwritingError[] = gptAnalysis.result.results.map((error: any) => {
          // 查找匹配的原始坐标
          const matchedCoordinate = handwritingCoordinates.find(coord => coord.id === error.id)
          
          return {
            id: error.id,
            bbox: matchedCoordinate ? matchedCoordinate.bbox : error.bbox,
            center: matchedCoordinate ? matchedCoordinate.center : error.center,
            errorType: error.errorType,
            suggestion: error.suggestion,
            explanation: error.explanation,
            action: error.action || 'circle' // 默认使用圆圈动画
          }
        })
        
        // 🎬 使用现有的动画标记系统
        const animationShapeIds = markErrorsWithAnimation(editor, convertedErrors, 300)
        setVisualizedShapeIds(prev => [...prev, ...animationShapeIds])

        // 🌟 新增：自动生成绿色手写建议
        console.log('🌟 开始生成绿色手写建议...')
        const suggestionShapeIds: TLShapeId[] = []

        // 延迟一段时间让错误动画先完成
        setTimeout(() => {
          for (let i = 0; i < convertedErrors.length; i++) {
            const error = convertedErrors[i]
            
            // 计算建议位置 - 在错误位置旁边
            const contentX = error.center.x + 60 // 错误右侧
            const contentY = error.center.y + (i * 30) // 避免重叠
            
            // 创建建议文本
            const suggestionText = `✓ ${error.suggestion}`
            
            try {
              const textId = createFadeInText(
                editor,
                suggestionText,
                contentX,
                contentY,
                {
                  font: 'draw',
                  size: 'm',
                  color: 'green',
                  duration: 1200,
                  delay: i * 300,
                  direction: 'left-to-right'
                }
              )
              
              suggestionShapeIds.push(textId)
              console.log(`✅ 创建绿色建议 ${i + 1}: "${suggestionText}"`)
            } catch (shapeError) {
              console.error(`❌ 创建建议 ${i + 1} 失败:`, shapeError)
            }
          }
          
          // 将建议shapes加入管理列表
          setVisualizedShapeIds(prev => [...prev, ...suggestionShapeIds])
        }, 1000) // 等待错误动画完成
      }

    } catch (error) {
      console.error('❌ 手写分析失败:', error)
      
      // 🎯 分析失败时清除部分创建的可视化元素
      if (shapeIds.length > 0) {
        console.log('🧹 分析失败，清除已创建的可视化元素...')
        shapeIds.forEach(id => {
          try {
            editor.deleteShape(id)
          } catch (deleteError) {
            console.warn(`删除部分可视化元素失败: ${id}`, deleteError)
          }
        })
        setVisualizedShapeIds([])
        setIsVisualized(false)
      }
      
      addToast({
        icon: 'warning-triangle',
        title: '分析失败',
        description: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  // 🎯 清除所有可视化元素（灰色矩形、标签、错误标记）
  const clearVisualization = () => {
    try {
      console.log('🧹 开始清除可视化...')
      console.log('需要删除的形状数量:', visualizedShapeIds.length)
      console.log('需要删除的形状IDs:', visualizedShapeIds)
      
      let deletedCount = 0
      let failedCount = 0
      
      visualizedShapeIds.forEach((id, index) => {
        try {
          editor.deleteShape(id)
          deletedCount++
          console.log(`✅ 删除形状 ${index + 1}/${visualizedShapeIds.length}: ${id}`)
        } catch (error) {
          failedCount++
          console.warn(`❌ 删除形状 ${id} 失败:`, error)
        }
      })
      
      // 清除状态
      setVisualizedShapeIds([])
      setIsVisualized(false)
      
      console.log('🧹 清除完成:', {
        总形状数: visualizedShapeIds.length,
        成功删除: deletedCount,
        删除失败: failedCount
      })
      
      addToast({
        icon: 'check',
        title: '清除可视化',
        description: `已清除 ${deletedCount} 个可视化元素${failedCount > 0 ? `，${failedCount} 个删除失败` : ''}`
      })
      
    } catch (error) {
      console.error('❌ 清除可视化失败:', error)
      addToast({
        icon: 'warning-triangle',
        title: '清除失败',
        description: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  // 🎯 NEW: 生成整个画布的截图
  const generateFullCanvasScreenshot = async (): Promise<string> => {
    try {
      console.log('📸 使用editor.toImage()生成完整画布截图...')

      // 获取当前页面的所有形状
      const allShapes = editor.getCurrentPageShapes()
      
      if (allShapes.length === 0) {
        throw new Error('画布上没有任何内容')
      }

      // 清除选择以确保截图不包含选择高亮
      editor.selectNone()
      
      // 🎯 使用官方推荐的editor.toImage()方法
      const { blob } = await editor.toImage(allShapes.map(s => s.id), {
        format: 'png',              // 使用PNG格式，OpenAI支持
        scale: 2,                   // 高分辨率 (2x)
        background: true,           // 包含背景
        darkMode: false,           // 使用浅色模式便于GPT识别
        padding: 20                // 添加一些边距
      })

      if (!blob) {
        throw new Error('画布图像导出失败')
      }

      // 将Blob转换为Base64 Data URL
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          
          console.log('✅ 画布截图生成成功', {
            形状数量: allShapes.length,
            图像大小: `${Math.round(blob.size / 1024)}KB`,
            格式: 'PNG (OpenAI官方支持)',
            Base64长度: `${Math.round(dataUrl.length / 1024)}KB`
          })
          
          resolve(dataUrl)
        }
        reader.onerror = () => {
          reject(new Error('Blob转换为Base64失败'))
        }
        reader.readAsDataURL(blob)
        })

    } catch (error) {
      console.error('❌ 生成画布截图失败:', error)
      throw error
    }
  }

  // 🎯 NEW: 保存画布截图到 /data/canvas-screenshots/
  const saveCanvasScreenshot = async (fullCanvasImage: string, handwritingCoordinates: any[]): Promise<string> => {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
      const screenshotFilename = `canvas_screenshot_${timestamp}.png`
      
      console.log('📁 保存画布截图到 /data/canvas-screenshots/...')
      
      // 创建包含坐标信息的元数据
      const screenshotData = {
        timestamp: new Date().toISOString(),
        type: 'canvas_screenshot_with_coordinates',
        screenshot: {
          filename: screenshotFilename,
          format: '原生PNG格式（editor.toImage生成）',
          description: '完整画布截图，使用tldraw官方editor.toImage()方法生成，包含所有绘制内容和灰色虚线标记'
        },
        handwritingCoordinates: {
          count: handwritingCoordinates.length,
          coordinates: handwritingCoordinates
        },
        metadata: {
          captureMethod: 'tldraw_editor_toImage_official_api',
          coordinateSystem: 'tldraw_page_coordinates',
          includes: ['handwritten_content', 'gray_dashed_rectangles', 'coordinate_labels'],
          imageFormat: 'PNG',
          scale: 2,
          background: true,
          padding: 20
        }
      }
      
      // 保存截图文件
      const imageResponse = await fetch('/api/data-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save-file',
          filename: screenshotFilename,
          content: fullCanvasImage,
          type: 'image'
        })
      })

      if (!imageResponse.ok) {
        throw new Error(`保存画布截图失败: ${imageResponse.statusText}`)
      }

      // 保存对应的元数据JSON文件
      const metadataFilename = `canvas_screenshot_${timestamp}_metadata.json`
      const metadataResponse = await fetch('/api/data-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save-file',
          filename: metadataFilename,
          content: JSON.stringify(screenshotData, null, 2),
          type: 'json'
        })
      })

      if (!metadataResponse.ok) {
        throw new Error(`保存截图元数据失败: ${metadataResponse.statusText}`)
      }

      console.log(`✅ 画布截图已保存: /data/canvas-screenshots/${screenshotFilename}`)
      console.log(`✅ 截图元数据已保存: /data/canvas-screenshots/${metadataFilename}`)
      
      return screenshotFilename

    } catch (error) {
      console.error('❌ 保存画布截图失败:', error)
      throw error
    }
  }

  // 🎯 NEW: 保存手写区域坐标到 /data/coordinates/
  const saveHandwritingCoordinates = async (handwritingCoordinates: any[]): Promise<string> => {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
      const coordinatesFilename = `coordinates_${timestamp}.json`
      
      console.log('📁 保存手写区域坐标到 /data/coordinates/...')
      
      // 🎯 创建详细的坐标数据
      const coordinatesData = {
        timestamp: new Date().toISOString(),
        type: 'handwriting_coordinates_with_labels',
        description: '从tldraw获取的灰色矩形坐标，包含GPT识别所需的label和坐标信息',
        
        // 坐标总结
        summary: {
          totalCoordinates: handwritingCoordinates.length,
          coordinateSystem: 'tldraw_native_page_coordinates',
          labelFormat: 'c00x (c001, c002, c003...)',
          gptCompatible: true
        },
        
        // 🎯 详细的坐标列表
        coordinates: handwritingCoordinates.map((coord, index) => ({
          // GPT匹配信息
          label: coord.label,           // c001, c002, c003...
          id: coord.id,                // 同label，GPT将使用此ID匹配错误
          
          // 位置信息
          bbox: coord.bbox,            // GPT期待的bbox格式 {x, y, w, h}
          center: coord.center,        // GPT期待的center格式 {x, y}
          
          // 描述信息
          char: coord.char,            // 手写区域描述
          type: coord.type,            // handwritten_content
          confidence: coord.confidence, // 置信度
          
          // 原始数据
          originalShapeId: coord.shapeId,    // tldraw原始shape ID
          source: coord.source,              // 坐标来源
          index: index + 1,                  // 序号
          
          // 验证信息
          isValidForGPT: {
            hasId: !!coord.id,
            hasBbox: !!coord.bbox,
            hasCenter: !!coord.center,
            idFormat: coord.id?.startsWith('c') && coord.id?.length === 4
          }
        })),
        
        // GPT识别相关信息
        gptAnalysisInfo: {
          description: 'GPT将使用这些坐标进行错误识别',
          expectedIdFormat: 'c001, c002, c003...',
          returnFormat: '当GPT识别到错误时，会返回对应的ID（如c007）',
          matchingProcess: 'GPT返回的错误ID将与此文件中的坐标进行匹配，以在画布上标记错误位置'
        }
      }

      // 保存坐标文件
      const response = await fetch('/api/data-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save-file',
          filename: coordinatesFilename,
          content: JSON.stringify(coordinatesData, null, 2),
          type: 'json'
        })
      })

      if (!response.ok) {
        throw new Error(`保存坐标数据失败: ${response.statusText}`)
      }

      console.log(`✅ 手写区域坐标已保存: /data/coordinates/${coordinatesFilename}`)
      console.log(`📊 坐标数量: ${handwritingCoordinates.length}`)
      console.log(`🏷️ Label格式: ${handwritingCoordinates.map(c => c.label).join(', ')}`)
      
      return coordinatesFilename

    } catch (error) {
      console.error('❌ 保存手写区域坐标失败:', error)
      throw error
    }
  }

  // 🎯 简化版GPT分析：使用完整画布截图 + 灰色矩形坐标
  const analyzeWithGPT = async (fullCanvasImage: string, handwritingCoordinates: any[]) => {
    try {
      console.log('🤖 使用GPT分析完整画布内容...')
      
      // 🎯 手写区域坐标已经是GPT兼容格式，直接使用
      const charBoxes = handwritingCoordinates.map(area => ({
        id: area.id,           // c001, c002, c003...
        char: area.char,       // 手写区域描述
        confidence: area.confidence,
        bbox: area.bbox,       // 已经是正确的bbox格式
        center: area.center,   // 已经是正确的center格式
        type: area.type,
        description: `手写内容区域 ${area.label}，坐标: (${area.bbox.x}, ${area.bbox.y})`
      }))
      
      const analysisData = {
        image: fullCanvasImage,
        charBoxes: charBoxes,
        fullText: `画布包含${charBoxes.length}个手写区域，请分析整个画布内容并识别错误`,
        // 🎯 新增：提供画布上下文信息
        canvasInfo: {
          type: 'full_canvas_screenshot',
          totalHandwritingAreas: charBoxes.length,
          instruction: 'GPT请分析整个画布截图，重点关注手写区域坐标对应的内容，识别数学、文字或其他错误'
        }
      }

      // 🎯 NEW: 添加GPT坐标格式验证
      console.log('🔍 GPT接收的坐标格式验证:')
      console.log('发送给GPT的characterPositions:', charBoxes.map(char => ({
        id: char.id,
        bbox: char.bbox,
        center: char.center
      })))
      
      console.log('📊 发送给GPT的完整画布数据:', {
        画布截图大小: `${Math.round(fullCanvasImage.length / 1024)}KB`,
        手写区域数量: analysisData.charBoxes.length,
        坐标示例: analysisData.charBoxes[0]?.bbox,
        分析类型: '完整画布截图分析',
        GPT期望格式验证: {
          有ID: charBoxes.every(c => !!c.id),
          有bbox: charBoxes.every(c => !!c.bbox),
          有center: charBoxes.every(c => !!c.center),
          ID格式正确: charBoxes.every(c => c.id?.startsWith('c') && c.id?.length === 4)
        }
      })

      // 🎯 NEW: 添加图像预览功能，帮助调试GPT看到的内容
      console.log('🖼️ 图像预览信息:')
      console.log('📷 图像格式:', fullCanvasImage.startsWith('data:image/png') ? 'PNG ✅' : 
                  fullCanvasImage.startsWith('data:image/svg') ? 'SVG ⚠️' : '未知格式 ❌')
      console.log('💾 Base64长度:', `${Math.round(fullCanvasImage.length / 1024)}KB`)
      console.log('🔗 图像预览URL (可在浏览器中查看):', 
                  fullCanvasImage.length > 100 ? fullCanvasImage.substring(0, 100) + '...' : fullCanvasImage)
      
      // 🎯 提示用户如何查看实际图像
      if (typeof window !== 'undefined') {
        console.log('🎯 调试提示: 复制下面的完整URL到浏览器地址栏查看GPT收到的实际图像:')
        console.log(fullCanvasImage)
      }

      const response = await fetch('/api/handwriting-correction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analysisData)
      })

      if (!response.ok) {
        throw new Error(`GPT画布分析失败: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('🤖 GPT画布分析完成:', {
        成功: result.success,
        有错误: result.result?.hasErrors,
        错误数量: result.result?.results?.length || 0,
        分析类型: '完整画布截图'
      })
      
      return result

    } catch (error) {
      console.error('❌ GPT画布分析失败:', error)
      throw error
    }
  }

  // 保存分析结果  
  const saveAnalysisResults = async (
    handwritingCoordinates: any[], 
    gptAnalysis: any, 
    fullCanvasImage: string,
    screenshotFilename: string
  ) => {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
      const filename = `gpt_analysis_${timestamp}.json`
      
      const analysisData = {
        timestamp: new Date().toISOString(),
        analysisType: 'Full_Canvas_Screenshot_Analysis',
        
        // 🎯 画布截图信息（引用保存的文件）
        canvasScreenshot: {
          description: '完整画布截图，包含所有绘制内容',
          savedFilename: screenshotFilename,
          savedLocation: `/data/canvas-screenshots/${screenshotFilename}`,
          imageSize: `${Math.round(fullCanvasImage.length / 1024)}KB`,
          format: '原生PNG格式（editor.toImage生成）',
          metadataFile: screenshotFilename.replace('.png', '_metadata.json'),
          // 不在分析文件中重复存储图像数据，节省空间
          note: ' 完整图像数据已保存到单独的截图文件中'
        },
        
        // 手写区域坐标（灰色虚线矩形）
        handwritingCoordinates: {
          description: '手写内容的真实tldraw画布坐标',
          count: handwritingCoordinates.length,
          coordinates: handwritingCoordinates
        },
        
        // GPT分析结果
        gptAnalysis: {
          success: gptAnalysis.success,
          hasErrors: gptAnalysis.result?.hasErrors || false,
          originalContent: gptAnalysis.result?.originalContent || '',
          errorCount: gptAnalysis.result?.results?.length || 0,
          errors: gptAnalysis.result?.results || []
        },
        
        // 🎯 更新的总结
        summary: {
          analysisMethod: 'full_canvas_screenshot_with_coordinates',
          totalHandwritingAreas: handwritingCoordinates.length,
          errorsFound: gptAnalysis.result?.results?.length || 0,
          coordinateSystem: 'tldraw_native_page_coordinates',
          screenshotType: 'complete_viewport_capture'
        }
      }

      const response = await fetch('/api/data-directory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'save-file',
          filename: filename,
          content: JSON.stringify(analysisData, null, 2),
          type: 'json'
        })
      })

      if (!response.ok) {
        throw new Error(`保存失败: ${response.statusText}`)
      }

      console.log(`✅ 分析结果已保存: ${filename}`)

    } catch (error) {
      console.error('❌ 保存分析结果失败:', error)
    }
  }

  // 🎯 统一的点击处理函数
  const handleButtonClick = () => {
    if (isVisualized) {
      // 如果当前有可视化，则清除
      clearVisualization()
    } else {
      // 如果没有可视化，则开始分析
      analyzeHandwritingShapes()
    }
  }

  return (
    <TldrawUiButton 
      type="normal" 
      onClick={handleButtonClick}
      style={{
        backgroundColor: isVisualized ? 'var(--color-accent)' : 'var(--color-background)',
        transition: 'background-color 0.2s ease'
      }}
    >
      <TldrawUiIcon 
        icon={isVisualized ? 'cross-2' : 'dot'} 
        label={isVisualized ? '清除可视化' : '开始分析'} 
      />
      <TldrawUiButtonLabel>
        {isVisualized ? '清除分析' : 'AmIWrite'}
      </TldrawUiButtonLabel>
    </TldrawUiButton>
  )
} 