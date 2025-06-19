'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useEditor } from 'tldraw'
import { useHandwritingOCR } from '../hooks/useHandwritingOCR'

interface AutoOCRProcessorProps {
  // 检测用户停止绘画后等待的时间（毫秒）
  idleTimeout?: number
  // 是否启用自动OCR
  enabled?: boolean
}

export function AutoOCRProcessor({ 
  idleTimeout = 60000, // 默认1分钟
  enabled = true 
}: AutoOCRProcessorProps) {
  const editor = useEditor()
  const [lastEditTime, setLastEditTime] = useState<number>(0)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [hasSelection, setHasSelection] = useState<boolean>(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const processingStateRef = useRef<{
    initialized: boolean;
    processing: boolean;
  }>({
    initialized: false,
    processing: false
  })
  
  // 使用OCR钩子
  const {
    processSelectedShapes,
    isProcessing: ocrIsProcessing,
    isInitialized,
    initializeOCR,
    progress,
    currentStep,
    lastResult,
    lastErrorAnalysis
  } = useHandwritingOCR({
    autoSave: true,
    autoSaveToDataDirectory: true,
    enableErrorAnalysis: true,
    autoMarkErrors: true,
    enableSmartSuggestions: true,
    autoShowSuggestions: true,
    enableTTS: true
  })

  // 检测画布编辑
  useEffect(() => {
    if (!editor || !enabled) return
    
    // 监听画布变化
    const handleChange = () => {
      setLastEditTime(Date.now())
      setHasSelection(editor.getSelectedShapeIds().length > 0)
    }
    
    // 订阅画布变化事件
    const unsubscribeChange = editor.store.listen((event) => {
      if (
        event.source === 'user' && 
        (event.name === 'shape_created' || 
         event.name === 'shape_updated' ||
         event.name === 'shapes_dragged')
      ) {
        handleChange()
      }
    })
    
    // 监听选择变化
    const unsubscribeSelect = editor.store.listen((event) => {
      if (event.name === 'selection_changed') {
        setHasSelection(editor.getSelectedShapeIds().length > 0)
      }
    })
    
    return () => {
      unsubscribeChange()
      unsubscribeSelect()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [editor, enabled])

  // 检测用户停止绘画后的定时器
  useEffect(() => {
    if (!enabled || !hasSelection || isProcessing || ocrIsProcessing) return
    
    // 清除之前的定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    
    // 如果有最近的编辑，设置定时器
    if (lastEditTime > 0) {
      timerRef.current = setTimeout(async () => {
        // 检查是否仍有选中内容
        if (!editor || editor.getSelectedShapeIds().length === 0) return
        
        console.log(`🤖 检测到用户${idleTimeout/1000}秒未编辑，开始自动OCR处理...`)
        
        try {
          setIsProcessing(true)
          processingStateRef.current.processing = true
          
          // 两阶段OCR处理
          if (!isInitialized && !processingStateRef.current.initialized) {
            console.log('🤖 第一阶段：自动初始化OCR环境...')
            processingStateRef.current.initialized = true
            await initializeOCR()
            
            // 等待一小段时间确保初始化完成
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            // 由于状态更新的异步性质，我们需要在这里直接执行第二阶段
            // 而不是依赖isInitialized状态（它可能还没更新）
            console.log('🤖 初始化完成，继续第二阶段...')
            console.log('🤖 第二阶段：开始OCR识别...')
            
            try {
              // 直接进入第二阶段，不检查isInitialized状态
              await processSelectedShapes()
            } catch (error) {
              console.error('🤖 第二阶段执行失败:', error)
            }
          } else if (isInitialized) {
            // 如果已经初始化，直接进行第二阶段
            console.log('🤖 使用已初始化的环境，开始OCR识别...')
            await processSelectedShapes()
          }
        } catch (error) {
          console.error('自动OCR处理失败:', error)
        } finally {
          setIsProcessing(false)
          processingStateRef.current.processing = false
          // 重置编辑时间，避免连续触发
          setLastEditTime(0)
        }
      }, idleTimeout)
    }
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [lastEditTime, hasSelection, isProcessing, ocrIsProcessing, editor, idleTimeout, enabled, isInitialized, initializeOCR, processSelectedShapes])

  // 状态指示器（可选，用于调试）
  return (
    <div style={{ 
      position: 'fixed', 
      bottom: 10, 
      left: 10, 
      padding: '4px 8px',
      backgroundColor: enabled ? 'rgba(0, 128, 0, 0.2)' : 'rgba(128, 128, 128, 0.2)',
      borderRadius: 4,
      fontSize: 12,
      color: '#333',
      pointerEvents: 'none',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: 5
    }}>
      <div style={{ 
        width: 8, 
        height: 8, 
        borderRadius: '50%', 
        backgroundColor: enabled 
          ? (isProcessing || ocrIsProcessing 
              ? '#ff9900' 
              : (lastEditTime > 0 ? '#00cc00' : '#cccccc'))
          : '#999999'
      }} />
      {enabled ? (
        isProcessing || ocrIsProcessing 
          ? `自动OCR处理中: ${currentStep || '准备中'} (${progress}%)`
          : (lastEditTime > 0 
              ? `等待用户停止绘画 (${Math.max(0, Math.floor((idleTimeout - (Date.now() - lastEditTime)) / 1000))}秒)`
              : '自动OCR监控已启用')
      ) : '自动OCR已禁用'}
    </div>
  )
} 