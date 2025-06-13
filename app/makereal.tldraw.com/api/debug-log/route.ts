import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()
    
    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }
    
    // 输出到服务器终端
    console.log(`[OCR调试] ${message}`)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('调试日志API错误:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 