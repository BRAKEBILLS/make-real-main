'use client'

import React, { useState } from 'react'
import { TldrawUiButton, useEditor } from 'tldraw'

/**
 * 形状坐标信息接口
 */
interface ShapeCoordinateInfo {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  rotation?: number
  text?: string
}

/**
 * 选区坐标信息接口
 */
interface SelectionCoordinateInfo {
  selectionBounds: {
    x: number
    y: number
    w: number
    h: number
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  selectedShapes: ShapeCoordinateInfo[]
  timestamp: string
}

/**
 * 选区坐标导出组件
 */
export function SelectionCoordinatesExporter() {
  const editor = useEditor()
  const [lastExportedData, setLastExportedData] = useState<SelectionCoordinateInfo | null>(null)

  /**
   * 获取选区和选中形状的坐标信息
   */
  const getSelectionCoordinates = (): SelectionCoordinateInfo | null => {
    // 检查是否有选中内容
    const selectedIds = editor.getSelectedShapeIds()
    if (selectedIds.length === 0) {
      alert('请先选择内容')
      return null
    }

    // 获取选区边界
    const selectionBounds = editor.getSelectionPageBounds()
    if (!selectionBounds) {
      alert('无法获取选区边界')
      return null
    }

    // 获取所有选中的形状
    const selectedShapes: ShapeCoordinateInfo[] = []
    
    selectedIds.forEach(id => {
      const shape = editor.getShape(id)
      if (shape) {
        const shapeInfo: ShapeCoordinateInfo = {
          id: shape.id,
          type: shape.type,
          x: shape.x,
          y: shape.y
        }
        
        // 添加额外属性（如果存在）
        if ('w' in shape.props) {
          shapeInfo.width = shape.props.w
        }
        if ('h' in shape.props) {
          shapeInfo.height = shape.props.h
        }
        if ('rotation' in shape.props) {
          shapeInfo.rotation = shape.props.rotation
        }
        if ('text' in shape.props) {
          shapeInfo.text = shape.props.text
        }
        
        selectedShapes.push(shapeInfo)
      }
    })

    // 构建完整的坐标信息
    return {
      selectionBounds: {
        x: selectionBounds.x,
        y: selectionBounds.y,
        w: selectionBounds.w,
        h: selectionBounds.h,
        minX: selectionBounds.minX,
        minY: selectionBounds.minY,
        maxX: selectionBounds.maxX,
        maxY: selectionBounds.maxY
      },
      selectedShapes,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 导出坐标信息为JSON文件
   */
  const exportCoordinatesToJson = () => {
    const coordinateInfo = getSelectionCoordinates()
    if (!coordinateInfo) return
    
    // 保存最后导出的数据用于显示
    setLastExportedData(coordinateInfo)
    
    // 将数据转换为JSON字符串
    const jsonString = JSON.stringify(coordinateInfo, null, 2)
    
    // 创建Blob对象
    const blob = new Blob([jsonString], { type: 'application/json' })
    
    // 创建下载链接
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tldraw-selection-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    
    // 触发下载
    document.body.appendChild(link)
    link.click()
    
    // 清理
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * 复制坐标信息到剪贴板
   */
  const copyCoordinatesToClipboard = () => {
    const coordinateInfo = getSelectionCoordinates()
    if (!coordinateInfo) return
    
    // 保存最后导出的数据用于显示
    setLastExportedData(coordinateInfo)
    
    // 将数据转换为JSON字符串
    const jsonString = JSON.stringify(coordinateInfo, null, 2)
    
    // 复制到剪贴板
    navigator.clipboard.writeText(jsonString)
      .then(() => {
        alert('坐标信息已复制到剪贴板')
      })
      .catch(err => {
        console.error('复制失败:', err)
        alert('复制失败，请查看控制台')
      })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* 导出按钮 */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <TldrawUiButton
          type="icon"
          style={{ height: 52, width: 52, padding: 'var(--space-2)' }}
          onClick={exportCoordinatesToJson}
          title="导出选区坐标到JSON文件"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ backgroundColor: 'var(--color-background)', borderRadius: '100%' }}
          >
            <path
              d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
              fill="currentColor"
            />
          </svg>
        </TldrawUiButton>

        <button
          onClick={exportCoordinatesToJson}
          className="pt-2 pb-2 pr-2"
          style={{ 
            cursor: 'pointer', 
            zIndex: 100000, 
            pointerEvents: 'all'
          }}
        >
          <div className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            导出选区坐标
          </div>
        </button>

        <button
          onClick={copyCoordinatesToClipboard}
          className="pt-2 pb-2 pr-2"
          style={{ 
            cursor: 'pointer', 
            zIndex: 100000, 
            pointerEvents: 'all'
          }}
        >
          <div className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
            复制坐标信息
          </div>
        </button>
      </div>

      {/* 数据预览区域 */}
      {lastExportedData && (
        <div className="bg-white p-3 rounded shadow-sm border border-gray-200 text-xs text-gray-700 overflow-auto" style={{ maxHeight: '200px', maxWidth: '500px' }}>
          <div className="font-bold mb-2">上次导出的坐标信息:</div>
          <div className="font-mono">
            <div>选区边界: x={lastExportedData.selectionBounds.x.toFixed(2)}, y={lastExportedData.selectionBounds.y.toFixed(2)}, w={lastExportedData.selectionBounds.w.toFixed(2)}, h={lastExportedData.selectionBounds.h.toFixed(2)}</div>
            <div>选中形状数量: {lastExportedData.selectedShapes.length}</div>
            {lastExportedData.selectedShapes.length > 0 && (
              <div className="mt-1">
                <div className="font-bold">第一个形状:</div>
                <div>类型: {lastExportedData.selectedShapes[0].type}</div>
                <div>位置: x={lastExportedData.selectedShapes[0].x.toFixed(2)}, y={lastExportedData.selectedShapes[0].y.toFixed(2)}</div>
                {lastExportedData.selectedShapes[0].width && <div>宽度: {lastExportedData.selectedShapes[0].width.toFixed(2)}</div>}
                {lastExportedData.selectedShapes[0].height && <div>高度: {lastExportedData.selectedShapes[0].height.toFixed(2)}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 