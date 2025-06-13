import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// 确保从环境变量获取API密钥
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  try {
    // 解析请求参数
    const { text, voice = "nova", style = "friendly", speed = 1.0, stream = false } = await req.json()

    // 参数校验
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    // 限制长文本，防止API超时
    if (text.length > 4000) {
      return NextResponse.json({ 
        error: 'Text too long (>4000 characters)' 
      }, { status: 400 })
    }

    console.log(`🔊 TTS请求: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)

    // 调用OpenAI TTS API
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      input: text,
      voice,         // alloy | echo | fable | onyx | nova | shimmer
      format: "mp3", // mp3 | opus | aac | flac | wav
      speed,
      style,         // friendly | excited | ... 可选
      stream
    })

    // 将Buffer转为base64
    const buffer = Buffer.from(await response.arrayBuffer())
    const base64Audio = buffer.toString('base64')

    console.log(`✅ TTS生成成功: ${buffer.length} 字节`)

    // 返回base64编码的音频数据
    return NextResponse.json({ 
      audio: `data:audio/mpeg;base64,${base64Audio}`,
      text, // 返回原始文本，方便前端跟踪
      meta: {
        voice,
        style,
        speed,
        length: text.length,
        bytes: buffer.length
      }
    })
  } catch (error: any) {
    console.error('❌ TTS API错误:', error.message)
    // 返回错误信息
    return NextResponse.json({ 
      error: error.message || 'TTS processing failed',
      code: error.code || 'unknown_error'
    }, { status: error.status || 500 })
  }
} 