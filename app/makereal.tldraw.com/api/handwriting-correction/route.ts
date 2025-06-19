import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ErrorAnalysisRequest, ErrorAnalysisResult } from '../../../types/ocr'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// OpenAI响应的Zod schema
const ErrorAnalysisSchema = z.object({
  originalContent: z.string(),
  hasErrors: z.boolean(),
  results: z.array(z.object({
    id: z.string(),
    bbox: z.object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number()
    }),
    center: z.object({
      x: z.number(),
      y: z.number()
    }),
    errorType: z.enum(['math', 'notation', 'dimension', 'property', 'concept']),
    suggestion: z.string(),
    explanation: z.string(),
    action: z.enum(['circle', 'strikethrough', 'underline', 'highlight'])
  })),
  fills: z.array(z.string()).default([])
})

const SYSTEM_PROMPT = `You are a mathematics professor analyzing handwritten matrix calculations.

**TASK**: Find mathematical errors in the handwritten content shown in the image.

**FOCUS**: Matrix operations, calculations, and numerical values.

**WHEN YOU FIND AN ERROR**:
- Identify the coordinate ID of the wrong element (c001, c002, etc.)
- Provide the correct value
- Explain why it's wrong

**RESPONSE FORMAT**:
Return JSON with:
- originalContent: What you see in the math
- hasErrors: true/false  
- results: Array of errors with id, suggestion, explanation, and action: "circle"

Analyze the mathematics carefully and find any calculation errors.`

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { image, charBoxes, fullText }: ErrorAnalysisRequest = await req.json()
    
    if (!image || !charBoxes || !fullText) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: image, charBoxes, fullText',
        processingTime: Date.now() - startTime
      }, { status: 400 })
    }

    // 使用环境变量中的API密钥
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.',
        processingTime: Date.now() - startTime
      }, { status: 500 })
    }
    const openai = createOpenAI({ apiKey })

    console.log('🔍 Starting handwriting error analysis...')
    console.log(`📝 Analysis mode: Pure visual analysis (ignoring OCR text)`)
    console.log(`🔢 Character positions count: ${charBoxes.length}`)

    // 🎯 检测图像格式并记录日志
    let imageFormat = 'unknown'
    if (image.startsWith('data:image/png')) {
      imageFormat = 'PNG'
      console.log('📷 Image format: PNG detected - Perfect for OpenAI!')
    } else if (image.startsWith('data:image/jpeg') || image.startsWith('data:image/jpg')) {
      imageFormat = 'JPEG'
      console.log('📷 Image format: JPEG detected - Supported by OpenAI')
    } else if (image.startsWith('data:image/svg+xml')) {
      imageFormat = 'SVG'
      console.log('📷 Image format: SVG detected - Will use directly')
    } else {
      console.warn('⚠️ Unknown image format, proceeding anyway:', image.substring(0, 50))
    }

    // 直接使用前端生成的PNG图像，无需转换
    const processedImage = image

    // 构建用户消息 - 只传递位置信息，不传递OCR文本
    const userMessage = {
      text: JSON.stringify({
        message: "Please analyze the handwritten mathematical content and identify any calculation errors. Use only your visual ability to analyze the image, ignoring any text recognition data.",
        characterPositions: charBoxes.map(char => ({
          id: char.id,
          bbox: char.bbox,
          center: char.center
        }))
      }),
      image: processedImage
    }

    // 调用OpenAI进行结构化生成
    const result = await generateObject({
      model: openai('gpt-4o'),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userMessage.text
            },
            {
              type: 'image',
              image: image
            }
          ]
        }
      ],
      schema: ErrorAnalysisSchema,
      temperature: 0,
      maxTokens: 2048
    })

    // 直接使用OpenAI的响应作为错误分析结果
    const errorAnalysis = result.object as ErrorAnalysisResult

    console.log('✅ OpenAI analysis completed')
    console.log(`🚨 Errors found: ${errorAnalysis.hasErrors}`)
    if (errorAnalysis.hasErrors) {
      console.log(`📊 Error count: ${errorAnalysis.results.length}`)
      errorAnalysis.results.forEach((error, index) => {
        console.log(`   ${index + 1}. ID:${error.id} Type:${error.errorType} Suggestion:"${error.suggestion}"`)
      })
    }

    return NextResponse.json({
      success: true,
      result: errorAnalysis,
      processingTime: Date.now() - startTime
    })

  } catch (error) {
    console.error('❌ Matrix analysis failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: Date.now() - startTime
    }, { status: 500 })
  }
} 