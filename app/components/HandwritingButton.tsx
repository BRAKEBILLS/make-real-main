// 手写识别按钮组件
'use client'

import React, { useState } from 'react'
import { TldrawUiButton } from 'tldraw'
import { useHandwritingOCR } from '../hooks/useHandwritingOCR'

export const maxDuration = 120

export function HandwritingButton() {
  const {
    processSelectedShapes,
    processEntireCanvas,
    isProcessing,
    progress,
    currentStep,
    lastErrorAnalysis,
    errorMarkShapeIds,
    error,
    resetOCRState,
    clearErrorMarksFromCanvas
  } = useHandwritingOCR({
    autoSave: true,
    autoSaveToDataDirectory: true,
    enableErrorAnalysis: true,
    autoMarkErrors: true,
    enableSmartSuggestions: true,
    autoShowSuggestions: true,
    enableTTS: false
  })

  const [showProgressModal, setShowProgressModal] = useState(false)

  const handleProcessSelected = async () => {
    setShowProgressModal(true)
    resetOCRState()
    
    try {
      await processSelectedShapes()
    } catch (error) {
      console.error('OCR processing failed:', error)
    } finally {
      setShowProgressModal(false)
    }
  }

  const handleProcessAll = async () => {
    setShowProgressModal(true)
    resetOCRState()
    
    try {
      await processEntireCanvas()
    } catch (error) {
      console.error('OCR processing failed:', error)
    } finally {
      setShowProgressModal(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {/* 进度显示模态框 */}
        {showProgressModal && isProcessing && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              style={{
                backgroundColor: 'white',
                padding: '24px',
                borderRadius: '8px',
                minWidth: '300px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}
            >
              <h3 style={{ marginBottom: '16px', color: '#333' }}>Analyzing Matrix Calculation...</h3>
              
              {/* 进度条 */}
              <div 
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#f0f0f0',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  overflow: 'hidden'
                }}
              >
                <div 
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#4CAF50',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
              
              <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
                {currentStep} ({progress}%)
              </p>
              
              {error && (
                <p style={{ color: '#f44336', fontSize: '14px', marginTop: '8px' }}>
                  Error: {error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 主要的OCR按钮 */}
        <TldrawUiButton
          type="icon"
          style={{ height: 52, width: 52, padding: 'var(--space-2)' }}
          onClick={handleProcessSelected}
          disabled={isProcessing}
          title="Analyze selected matrix calculation"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ backgroundColor: 'var(--color-background)', borderRadius: '100%' }}
          >
            {/* OCR识别图标 - 文字扫描 */}
            <path
              d="M3 4V2H21V4H3ZM3 22V20H21V22H3ZM5 6H19V8H5V6ZM5 10H15V12H5V10ZM5 14H19V16H5V14ZM5 18H13V20H5V18Z"
              fill="currentColor"
            />
            <path
              d="M17 10L19 12L17 14V13H15V11H17V10Z"
              fill="currentColor"
            />
          </svg>
        </TldrawUiButton>

        {/* 识别按钮 */}
        <button
          onClick={handleProcessSelected}
          disabled={isProcessing}
          className="pt-2 pb-2 pr-2"
          style={{ 
            cursor: isProcessing ? 'not-allowed' : 'pointer', 
            zIndex: 100000, 
            pointerEvents: 'all',
            opacity: isProcessing ? 0.6 : 1
          }}
        >
          <div className={`${isProcessing ? 'bg-gray-500' : 'bg-green-500 hover:bg-green-700'} text-white font-bold py-2 px-4 rounded`}>
            {isProcessing ? `Analyzing... ${progress}%` : 'Check Matrix Calculation'}
          </div>
        </button>

        {/* 识别全部按钮 */}
        <button
          onClick={handleProcessAll}
          disabled={isProcessing}
          className="pt-2 pb-2 pr-2"
          style={{ 
            cursor: isProcessing ? 'not-allowed' : 'pointer', 
            zIndex: 100000, 
            pointerEvents: 'all',
            opacity: isProcessing ? 0.6 : 1
          }}
        >
          <div className={`${isProcessing ? 'bg-gray-500' : 'bg-blue-500 hover:bg-blue-700'} text-white font-bold py-2 px-4 rounded`}>
            {isProcessing ? 'Analyzing...' : 'Check All Calculations'}
          </div>
        </button>

        {/* 清除错误标记按钮 */}
        {errorMarkShapeIds.length > 0 && (
          <button
            onClick={clearErrorMarksFromCanvas}
            disabled={isProcessing}
            className="pt-2 pb-2 pr-2"
            style={{ 
              cursor: isProcessing ? 'not-allowed' : 'pointer', 
              zIndex: 100000, 
              pointerEvents: 'all',
              opacity: isProcessing ? 0.6 : 1
            }}
          >
            <div className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear Feedback
            </div>
          </button>
        )}

        {/* 错误分析状态显示 */}
        {lastErrorAnalysis && lastErrorAnalysis.success && lastErrorAnalysis.result && (
          <div className="pt-2 pb-2 pr-2">
            <div className={`px-3 py-2 rounded text-white text-sm ${
              lastErrorAnalysis.result.hasErrors 
                ? 'bg-orange-500' 
                : 'bg-green-500'
            }`}>
              {lastErrorAnalysis.result.hasErrors 
                ? `Found ${lastErrorAnalysis.result.results.length} matrix ${lastErrorAnalysis.result.results.length === 1 ? 'error' : 'errors'}`
                : 'Calculation correct!'
              }
            </div>
          </div>
        )}

        {/* 错误详情显示 */}
        {lastErrorAnalysis && lastErrorAnalysis.success && lastErrorAnalysis.result && lastErrorAnalysis.result.hasErrors && (
          <div className="pt-2 pb-2 pr-2">
            <div className="bg-white border border-blue-300 rounded p-3 text-sm max-w-xs">
              <div className="font-bold text-blue-600 mb-2">Matrix Calculation Feedback</div>
              <div className="text-gray-600 text-xs">
                Green text shows correct form, highlighted areas need attention
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
} 