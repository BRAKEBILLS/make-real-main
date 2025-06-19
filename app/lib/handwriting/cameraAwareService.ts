import { Editor, TLDrawShape } from 'tldraw'
import { TStroke, toStrokes, compressStrokes } from './encoder'
import { parseJIIX, ParsedCharacter } from './jiixParser'
import { REST_CONFIG } from './config'

export class CameraAwareRecognitionService {
  private cam = { x: 0, y: 0, z: 1 }

  constructor(private ed: Editor) {
    // 监听相机变化
    this.ed.on('viewport', () => (this.cam = this.ed.getCamera()))
  }

  async recognize(mode: 'cloud' = 'cloud') {
    const shapes = this.ed
      .getCurrentPageShapes()
      .filter(s => s.type === 'draw') as TLDrawShape[]
    
    if (shapes.length === 0) {
      throw new Error('未选择任何手写形状')
    }

    const ids = shapes.map(s => s.id)

    // 转换每个形状为笔画数据
    const allStrokes: TStroke[] = []
    shapes.forEach(shape => {
      const strokes = compressStrokes(toStrokes(shape, this.ed))
      allStrokes.push(...strokes)
    })

    if (allStrokes.length === 0) {
      throw new Error('未找到有效的笔画数据')
    }

    // 转换为API期望的格式
    const apiStrokes = this.convertStrokesToApiFormat(allStrokes)

    // 调用现有的API端点
    const response = await fetch('/makereal.tldraw.com/api/ink/recognize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        strokes: apiStrokes,
        configuration: REST_CONFIG
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `API 调用失败: ${response.status}`)
    }

    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.error || '识别失败')
    }

    // 记录相机状态用于坐标补偿
    const camNow = this.ed.getCamera()
    const diff = {
      x: camNow.x - this.cam.x,
      y: camNow.y - this.cam.y,
      z: camNow.z / this.cam.z,
    }

    // 直接使用后端API已经解析好的字符数据
    const chars: ParsedCharacter[] = []
    
    if (result.characters && result.characters.recognized_text) {
      // 后端API返回的数据格式: { characters: { recognized_text: [...] } }
      const recognizedChars = result.characters.recognized_text
      
      // 进行坐标补偿（如果需要）
      recognizedChars.forEach((char: any) => {
        // 应用相机补偿到 bbox 坐标
        if (diff.x !== 0 || diff.y !== 0 || diff.z !== 1) {
          // 将屏幕坐标转换为页面坐标
          const screenTopLeft = { x: char.originalBbox[0], y: char.originalBbox[1] }
          const screenBottomRight = { 
            x: char.originalBbox[0] + char.originalBbox[2], 
            y: char.originalBbox[1] + char.originalBbox[3] 
          }
          
          const pageTopLeft = this.ed.screenToPage(screenTopLeft)
          const pageBottomRight = this.ed.screenToPage(screenBottomRight)
          
          // 更新 bbox 和 center
          char.bbox = {
            x: pageTopLeft.x,
            y: pageTopLeft.y,
            w: pageBottomRight.x - pageTopLeft.x,
            h: pageBottomRight.y - pageTopLeft.y
          }
          
          char.center = {
            x: pageTopLeft.x + (pageBottomRight.x - pageTopLeft.x) / 2,
            y: pageTopLeft.y + (pageBottomRight.y - pageTopLeft.y) / 2
          }
        }
        
        chars.push(char)
      })
    }

    console.log(`🎯 CameraAwareService 处理完成:`, {
      totalCharacters: chars.length,
      sampleChar: chars[0],
      cameraCompensation: diff
    })

    return {
      characters: chars,
      meta: {
        mode,
        shapes: ids.length,
        chars: chars.length,
        ts: Date.now(),
      },
    }
  }

  /**
   * 转换TStroke格式到API期望的格式
   */
  private convertStrokesToApiFormat(strokes: TStroke[]): any[] {
    return strokes.map((stroke, index) => {
      return stroke.x.map((x, i) => ({
        x: stroke.x[i],
        y: stroke.y[i],
        t: stroke.t[i],
        p: stroke.p[i],
        pointerId: index,
        pointerType: 'pen'
      }))
    }).flat()
  }

  cleanup() {
    this.ed.off('viewport')
  }
} 