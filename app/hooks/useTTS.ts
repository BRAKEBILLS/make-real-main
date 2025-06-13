import { useState, useEffect, useRef, useCallback } from 'react'

interface TTSOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  style?: string
  speed?: number
  autoPlay?: boolean
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: any) => void
}

/**
 * TTS钩子，用于文本转语音功能
 */
export function useTTS(options: TTSOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentText, setCurrentText] = useState<string | null>(null)
  
  // 使用ref来存储音频元素和选项
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const optionsRef = useRef<TTSOptions>({
    voice: 'nova',
    style: 'friendly',
    speed: 1.0,
    autoPlay: true,
    ...options
  })
  
  // 更新选项
  useEffect(() => {
    optionsRef.current = {
      ...optionsRef.current,
      ...options
    }
  }, [options])

  /**
   * 停止当前播放
   */
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
      audioRef.current = null
    }
    setIsPlaying(false)
    setCurrentText(null)
  }, [])

  /**
   * 使用TTS生成并播放文本
   */
  const speak = useCallback(async (text: string, customOptions?: TTSOptions) => {
    try {
      // 如果已经在播放，先停止
      if (isPlaying) {
        stop()
      }
      
      // 如果文本为空，直接返回
      if (!text || text.trim() === '') {
        setError('文本不能为空')
        return
      }
      
      setIsLoading(true)
      setError(null)
      setCurrentText(text)
      
      // 合并选项
      const mergedOptions = {
        ...optionsRef.current,
        ...customOptions
      }
      
      console.log(`🔊 请求TTS: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`)
      
      // 请求TTS API - 修改API路径以匹配项目结构
      const response = await fetch('/makereal.tldraw.com/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voice: mergedOptions.voice,
          style: mergedOptions.style,
          speed: mergedOptions.speed
        })
      })
      
      // 检查响应
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '语音生成失败')
      }
      
      const data = await response.json()
      
      if (!data.audio) {
        throw new Error('TTS API返回的数据中没有音频')
      }
      
      // 创建音频元素并播放
      const audio = new Audio(data.audio)
      audioRef.current = audio
      
      // 设置事件监听
      audio.addEventListener('play', () => {
        console.log('🎵 TTS音频开始播放')
        setIsPlaying(true)
        setIsLoading(false)
        mergedOptions.onStart?.()
      })
      
      audio.addEventListener('ended', () => {
        console.log('🎵 TTS音频播放结束')
        setIsPlaying(false)
        setCurrentText(null)
        audioRef.current = null
        mergedOptions.onEnd?.()
      })
      
      audio.addEventListener('error', (e) => {
        console.error('🎵 TTS音频播放错误', e)
        setIsPlaying(false)
        setIsLoading(false)
        setError('音频播放失败')
        mergedOptions.onError?.(e)
      })
      
      // 如果设置了自动播放，则播放
      if (mergedOptions.autoPlay !== false) {
        try {
          await audio.play()
        } catch (playError) {
          console.error('🎵 音频播放被浏览器阻止，可能需要用户交互', playError)
          setError('音频播放被浏览器阻止，请点击页面触发播放')
          setIsLoading(false)
          mergedOptions.onError?.(playError)
        }
      } else {
        setIsLoading(false)
      }
      
      return audio
    } catch (error: any) {
      console.error('🎵 TTS错误:', error)
      setError(error.message || '语音生成失败')
      setIsLoading(false)
      setIsPlaying(false)
      options.onError?.(error)
      return null
    }
  }, [isPlaying, stop, options])

  /**
   * 暂停播放
   */
  const pause = useCallback(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [isPlaying])

  /**
   * 恢复播放
   */
  const resume = useCallback(() => {
    if (audioRef.current && !isPlaying) {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(error => {
          console.error('恢复播放失败', error)
          setError('恢复播放失败')
          options.onError?.(error)
        })
    }
  }, [isPlaying, options])

  // 组件卸载时清理资源
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  return {
    speak,
    stop,
    pause,
    resume,
    isPlaying,
    isLoading,
    error,
    currentText
  }
} 