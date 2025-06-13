import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // 重定向到正确的API路径
  const response = await fetch(`${req.nextUrl.origin}/makereal.tldraw.com/api/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: req.body
  })

  // 返回原始响应
  const data = await response.json()
  return NextResponse.json(data, { status: response.status })
} 