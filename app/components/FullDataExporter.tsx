'use client'

import React, { useCallback, useState } from 'react'
import { useEditor, TldrawUiButton } from 'tldraw'
import { mapOcrBoxesToPage, calcUnionAndCoverage, calcRmse } from '../lib/ocrPixelToPageMapping'

/**
 * 集中导出 OCR 原始像素坐标、图片 DOM 几何数据、以及 tldraw 画布相机/viewport 信息。
 *
 * 使用方法：
 * 1. 确保页面中用于 OCR 的图片元素拥有 id="scan"，或 data-ocr-image="true" 属性。
 * 2. 如果在全局 (window) 上放置了 `ocrResults` 变量（格式见下），组件会自动读取。
 *    例如：
 *    window.ocrResults = [
 *      { x: 100, y: 80, w: 30, h: 20, id: 'c001', text: 'H' },
 *      // ...
 *    ]
 *
 * 点击按钮即可将所有数据导出为 JSON 文件或复制到剪贴板。
 */
export function FullDataExporter() {
  const editor = useEditor()
  const [lastJson, setLastJson] = useState<string | null>(null)

  // 收集所需数据
  const collectData = useCallback(() => {
    if (!editor) {
      alert('Tldraw 编辑器尚未就绪，请稍后再试')
      return null
    }

    // 获取图片元素并确保加载完成
    const img: HTMLImageElement | null = document.querySelector('#scan') || document.querySelector('img[data-ocr-image="true"]')
    if (!img) {
      alert('未找到 OCR 图片元素 (#scan)，请先运行一次 OCR')
      return null
    }
    if (!img.complete || img.naturalWidth === 0) {
      alert('图片尚未加载完成，稍等几秒再导出')
      return null
    }

    // 1. OCR 原始像素框
    const ocrBoxes: any[] = (typeof window !== 'undefined' && (window as any).ocrResults)
      ? (window as any).ocrResults
      : []

    // 2. 图片几何数据 - 优先从 tldraw 形状获取，回退到 DOM
    let imageDom = null
    
    // 尝试从选中的形状中找到图片形状
    const selectedShapes = editor.getSelectedShapes()
    
    // 调试：显示所有选中形状的信息
    console.log('🔍 调试选中形状:')
    selectedShapes.forEach((shape, index) => {
      console.log(`  形状 ${index + 1}:`, {
        id: shape.id,
        type: shape.type,
        x: shape.x,
        y: shape.y,
        props: Object.keys((shape as any).props || {}),
        hasAssetId: !!(shape as any).props?.assetId,
        hasUrl: !!(shape as any).props?.url,
        propsDetail: (shape as any).props
      })
    })
    
    const imageShape = selectedShapes.find(shape => 
      shape.type === 'image' || 
      shape.type === 'asset' || 
      (shape as any).props?.assetId ||
      (shape as any).props?.url
    )
    
    console.log('🔍 图片形状查找结果:', imageShape ? '找到' : '未找到')
    
    if (imageShape && img) {
      // 使用 tldraw 形状的 page 坐标
      const shapePageBounds = editor.getShapePageBounds(imageShape)
      if (shapePageBounds) {
        console.log('🎯 找到图片形状，使用其 page 坐标:', shapePageBounds)
        imageDom = {
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
    
    // 回退策略：基于偏移分析，直接使用选区坐标作为图片位置
    if (!imageDom && img) {
      const selectionBounds = editor.getSelectionPageBounds()
      if (selectionBounds) {
        console.log('🎯 使用选区坐标作为图片位置（基于偏移分析）:', selectionBounds)
        imageDom = {
          rect: {
            x: selectionBounds.x,
            y: selectionBounds.y,
            width: selectionBounds.w,
            height: selectionBounds.h,
          },
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        }
      } else {
        console.log('⚠️ 最后回退：使用 DOM getBoundingClientRect')
        imageDom = {
          rect: {
            x: img.getBoundingClientRect().x,
            y: img.getBoundingClientRect().y,
            width: img.getBoundingClientRect().width,
            height: img.getBoundingClientRect().height,
          },
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        }
      }
    }

    // 3. tldraw 相机 / viewport / selection 信息
    const tldrawInfo = editor
      ? {
          camera: editor.getCamera(),
          viewport: editor.getViewportPageBounds(),
          selection: editor.getSelectionPageBounds(),
          selectedShapes: editor.getSelectedShapeIds().map((id) => {
            const s = editor.getShape(id)
            return s
              ? { id: s.id, x: s.x, y: s.y, w: (s as any).props?.w, h: (s as any).props?.h }
              : null
          }).filter(Boolean),
        }
      : null

    // 若能获取全部依赖，则生成 pageBox 并比较
    let mappedPageBoxes: any[] | undefined = undefined
    let comparison: any = undefined

    if (
      ocrBoxes.length > 0 &&
      imageDom &&
      tldrawInfo?.camera &&
      tldrawInfo?.selection &&
      editor
    ) {
      console.groupCollapsed('%c🔄 OCR →page 映射调试','color:#0b82ff')
      console.log('ocrBoxes', ocrBoxes.length)
      console.log('imageDom.rect', imageDom.rect)
      console.log('camera', tldrawInfo.camera)
      try {
        mappedPageBoxes = mapOcrBoxesToPage(ocrBoxes, imageDom, editor)
        console.log('mappedPageBoxes', mappedPageBoxes)
        const { union, covered } = calcUnionAndCoverage(
          mappedPageBoxes,
          tldrawInfo.selection
        )

        const rmse = calcRmse(
          mappedPageBoxes,
          tldrawInfo.selectedShapes?.map((s: any) => ({ x: s.x, y: s.y })) || []
        )

        comparison = {
          union,
          covered,
          rmse,
        }
        console.log('comparison', comparison)
        console.groupEnd()
      } catch (err) {
        console.error('映射或比较失败:', err)
      }
    }

    const payload = {
      ocr_boxes: ocrBoxes,
      image_dom: imageDom,
      tldraw: tldrawInfo,
      mapped_page_boxes: mappedPageBoxes,
      comparison,
      manual_calculation: {
        step1: '像素 → 屏幕: scaleX = rect.width / naturalWidth; scaleY = rect.height / naturalHeight; screenX = rect.x + ocrX * scaleX; screenY = rect.y + ocrY * scaleY',
        step2: '屏幕 → page: pagePoint = editor.screenToPage({ x: screenX, y: screenY })',
      },
    }

    return payload
  }, [editor])

  const exportJson = () => {
    const data = collectData()
    const jsonStr = JSON.stringify(data, null, 2)
    setLastJson(jsonStr)

    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ocr_dom_tldraw_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const copyJson = () => {
    const data = collectData()
    const jsonStr = JSON.stringify(data, null, 2)
    setLastJson(jsonStr)

    navigator.clipboard.writeText(jsonStr).then(() => {
      alert('已复制到剪贴板')
    }).catch(err => {
      console.error('复制失败', err)
      alert('复制失败，请查看控制台')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <TldrawUiButton
          type="icon"
          style={{ height: 52, width: 52, padding: 'var(--space-2)' }}
          onClick={exportJson}
          title="导出全部数据 (OCR / DOM / tldraw)"
        >📤</TldrawUiButton>

        <button
          onClick={exportJson}
          className="pt-2 pb-2 pr-2"
          style={{ cursor: 'pointer', zIndex: 100000, pointerEvents: 'all' }}
        >
          <div className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            导出全部数据
          </div>
        </button>

        <button
          onClick={copyJson}
          className="pt-2 pb-2 pr-2"
          style={{ cursor: 'pointer', zIndex: 100000, pointerEvents: 'all' }}
        >
          <div className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
            复制全部数据
          </div>
        </button>
      </div>

      {/* 预览最近一次生成的 JSON */}
      {lastJson && (
        <pre
          className="bg-white p-3 rounded shadow-sm border border-gray-200 text-xs text-gray-700 overflow-auto"
          style={{ maxHeight: '240px', maxWidth: '580px' }}
        >{lastJson}</pre>
      )}
    </div>
  )
} 