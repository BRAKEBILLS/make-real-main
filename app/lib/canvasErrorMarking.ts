// 画布错误标记工具
import { Editor, TLShapeId, createShapeId } from 'tldraw'
import { HandwritingError } from '../types/ocr'
import { animateCircle, animateStrikethrough, animateUnderline } from './simpleMarkingAnimation'

/**
 * 在tldraw画布上标记手写错误
 * 为每个错误创建红色圆圈标记
 */
export function markErrorsOnCanvas(
  editor: Editor,
  errors: HandwritingError[],
  style: 'smooth' | 'rough' = 'rough',
  useAnimation: boolean = false
): TLShapeId[] {
  if (useAnimation) {
    // 使用新的动画标记
    return markErrorsWithAnimation(editor, errors)
  }
  
  // 保持原有的静态标记实现
  const shapeIds: TLShapeId[] = []
  
  console.log(`🎯 开始在画布上标记 ${errors.length} 个错误`)
  console.log('📊 画布当前状态:', {
    viewport: editor.getViewportPageBounds(),
    camera: editor.getCamera(),
    zoom: editor.getZoomLevel()
  })
  
  // 获取画布上现有的shapes来了解坐标范围
  const currentShapes = editor.getCurrentPageShapes()
  if (currentShapes.length > 0) {
    const bounds = currentShapes.map(shape => ({
      x: shape.x,
      y: shape.y,
      w: 'w' in shape.props ? shape.props.w : 100,
      h: 'h' in shape.props ? shape.props.h : 100
    }))
    console.log('📐 现有shapes坐标范围:', bounds)
  }
  
  errors.forEach((error, index) => {
    try {
      console.log(`🔴 创建错误标记 ${index + 1}:`, error)
      
      // 🎯 优化：计算更合适的圆圈参数
      const centerX = error.center.x
      const centerY = error.center.y
      
      // 🔧 基于字符尺寸动态计算圆圈半径，确保不会太小或太大
      const baseRadius = Math.max(
        Math.max(error.bbox.w, error.bbox.h) * 1.2, // 增加到字符尺寸的120%，更大的圆圈
        35 // 最小半径35px，更大的最小尺寸
      )
      const radius = Math.min(baseRadius, 80) // 最大半径80px，允许更大的圆圈
      
      console.log(`  🎯 圆圈参数: 中心(${centerX.toFixed(1)}, ${centerY.toFixed(1)}), 半径=${radius.toFixed(1)}px`)
      console.log(`  📏 字符尺寸: ${error.bbox.w}×${error.bbox.h}, 建议半径: ${baseRadius.toFixed(1)}px`)
      
      // 创建圆形错误标记 - 根据风格选择不同的实现方式
      const circleShapeId = createShapeId()
      
      if (style === 'rough') {
        // 🎨 手写风格：geo ellipse + 随机变形创造手写效果
        const handwrittenCircle = createHandwrittenEllipse(editor, circleShapeId, centerX, centerY, radius)
        shapeIds.push(circleShapeId)
      } else {
        // 平滑风格：使用geo ellipse
        const circleShape = {
          id: circleShapeId,
          type: 'geo' as const,
          x: centerX - radius,
          y: centerY - radius,
          props: {
            geo: 'ellipse' as const,
            w: radius * 2,
            h: radius * 2,
            color: 'red' as const,
            fill: 'none' as const,
            dash: 'solid' as const,
            size: 'm' as const  // 改为m size，更粗的线条
          }
        }
        editor.createShape(circleShape)
      }
      
      shapeIds.push(circleShapeId)
      
      console.log(`  ✅ 错误标记创建成功: ${error.errorType} -> "${error.suggestion}" (风格: ${style})`)
      
    } catch (error) {
      console.error(`❌ 创建错误标记失败:`, error)
    }
  })
  
  console.log(`🔴 总共创建了 ${shapeIds.length} 个错误标记`)
  return shapeIds
}

/**
 * 清除画布上的错误标记
 */
export function clearErrorMarks(editor: Editor, errorShapeIds: TLShapeId[]): void {
  try {
    editor.deleteShapes(errorShapeIds)
    console.log(`🧹 清除了 ${errorShapeIds.length} 个错误标记`)
  } catch (error) {
    console.error('清除错误标记失败:', error)
  }
}

/**
 * 高亮特定错误
 */
export function highlightError(
  editor: Editor, 
  error: HandwritingError,
  duration: number = 2000
): TLShapeId | null {
  try {
    const shapeId = createShapeId()
    
    // 创建闪烁的高亮圆形
    const highlightShape = {
      id: shapeId,
      type: 'geo' as const,
      x: error.center.x - error.bbox.w/2 - 10,
      y: error.center.y - error.bbox.h/2 - 10,
      props: {
        geo: 'ellipse' as const,
        w: error.bbox.w + 20,
        h: error.bbox.h + 20,
        color: 'orange' as const,
        fill: 'semi' as const,
        dash: 'dashed' as const,
        size: 'l' as const
      }
    }
    
    editor.createShape(highlightShape)
    
    // 自动删除高亮
    setTimeout(() => {
      try {
        editor.deleteShape(shapeId)
      } catch (err) {
        console.warn('删除高亮标记失败:', err)
      }
    }, duration)
    
    return shapeId
  } catch (error) {
    console.error('高亮错误失败:', error)
    return null
  }
}

/**
 * 转换OCR坐标到画布坐标（如果需要坐标变换）
 */
export function convertOCRToCanvasCoords(
  ocrBbox: { x: number; y: number; w: number; h: number },
  ocrCenter: { x: number; y: number },
  transform?: {
    scale: number;
    offsetX: number;
    offsetY: number;
  }
): {
  bbox: { x: number; y: number; w: number; h: number };
  center: { x: number; y: number };
} {
  if (!transform) {
    // 如果没有变换，直接返回原坐标
    return {
      bbox: ocrBbox,
      center: ocrCenter
    }
  }
  
  const { scale, offsetX, offsetY } = transform
  
  return {
    bbox: {
      x: ocrBbox.x * scale + offsetX,
      y: ocrBbox.y * scale + offsetY,
      w: ocrBbox.w * scale,
      h: ocrBbox.h * scale
    },
    center: {
      x: ocrCenter.x * scale + offsetX,
      y: ocrCenter.y * scale + offsetY
    }
  }
}

/**
 * 创建手写风格错误圆圈（参考实现）
 * 注意：由于tldraw draw shape的复杂性，实际使用中建议使用geo shape + dash: 'draw'
 */
export function createHandwrittenErrorCircle(
  editor: Editor,
  error: HandwritingError,
  style: 'rough' | 'smooth' = 'rough'
): TLShapeId {
  const centerX = error.center.x;
  const centerY = error.center.y;
  const radius = Math.max(Math.max(error.bbox.w, error.bbox.h) * 1.2, 35); // 增加半径计算
  
  const circleShapeId = createShapeId();
  
  if (style === 'rough') {
    // 🎨 强化手写风格：使用geo ellipse + 最强手写参数
    const roughCircleShape = {
      id: circleShapeId,
      type: 'geo' as const,
      x: centerX - radius,
      y: centerY - radius,
      props: {
        geo: 'ellipse' as const,
        w: radius * 2,
        h: radius * 2,
        color: 'red' as const,
        fill: 'none' as const,
        dash: 'draw' as const,     // 手绘虚线 - 最强手写效果
        size: 'm' as const,        // 改为m size，更粗的线条
      }
    };
    
    editor.createShape(roughCircleShape);
    return circleShapeId;
  } else {
    // 平滑风格：使用现有geo圆形
    const smoothCircleShape = {
      id: circleShapeId,
      type: 'geo' as const,
      x: centerX - radius,
      y: centerY - radius,
      props: {
        geo: 'ellipse' as const,
        w: radius * 2,
        h: radius * 2,
        color: 'red' as const,
        fill: 'none' as const,
        dash: 'solid' as const,  // 实线
        size: 'm' as const,      // 改为m size，更粗的线条
      }
    };
    
    editor.createShape(smoothCircleShape);
    return circleShapeId;
  }
}

/**
 * 生成手绘风格圆圈路径点（仅供参考，draw shape实现复杂）
 * 注意：这个函数仅作为技术参考，实际项目中不推荐使用
 */
function generateRoughCircleSegments(centerX: number, centerY: number, radius: number) {
  const segments = [];
  const numPoints = 24; // 圆圈点数
  const roughness = 0.15; // 粗糙度
  
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    
    // 添加随机变化模拟手绘效果
    const radiusVariation = radius * (1 + (Math.random() - 0.5) * roughness);
    const angleVariation = angle + (Math.random() - 0.5) * 0.1;
    
    const x = centerX + Math.cos(angleVariation) * radiusVariation;
    const y = centerY + Math.sin(angleVariation) * radiusVariation;
    
    segments.push({
      type: i === 0 ? 'move' : 'line',
      x: x - centerX + radius,  // 相对坐标
      y: y - centerY + radius,
      z: 0.5 + Math.random() * 0.5  // 模拟压力
    });
  }
  
  return segments;
}

/**
 * 创建具有手写抖动效果的圆圈
 * 通过多个略微偏移的小圆弧来模拟真实手写的不规则性
 */
function createHandwrittenCircleWithJitter(
  editor: Editor, 
  centerX: number, 
  centerY: number, 
  radius: number
): TLShapeId[] {
  const shapeIds: TLShapeId[] = []
  const numSegments = 8 // 分成8段圆弧
  const jitterRange = 2 // 抖动范围 (像素)
  
  for (let i = 0; i < numSegments; i++) {
    const startAngle = (i / numSegments) * 2 * Math.PI
    const endAngle = ((i + 1) / numSegments) * 2 * Math.PI
    
    // 为每段添加随机抖动
    const jitterX = (Math.random() - 0.5) * jitterRange
    const jitterY = (Math.random() - 0.5) * jitterRange
    const radiusJitter = (Math.random() - 0.5) * 3 // 半径抖动
    
    const segmentRadius = radius + radiusJitter
    const segmentCenterX = centerX + jitterX
    const segmentCenterY = centerY + jitterY
    
    // 计算圆弧的起始和结束点
    const startX = segmentCenterX + Math.cos(startAngle) * segmentRadius
    const startY = segmentCenterY + Math.sin(startAngle) * segmentRadius
    const endX = segmentCenterX + Math.cos(endAngle) * segmentRadius
    const endY = segmentCenterY + Math.sin(endAngle) * segmentRadius
    
    // 创建线段来模拟圆弧（简化实现）
    const lineShapeId = createShapeId()
    const lineShape = {
      id: lineShapeId,
      type: 'line' as const,
      x: startX,
      y: startY,
      props: {
        points: {
          start: { id: 'start', index: 'a1' as const, x: 0, y: 0 },
          end: { 
            id: 'end', 
            index: 'a2' as const, 
            x: endX - startX, 
            y: endY - startY 
          }
        },
        color: 'red' as const,
        size: 'm' as const,
        spline: 'cubic' as const, // 使用曲线让线条更平滑
      }
    }
    
    editor.createShape(lineShape)
    shapeIds.push(lineShapeId)
  }
  
  return shapeIds
}

/**
 * 创建手写风格的椭圆（简单有效的方法）
 * 使用略微变形的椭圆来模拟手写不规则性
 */
function createHandwrittenEllipse(
  editor: Editor,
  shapeId: TLShapeId,
  centerX: number,
  centerY: number,
  radius: number
): void {
  // 添加随机变形来模拟手写效果
  const jitter = 3 // 变形程度
  const widthJitter = (Math.random() - 0.5) * jitter
  const heightJitter = (Math.random() - 0.5) * jitter
  const positionJitter = 1.5
  const xJitter = (Math.random() - 0.5) * positionJitter
  const yJitter = (Math.random() - 0.5) * positionJitter
  
  const finalWidth = (radius * 2) + widthJitter
  const finalHeight = (radius * 2) + heightJitter
  const finalX = (centerX - radius) + xJitter
  const finalY = (centerY - radius) + yJitter
  
  const circleShape = {
    id: shapeId,
    type: 'geo' as const,
    x: finalX,
    y: finalY,
    props: {
      geo: 'ellipse' as const,
      w: Math.max(20, finalWidth), // 确保最小尺寸
      h: Math.max(20, finalHeight),
      color: 'red' as const,
      fill: 'none' as const,
      dash: 'draw' as const, // 手绘虚线效果
      size: 'm' as const,    // 保持中等粗细
    }
  }
  
  editor.createShape(circleShape)
}

/**
 * 🎬 创建动画错误标记 - 带有绘制动画效果
 */
export function createAnimatedErrorMark(
  editor: Editor,
  error: HandwritingError,
  delay: number = 0
): TLShapeId {
  console.log(`🎬 创建动画错误标记: ${error.errorType} -> action: ${error.action}`)
  
  switch (error.action) {
    case 'circle':
      // 🔴 圆圈动画：围绕错误内容
      const radius = Math.max(Math.max(error.bbox.w, error.bbox.h) * 1.2, 35) // 增加半径
      const circleRadius = Math.min(radius, 80) // 增加最大半径
      return animateCircle(editor, error.center.x, error.center.y, circleRadius, delay)
      
    case 'strikethrough':
      // ❌ 删除线动画：水平穿过内容
      return animateStrikethrough(
        editor,
        error.bbox.x - 5,        // 起始X（稍微向左）
        error.center.y,          // Y坐标（中心线）
        error.bbox.w + 10,       // 宽度（稍微超出）
        delay
      )
      
    case 'underline':
      // ⭐ 下划线动画：在内容下方
      return animateUnderline(
        editor,
        error.bbox.x - 3,        // 起始X（稍微向左）
        error.bbox.y + error.bbox.h, // Y坐标（底部）
        error.bbox.w + 6,        // 宽度（稍微超出）
        delay
      )
      
    case 'highlight':
      // 🟡 高亮动画：使用现有的高亮函数
      const highlightId = highlightError(editor, error, 3000)
      return highlightId || createShapeId() // 如果失败则返回空ID
      
    default:
      // 默认使用现有的静态圆圈标记
      console.warn(`⚠️ 未知的action类型: ${error.action}，使用默认圆圈`)
      const defaultShapeId = createShapeId()
      createHandwrittenEllipse(editor, defaultShapeId, error.center.x, error.center.y, 30)
      return defaultShapeId
  }
}

/**
 * 🎬 批量创建动画错误标记 - 支持序列化显示
 */
export function markErrorsWithAnimation(
  editor: Editor,
  errors: HandwritingError[],
  sequentialDelay: number = 300
): TLShapeId[] {
  const shapeIds: TLShapeId[] = []
  
  console.log(`🎬 开始创建 ${errors.length} 个动画错误标记`)
  
  errors.forEach((error, index) => {
    const delay = index * sequentialDelay
    
    const shapeId = createAnimatedErrorMark(editor, error, delay)
    shapeIds.push(shapeId)
    
    console.log(`  ✅ 动画标记 ${index + 1}: ${error.action} (延迟: ${delay}ms)`)
  })
  
  console.log(`🎬 总共创建了 ${shapeIds.length} 个动画错误标记`)
  return shapeIds
}