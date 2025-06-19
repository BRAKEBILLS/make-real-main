// Data目录管理API
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// 确保data目录结构存在
async function ensureDataDirectories() {
  const dataDir = path.join(process.cwd(), 'data')
  const subdirs = ['ocr-results', 'visualizations', 'canvas-screenshots', 'coordinates', 'gpt-analysis']
  
  try {
    // 创建主data目录
    await fs.mkdir(dataDir, { recursive: true })
    
    // 创建子目录
    for (const subdir of subdirs) {
      await fs.mkdir(path.join(dataDir, subdir), { recursive: true })
    }
    
    return true
  } catch (error) {
    console.error('创建data目录失败:', error)
    return false
  }
}

export async function GET(req: NextRequest) {
  try {
    const success = await ensureDataDirectories()
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Data directories created successfully',
        directories: ['data/ocr-results', 'data/visualizations', 'data/canvas-screenshots', 'data/coordinates', 'data/gpt-analysis']
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to create data directories'
      }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, filename, content, type } = await req.json()
    
    switch (action) {
      case 'save-file':
        // 根据文件名前缀决定保存到哪个子目录
        let subdir = 'ocr-results'
        if (filename.startsWith('canvas_screenshot_')) {
          subdir = 'canvas-screenshots'
        } else if (filename.startsWith('coordinates_')) {
          subdir = 'coordinates'
        } else if (filename.startsWith('gpt_analysis_')) {
          subdir = 'gpt-analysis'
        } else if (filename.startsWith('visualization_')) {
          subdir = 'visualizations'
        }
        
        // 确保目录存在
        const targetDir = path.join(process.cwd(), 'data', subdir)
        await fs.mkdir(targetDir, { recursive: true })
        
        const filePath = path.join(targetDir, filename)
        
        if (type === 'json') {
          await fs.writeFile(filePath, content, 'utf8')
          console.log(`✅ JSON文件已保存: ${filePath}`)
        } else if (type === 'image') {
          // 处理base64图像数据
          const base64Data = content.replace(/^data:image\/\w+;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')
          await fs.writeFile(filePath, buffer)
          console.log(`✅ 图像文件已保存: ${filePath}`)
        }
        
        return NextResponse.json({
          success: true,
          message: `File saved to ${subdir}/${filename}`,
          path: `data/${subdir}/${filename}`,
          fullPath: filePath
        })
        
      case 'list-files':
        const dataDir = path.join(process.cwd(), 'data')
        const files = await fs.readdir(dataDir, { recursive: true })
        
        return NextResponse.json({
          success: true,
          files: files.filter(file => typeof file === 'string')
        })
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action'
        }, { status: 400 })
    }
  } catch (error) {
    console.error('Data directory API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
} 