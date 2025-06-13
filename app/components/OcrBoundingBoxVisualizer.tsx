'use client'

import React, { useCallback, useState } from 'react'
import { useEditor, TldrawUiButton, createShapeId, TLShapeId, toRichText } from 'tldraw'
import { mapOcrBoxesToPage } from '../lib/ocrPixelToPageMapping'

/**
 * OCR 边界框可视化组件
 * 
 * 功能：
 * 1. 读取全局 OCR 结果 (window.ocrResults)
 * 2. 使用最新的坐标映射算法将 OCR 像素坐标转换为 tldraw page 坐标
 * 3. 在画布上绘制红色虚线边界框
 * 4. 为每个字符添加 ID 标签
 * 5. 提供清除功能
 */
export function OcrBoundingBoxVisualizer() {
  const editor = useEditor()
  const [isVisualized, setIsVisualized] = useState(false)
  const [visualizedShapeIds, setVisualizedShapeIds] = useState<TLShapeId[]>([])

  // 获取图片数据（复用 FullDataExporter 的逻辑）
  const getImageData = useCallback(() => {
    if (!editor) return null

    const img: HTMLImageElement | null = document.querySelector('#scan') || document.querySelector('img[data-ocr-image="true"]')
    if (!img || !img.complete || img.naturalWidth === 0) {
      return null
    }

    // 优先从选中的形状中找到图片形状
    const selectedShapes = editor.getSelectedShapes()
    const imageShape = selectedShapes.find(shape => 
      shape.type === 'image' || 
      shape.type === 'asset' || 
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
    const selectionBounds = editor.getSelectionPageBounds()
    if (selectionBounds) {
      return {
        rect: {
          x: selectionBounds.x,
          y: selectionBounds.y,
          width: selectionBounds.w,
          height: selectionBounds.h,
        },
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      }
    }

    return null
  }, [editor])

  // 可视化 OCR 边界框
  const visualizeOcrBoxes = useCallback(() => {
    if (!editor) {
      alert('Tldraw 编辑器尚未就绪')
      return
    }

    // 获取 OCR 结果
    const ocrBoxes: any[] = (typeof window !== 'undefined' && (window as any).ocrResults)
      ? (window as any).ocrResults
      : []

    if (ocrBoxes.length === 0) {
      alert('未找到 OCR 结果，请先运行 OCR 识别')
      return
    }

    // 获取图片数据
    const imageData = getImageData()
    if (!imageData) {
      alert('未找到图片数据，请确保选中了包含图片的区域')
      return
    }

    console.log('🎯 开始可视化 OCR 边界框...')
    console.log('OCR 框数量:', ocrBoxes.length)
    console.log('图片数据:', imageData)

    try {
      // 使用最新的坐标映射算法
      const mappedPageBoxes = mapOcrBoxesToPage(ocrBoxes, imageData, editor)
      console.log('映射后的 page 坐标:', mappedPageBoxes)

      const newShapeIds: TLShapeId[] = []

      // 为每个 OCR 框创建可视化
      mappedPageBoxes.forEach((box, index) => {
        if (isNaN(box.x) || isNaN(box.y) || isNaN(box.w) || isNaN(box.h)) {
          console.warn(`跳过无效的边界框 ${box.id}:`, box)
          return
        }

        // 创建边界框矩形
        const rectId = createShapeId()
        editor.createShape({
          id: rectId,
          type: 'geo',
          x: box.x,
          y: box.y,
          props: {
            geo: 'rectangle',
            w: box.w,
            h: box.h,
            dash: 'dashed',
            color: 'red',
            fill: 'none',
            size: 's',
          },
          meta: {
            isOcrVisualization: true,
            ocrId: box.id,
            ocrIndex: index
          }
        })
        newShapeIds.push(rectId)

        // 创建字符 ID 标签
        const labelId = createShapeId()
        const ocrChar = ocrBoxes[index]?.char || ocrBoxes[index]?.text || box.id
        editor.createShape({
          id: labelId,
          type: 'text',
          x: box.x,
          y: box.y - 25, // 标签位于框的上方
          props: {
            richText: toRichText(`${box.id}: ${ocrChar}`),
            color: 'red',
            size: 's',
            font: 'mono',
          },
          meta: {
            isOcrVisualization: true,
            ocrId: box.id,
            ocrIndex: index
          }
        })
        newShapeIds.push(labelId)
      })

      setVisualizedShapeIds(newShapeIds)
      setIsVisualized(true)

      console.log(`✅ 成功创建了 ${newShapeIds.length} 个可视化形状`)
      alert(`成功可视化了 ${mappedPageBoxes.length} 个 OCR 边界框`)

    } catch (error) {
      console.error('可视化失败:', error)
      alert('可视化失败，请查看控制台错误信息')
    }
  }, [editor, getImageData])

  // 清除可视化
  const clearVisualization = useCallback(() => {
    if (!editor || visualizedShapeIds.length === 0) return

    try {
      // 删除所有可视化形状
      editor.deleteShapes(visualizedShapeIds)
      
      // 也删除任何带有 isOcrVisualization meta 的形状（防止遗漏）
      const allShapes = editor.getCurrentPageShapes()
      const ocrVisualizationShapes = allShapes.filter(shape => 
        shape.meta?.isOcrVisualization === true
      )
      if (ocrVisualizationShapes.length > 0) {
        editor.deleteShapes(ocrVisualizationShapes.map(s => s.id))
      }

      setVisualizedShapeIds([])
      setIsVisualized(false)
      
      console.log('🧹 已清除所有 OCR 可视化形状')
    } catch (error) {
      console.error('清除可视化失败:', error)
    }
  }, [editor, visualizedShapeIds])

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {/* 可视化按钮 */}
      <TldrawUiButton
        type="icon"
        style={{ 
          height: 52, 
          width: 52, 
          padding: 'var(--space-2)',
          backgroundColor: isVisualized ? 'var(--color-accent)' : 'var(--color-background)'
        }}
        onClick={visualizeOcrBoxes}
        title="可视化 OCR 边界框"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
          />
          <circle cx="8" cy="8" r="1" fill="currentColor" />
          <circle cx="16" cy="8" r="1" fill="currentColor" />
          <circle cx="8" cy="16" r="1" fill="currentColor" />
          <circle cx="16" cy="16" r="1" fill="currentColor" />
        </svg>
      </TldrawUiButton>

      {/* 清除按钮 */}
      {isVisualized && (
        <TldrawUiButton
          type="icon"
          style={{ height: 52, width: 52, padding: 'var(--space-2)' }}
          onClick={clearVisualization}
          title="清除 OCR 可视化"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </TldrawUiButton>
      )}

      {/* 文字按钮 */}
      <button
        onClick={visualizeOcrBoxes}
        className="pt-2 pb-2 pr-2"
        style={{ 
          cursor: 'pointer', 
          zIndex: 100000, 
          pointerEvents: 'all'
        }}
      >
        <div className={`font-bold py-2 px-4 rounded ${
          isVisualized 
            ? 'bg-green-500 hover:bg-green-700 text-white' 
            : 'bg-blue-500 hover:bg-blue-700 text-white'
        }`}>
          {isVisualized ? '✅ OCR 已可视化' : '🎯 可视化 OCR 框'}
        </div>
      </button>

      {isVisualized && (
        <button
          onClick={clearVisualization}
          className="pt-2 pb-2 pr-2"
          style={{ 
            cursor: 'pointer', 
            zIndex: 100000, 
            pointerEvents: 'all'
          }}
        >
          <div className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
            🧹 清除可视化
          </div>
        </button>
      )}
    </div>
  )
} 