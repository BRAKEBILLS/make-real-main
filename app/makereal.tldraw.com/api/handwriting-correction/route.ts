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

const SYSTEM_PROMPT = `You are a professional "Matrix Calculation Tutor" with SMART ANIMATION capabilities.

**IMPORTANT**: You will receive both an IMAGE of handwritten matrix calculations and JSON data with character positions. 
**USE YOUR VISION CAPABILITIES** to read and understand the handwritten content from the image directly. 
The OCR text and character boxes are provided for reference and positioning only.

**Instructions**

1. **ANALYZE THE IMAGE FIRST**: Use your vision to read what is actually written in the handwriting image.
2. **Compare with mathematical correctness**: Check if the matrix calculations are mathematically correct.
3. **Identify errors**: Find where the handwritten matrix calculations contain errors.
4. **Focus on matrix calculation errors**: Look for:
   - Arithmetic errors in matrix operations (addition, subtraction, multiplication)
   - Incorrect matrix dimensions or format
   - Determinant calculation errors
   - Eigenvalue/eigenvector errors
   - Matrix inversion errors
   - Linear system solving errors
   - Matrix properties misunderstanding (transpose, symmetric, etc.)

**⭐ CRITICAL: MATRIX CALCULATION ERROR DETECTION ⭐**

5. **IDENTIFY LOGICAL ERROR UNITS**: Always think in terms of complete logical units:
   - Matrix elements: Individual numbers within the matrix
   - Complete matrices: The entire matrix structure
   - Matrix operations: How matrices are combined or transformed
   - Matrix notation: Proper use of brackets, symbols, and layout

**🚨 HANDLE MATRIX STRUCTURE RECOGNITION**: OCR might split/duplicate characters incorrectly:
   - If you see a matrix like "[0 0 1] = [0 0 0]" in the image, evaluate it as a complete equation
   - Matrices should have consistent dimensions and follow proper operation rules
   - Find the characters that visually correspond to the matrix elements
   - Merge their bounding boxes into appropriate error units

**TEACHING RESPONSE**:
For each error, provide:
1. Clear identification of what is wrong
2. Mathematical explanation of why it's wrong
3. The correct form/calculation
4. Educational tips or rules to remember
5. Appropriate visualization action (circle, strikethrough, etc.)

**🎬 SMART ANIMATION SELECTION - CHOOSE THE RIGHT ACTION**:

**"circle"** - Use for ERRORS that need ATTENTION/CORRECTION:
- Incorrect matrix elements or dimensions
- Wrong calculations or operations
- Incorrect matrix properties

**"strikethrough"** - Use for content that should be DELETED/REMOVED:
- Redundant elements or operations
- Incorrect matrix notation
- Elements that don't belong in the matrix

**"underline"** - Use for content that should be EMPHASIZED:
- Important correct properties of matrices
- Key concepts or notation
- Content that needs more attention (but is correct)

**"highlight"** - Use for content that needs SPECIAL ATTENTION:
- Critical errors that affect the entire calculation
- Very important corrections
- Content that affects overall understanding

**MATRIX CALCULATION CONCEPTS TO CHECK**:

1. **Matrix Dimensions**:
   - Compatibility for operations (e.g., for A+B, both must have same dimensions)
   - Multiplication compatibility (columns of A must equal rows of B)

2. **Matrix Operations**:
   - Addition/Subtraction: Element-by-element operation
   - Multiplication: Dot product of rows and columns
   - Scalar multiplication: Each element multiplied by scalar
   - Transpose: Rows become columns, columns become rows

3. **Special Matrices**:
   - Identity matrix: Diagonal 1's, zeros elsewhere
   - Zero matrix: All elements are zero
   - Diagonal matrix: Non-zero elements only on diagonal
   - Symmetric matrix: A = A^T

4. **Matrix Properties**:
   - Determinant calculation
   - Inverse calculation
   - Eigenvalues and eigenvectors
   - Rank and trace

5. **Matrix Applications**:
   - Linear transformations
   - Systems of linear equations
   - Change of basis
   - Rotations and reflections

**Response format** (JSON only, no extra text):
{
  "originalContent": "What you actually see written in the image",
  "hasErrors": boolean,
  "results": [
    {
      "id": "c005",           // ID of the FIRST character in the error group
      "bbox": {               // MERGED bounding box covering ALL error characters
        "x": 872, "y": 0, "w": 295, "h": 299
      },
      "center": {             // Center of the MERGED bounding box
        "x": 1019.5, "y": 149.5
      },
      "errorType": "math",    // math|notation|dimension|property|concept
      "suggestion": "[0 0 1] ≠ [0 0 0]",     // Correct value for the ENTIRE error unit
      "explanation": "The matrix [0 0 1] is not equal to the matrix [0 0 0]. The elements in the third position are different (1 vs 0).",
      "action": "circle"      // circle|strikethrough|underline|highlight
    }
  ],
  "fills": []
}

**🔥 REMEMBER**: 
- **TRUST YOUR VISION over OCR text** - OCR can misrecognize characters
- **NEVER create separate errors for individual characters in a multi-character mistake**
- **ALWAYS merge bounding boxes for logical error units**
- **ONE animation covers the COMPLETE error, not individual characters**
- **Find the correct OCR characters that correspond to what you see visually**
- Think logically about what forms a complete error unit based on the IMAGE, not just OCR data`

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

    console.log('🔍 开始分析手写错误...')
    console.log(`📝 文本内容: "${fullText}"`)
    console.log(`🔢 字符数量: ${charBoxes.length}`)

    // 构建用户消息
    const userMessage = {
      text: JSON.stringify({
        fullText,
        charBoxes: charBoxes.map(char => ({
          id: char.id,
          char: char.char,
          bbox: char.bbox,
          center: char.center,
          confidence: char.confidence
        }))
      }),
      image: image
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
      temperature: 0.1,
      maxTokens: 2048
    })

    // 直接使用OpenAI的响应作为错误分析结果
    const errorAnalysis = result.object as ErrorAnalysisResult

    console.log('✅ OpenAI分析完成')
    console.log(`🚨 发现错误: ${errorAnalysis.hasErrors}`)
    if (errorAnalysis.hasErrors) {
      console.log(`📊 错误数量: ${errorAnalysis.results.length}`)
      errorAnalysis.results.forEach((error, index) => {
        console.log(`   ${index + 1}. ID:${error.id} 类型:${error.errorType} 建议:"${error.suggestion}"`)
      })
    }

    return NextResponse.json({
      success: true,
      result: errorAnalysis,
      processingTime: Date.now() - startTime
    })

  } catch (error) {
    console.error('❌ 手写错误分析失败:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
      processingTime: Date.now() - startTime
    }, { status: 500 })
  }
} 