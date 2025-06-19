import { NextRequest, NextResponse } from 'next/server'

interface PointerEvent {
  x: number
  y: number
  t: number
  p?: number
  pointerType?: string
  pointerId?: number
  eventType?: string
}

export async function POST(request: NextRequest) {
  try {
    const { strokes, configuration } = await request.json()
    
    // 验证环境变量
    const appKey = process.env.NEXT_PUBLIC_MYSCRIPT_APP_KEY
    const hmacKey = process.env.MYSCRIPT_HMAC_KEY
    
    if (!appKey || !hmacKey) {
      console.error('❌ MyScript API 密钥未配置')
      return NextResponse.json(
        { error: 'MyScript API 密钥未配置' },
        { status: 500 }
      )
    }
    
    console.log('🚀 REST API 识别开始...')
    console.log('📊 笔画数量:', strokes?.length || 0)
    
    // 转换笔画数据为 MyScript 格式
          const strokeGroups = convertStrokesToMyScriptFormat(strokes || [])
      
      // 计算写作区域大小（基于实际笔画坐标）
      let maxX = 800, maxY = 600
      if (strokeGroups.length > 0) {
        const allX: number[] = []
        const allY: number[] = []
        
        strokeGroups.forEach(group => {
          group.strokes.forEach(stroke => {
            allX.push(...stroke.x)
            allY.push(...stroke.y)
          })
        })
        
        if (allX.length > 0 && allY.length > 0) {
          maxX = Math.max(maxX, Math.max(...allX) + 100)
          maxY = Math.max(maxY, Math.max(...allY) + 100)
        }
      }
      
      const widthInPixels = Math.ceil(maxX)
      const heightInPixels = Math.ceil(maxY)
      
      // 根据 MyScript 官方配置文档 https://developer.myscript.com/doc/interactive-ink/4.0/web/reference/configuration-ws/
    const payload = {
      configuration: {
        lang: 'en_US',                        // ✅ 官方支持
        export: {
          jiix: {
            'bounding-box': true,             // ✅ 官方支持：export.jiix.bounding-box (默认 false)
            strokes: true,                    // ✅ 官方支持：export.jiix.strokes (默认 true)
            text: { 
              chars: true,                    // ✅ 官方支持：export.jiix.text.chars (默认 false)
              words: true                     // ✅ 官方支持：export.jiix.text.words (默认 true)
            }
          }
        },
        text: {
          margin: {
            top: 5,                          // ✅ 官方支持：text.margin.top (默认 10)
            bottom: 5,                       // ✅ 官方支持：text.margin.bottom (默认 10)
            left: 5,                         // ✅ 官方支持：text.margin.left (默认 15)
            right: 5                         // ✅ 官方支持：text.margin.right (默认 15)
          },
          configuration: {
            customResources: [],              // ✅ 官方支持：text.configuration.customResources
            customLexicon: [],                // ✅ 官方支持：text.configuration.customLexicon
            addLKText: true                   // ✅ 官方支持：text.configuration.addLKText (默认 true)
          }
        }
      },
      contentType: 'Math',                    // ✅ 官方支持的 Math 模式，专门用于数学表达式识别
      // 提高DPI以获得更好的精度（非官方文档参数，但 MyScript 支持）
      xDPI: 300,               
      yDPI: 300,               
      // 定义写作区域大小
      width: widthInPixels,    
      height: heightInPixels,  
      // 笔画组格式
      strokeGroups: strokeGroups
    }
    
    console.log('📤 发送到 MyScript REST API:', {
      endpoint: 'https://cloud.myscript.com/api/v4.0/iink/batch',
      appKey: appKey.substring(0, 8) + '...',
      hmacKey: hmacKey.substring(0, 8) + '...',
      strokeGroupsCount: payload.strokeGroups?.length || 0,
      hasStrokeGroups: !!payload.strokeGroups,
      contentType: payload.contentType
    })
    
    console.log('📋 Payload 检查:', {
      hasConfiguration: !!payload.configuration,
      hasStrokeGroups: !!payload.strokeGroups,
      strokeGroupsLength: payload.strokeGroups?.length || 0,
      contentType: payload.contentType
    })
    
    // 计算 HMAC 签名
    const payloadString = JSON.stringify(payload)
    const hmac = await calculateHMAC(appKey + hmacKey, payloadString)
    
    // 调用 MyScript REST API
    const endpoint = 'https://cloud.myscript.com/api/v4.0/iink/batch'
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.myscript.jiix,application/json',
        'applicationKey': appKey,
        'hmac': hmac
      },
      body: payloadString
    })
    
    console.log('📨 MyScript 响应状态:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ MyScript REST API 错误:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      })
      
      // 根据状态码提供具体错误信息
      let errorMessage = 'MyScript API 调用失败'
      switch (response.status) {
        case 403:
          if (errorText.includes('access.key.invalid')) {
            errorMessage = 'API Key 或 HMAC Key 无效，请检查环境变量配置'
          } else if (errorText.includes('access.ip.filter.rejected')) {
            errorMessage = '域名或IP被过滤，请检查 MyScript 控制台的 Filter 设置'
          } else {
            errorMessage = '访问被拒绝，请检查 API 密钥和权限设置'
          }
          break
        case 413:
          errorMessage = '笔画数据过大，单次请求不能超过 10,000 个点'
          break
        case 415:
          errorMessage = '不支持的媒体类型，请检查 Accept 头设置'
          break
        case 429:
          errorMessage = 'API 调用频率超限，请稍后重试'
          break
        default:
          errorMessage = `MyScript API 错误 (${response.status}): ${errorText}`
      }
      
      return NextResponse.json(
        { error: errorMessage, details: errorText },
        { status: response.status }
      )
    }
    
    const jiix = await response.json()
    console.log('✅ MyScript REST 识别成功')
    console.log('📋 完整 JIIX 响应:', JSON.stringify(jiix, null, 2))
    console.log('📋 识别结果摘要:', {
      hasWords: !!jiix.words,
      wordCount: jiix.words?.length || 0,
      text: jiix.text || '(无文本结果)',
      hasElements: !!jiix.elements,
      elementsCount: jiix.elements?.length || 0,
      jiixKeys: Object.keys(jiix)
    })
    
    // 解析 JIIX 结果为前端期望的格式
    const charactersMap = new Map<string, any[]>()
    const allCharacters: any[] = []
    
    // 递归函数：解析 Math 模式的表达式结构
    const parseMathExpression = (item: any, parentIndex = 0): void => {
      if (!item || !item['bounding-box']) return
      
      const bbox = item['bounding-box']
      let charText = ''
      let mathType = item.type || 'unknown'
      
      // 获取字符内容
      if (item.label) {
        charText = item.label
      } else if (item.value !== undefined) {
        charText = String(item.value)
      } else if (item.id) {
        // 从ID中提取可能的字符信息
        const idMatch = item.id.match(/math\/(\d+)/)
        charText = idMatch ? `id_${idMatch[1]}` : 'unknown'
      }
      
      if (charText && bbox) {
        const character = {
          id: `m${allCharacters.length.toString().padStart(3, '0')}`,
          char: charText,
          text: charText,
          bbox: { 
            x: bbox.x, 
            y: bbox.y, 
            w: bbox.width, 
            h: bbox.height 
          },
          center: { 
            x: bbox.x + bbox.width/2, 
            y: bbox.y + bbox.height/2 
          },
          confidence: item.confidence || 0.9,
          wordId: `math_${mathType}_${parentIndex}`,
          originalBbox: [bbox.x, bbox.y, bbox.width, bbox.height],
          candidates: [charText],
          mathType: mathType,
          rawElement: item
        }
        
        allCharacters.push(character)
      }
      
      // 递归处理子元素
      if (item.operands && Array.isArray(item.operands)) {
        item.operands.forEach((operand: any, index: number) => {
          parseMathExpression(operand, index)
        })
      }
      
      // 处理矩阵的行和单元格
      if (item.rows && Array.isArray(item.rows)) {
        item.rows.forEach((row: any, rowIndex: number) => {
          if (row.cells && Array.isArray(row.cells)) {
            row.cells.forEach((cell: any, cellIndex: number) => {
              parseMathExpression(cell, rowIndex * 100 + cellIndex)
            })
          }
        })
      }
      
      // 处理其他可能的子结构
      if (item.items && Array.isArray(item.items)) {
        item.items.forEach((subItem: any, index: number) => {
          parseMathExpression(subItem, index)
        })
      }
    }
    
    // 解析 Math 模式的 expressions 数组
    if (jiix && jiix.expressions && Array.isArray(jiix.expressions)) {
      console.log('📊 解析 Math 模式表达式:', jiix.expressions.length, '个表达式')
      
      jiix.expressions.forEach((expression: any, exprIndex: number) => {
        console.log(`📈 处理表达式 ${exprIndex}:`, expression.type)
        parseMathExpression(expression, exprIndex)
      })
    }
    
    // 回退：如果Math模式没有expressions，尝试解析elements数组 
    if (allCharacters.length === 0 && jiix && jiix.elements) {
      jiix.elements.forEach((element: any, elementIndex: number) => {
        if (element['bounding-box']) {
          const bbox = element['bounding-box']
          let charText = element.label || element.kind || `elem_${elementIndex}`
          
          const character = {
            id: `e${elementIndex.toString().padStart(3, '0')}`,
            char: charText,
            text: charText,
            bbox: { 
              x: bbox.x, 
              y: bbox.y, 
              w: bbox.width, 
              h: bbox.height 
            },
            center: { 
              x: bbox.x + bbox.width/2, 
              y: bbox.y + bbox.height/2 
            },
            confidence: 0.8,
            wordId: `element_${elementIndex}`,
            originalBbox: [bbox.x, bbox.y, bbox.width, bbox.height],
            candidates: [charText],
            rawElement: element
          }
          
          allCharacters.push(character)
        }
      })
    }
    
    // 最终回退：尝试解析Text模式的chars数组
    if (allCharacters.length === 0 && jiix && jiix.chars) {
      jiix.chars.forEach((char: any, charIndex: number) => {
        if (char['bounding-box'] && char.label) {
          const bbox = char['bounding-box']
          
          const character = {
            id: `c${charIndex.toString().padStart(3, '0')}`,
            char: char.label,
            text: char.label,
            bbox: { 
              x: bbox.x, 
              y: bbox.y, 
              w: bbox.width, 
              h: bbox.height 
            },
            center: { 
              x: bbox.x + bbox.width/2, 
              y: bbox.y + bbox.height/2 
            },
            confidence: char.confidence || 1.0,
            wordId: `word_${char.word || 0}`,
            originalBbox: [bbox.x, bbox.y, bbox.width, bbox.height],
            candidates: char.candidates || [char.label]
          }
          
          allCharacters.push(character)
        }
      })
    }
    
    console.log(`🔤 解析到 ${allCharacters.length} 个字符:`, 
      allCharacters.map(c => `${c.id}:${c.text}`).join(', '))
    
    if (allCharacters.length > 0) {
      charactersMap.set('recognized_text', allCharacters)
    }

    return NextResponse.json({
      success: true,
      characters: Object.fromEntries(charactersMap), // 转换为普通对象
      rawResponse: jiix,
      metadata: {
        provider: 'MyScript REST API',
        timestamp: new Date().toISOString(),
        strokeGroupsCount: payload.strokeGroups.length
      },
      performance: {
        totalTime: Date.now() - Date.now() // 简单的性能指标
      }
    })
    
  } catch (error) {
    console.error('❌ API Route 内部错误:', error)
    return NextResponse.json(
      { 
        error: '服务器内部错误', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    )
  }
}

function convertStrokesToMyScriptFormat(strokes: PointerEvent[]): any[] {
  console.log('🔍 原始笔画数据检查:', {
    strokesLength: strokes.length,
    firstStroke: strokes[0],
    sample: strokes.slice(0, 3)
  })

  if (!strokes || strokes.length === 0) {
    console.warn('⚠️ 笔画数据为空')
    return []
  }

  // 按 pointerId 分组笔画，同时考虑时间间隔来分割笔画
  const strokeGroups = new Map<number, PointerEvent[][]>()
  
  // 按 pointerId 分组
  const pointerGroups = new Map<number, PointerEvent[]>()
  strokes.forEach(stroke => {
    const id = stroke.pointerId || 0
    if (!pointerGroups.has(id)) {
      pointerGroups.set(id, [])
    }
    pointerGroups.get(id)!.push(stroke)
  })

  // 对每个指针组按时间分割笔画
  pointerGroups.forEach((points, pointerId) => {
    if (points.length === 0) return
    
    // 按时间排序
    points.sort((a, b) => a.t - b.t)
    
    // 根据时间间隔分割笔画 (超过100ms认为是新的笔画)
    const strokeSeparationThreshold = 100
    const separatedStrokes: PointerEvent[][] = []
    let currentStroke: PointerEvent[] = []
    
    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      
      if (currentStroke.length === 0) {
        currentStroke.push(point)
      } else {
        const lastPoint = currentStroke[currentStroke.length - 1]
        const timeDiff = point.t - lastPoint.t
        
        if (timeDiff > strokeSeparationThreshold) {
          // 时间间隔过大，开始新的笔画
          if (currentStroke.length > 1) { // 只保留有效的笔画
            separatedStrokes.push([...currentStroke])
          }
          currentStroke = [point]
        } else {
          currentStroke.push(point)
        }
      }
    }
    
    // 添加最后一个笔画
    if (currentStroke.length > 1) {
      separatedStrokes.push(currentStroke)
    }
    
    strokeGroups.set(pointerId, separatedStrokes)
  })

  // 转换为 MyScript v4.0 REST API 格式
  const result: any[] = []
  let globalStrokeId = 0
  
  strokeGroups.forEach((strokeList, pointerId) => {
    strokeList.forEach((points, strokeIndex) => {
      if (points.length < 2) return // 忽略过短的笔画
      
      // 验证数据有效性
      const validPoints = points.filter(p => 
        typeof p.x === 'number' && 
        typeof p.y === 'number' && 
        typeof p.t === 'number' &&
        !isNaN(p.x) && !isNaN(p.y) && !isNaN(p.t)
      )

      if (validPoints.length < 2) {
        console.warn(`⚠️ 笔画 ${pointerId}-${strokeIndex} 无效数据点`)
        return
      }

      // 平滑笔画数据（移除相邻的重复点）
      const smoothedPoints: PointerEvent[] = []
      for (let i = 0; i < validPoints.length; i++) {
        const point = validPoints[i]
        if (i === 0 || 
            Math.abs(point.x - smoothedPoints[smoothedPoints.length - 1].x) > 0.5 ||
            Math.abs(point.y - smoothedPoints[smoothedPoints.length - 1].y) > 0.5) {
          smoothedPoints.push(point)
        }
      }

      if (smoothedPoints.length < 2) return

      // 创建独立的strokeGroup，每个包含一个stroke
      result.push({
        strokes: [{
          id: `stroke-${globalStrokeId++}`,
          x: smoothedPoints.map(p => Math.round(p.x * 10) / 10), // 轻微量化以减少噪声
          y: smoothedPoints.map(p => Math.round(p.y * 10) / 10),
          t: smoothedPoints.map(p => p.t),
          p: smoothedPoints.map(p => p.p || 0.5),
          pointerType: 'pen'
        }]
      })
    })
  })

  console.log('🔄 转换后的strokeGroups:', {
    totalGroups: result.length,
    totalOriginalPoints: strokes.length,
    avgPointsPerStroke: result.length > 0 ? Math.round(strokes.length / result.length) : 0
  })
  
  if (result.length > 0) {
    console.log('📊 笔画分析:', {
      strokeCount: result.length,
      firstStrokeInfo: {
        id: result[0].strokes[0].id,
        pointsCount: result[0].strokes[0].x.length,
        xRange: [Math.min(...result[0].strokes[0].x), Math.max(...result[0].strokes[0].x)],
        yRange: [Math.min(...result[0].strokes[0].y), Math.max(...result[0].strokes[0].y)]
      }
    })
  }

  return result
}

async function calculateHMAC(key: string, message: string): Promise<string> {
  // 使用 Node.js crypto 模块计算 HMAC-SHA512
  const crypto = require('crypto')
  const hmac = crypto.createHmac('sha512', key)
  hmac.update(message)
  return hmac.digest('hex')
} 