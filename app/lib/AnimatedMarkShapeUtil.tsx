import React from 'react'
import { 
  ShapeUtil, 
  TLBaseShape, 
  SVGContainer,
  RecordProps,
  T,
  Geometry2d,
  Rectangle2d,
  resizeBox
} from 'tldraw'
import { motion } from 'framer-motion'

/**
 * AnimatedMark Shape - 用于GPT错误标记的动画效果
 */
export type AnimatedMarkShape = TLBaseShape<
  'animated-mark',
  {
    markType: 'circle' | 'strikethrough' | 'underline' | 'highlight'
    pathData: string
    color: string
    strokeWidth: number
    duration: number
    delay: number
    w: number
    h: number
  }
>

export class AnimatedMarkShapeUtil extends ShapeUtil<AnimatedMarkShape> {
  static override type = 'animated-mark' as const
  
  static override props: RecordProps<AnimatedMarkShape> = {
    markType: T.literalEnum('circle', 'strikethrough', 'underline', 'highlight'),
    pathData: T.string,
    color: T.string,
    strokeWidth: T.number,
    duration: T.number,
    delay: T.number,
    w: T.number,
    h: T.number
  }

  getDefaultProps(): AnimatedMarkShape['props'] {
    return {
      markType: 'circle',
      pathData: '',
      color: '#ef4444',
      strokeWidth: 3,
      duration: 1200,
      delay: 0,
      w: 50,
      h: 50
    }
  }

  getGeometry(shape: AnimatedMarkShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: false
    })
  }

  canResize = () => true
  canBind = () => false
  onResize = resizeBox

  component(shape: AnimatedMarkShape) {
    const { pathData, color, strokeWidth, duration, delay } = shape.props

    if (!pathData) return null

    return (
      <SVGContainer>
        <motion.path
          d={pathData}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: {
              duration: duration / 1000,
              delay: delay / 1000,
              ease: "easeOut"
            },
            opacity: {
              duration: 0.1,
              delay: delay / 1000
            }
          }}
          style={{
            filter: 'url(#handwriting-roughness)'
          }}
        />
        
        {/* 手写效果滤镜 */}
        <defs>
          <filter id="handwriting-roughness" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence 
              baseFrequency="0.04" 
              numOctaves="3" 
              result="noise"
            />
            <feDisplacementMap 
              in="SourceGraphic" 
              in2="noise" 
              scale="0.8"
            />
          </filter>
        </defs>
      </SVGContainer>
    )
  }
  
  indicator(shape: AnimatedMarkShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

/**
 * 路径生成工具 - 为不同类型的标记生成SVG路径
 */
export class PathGenerator {
  /**
   * 生成圆圈路径（手写风格，不完全闭合）
   */
  static generateCirclePath(centerX: number, centerY: number, radius: number): string {
    // 创建略微不规则的手写圆圈，从12点开始顺时针
    const startAngle = -Math.PI / 2 // 12点位置
    const endAngle = startAngle + 2 * Math.PI * 0.95 // 不完全闭合
    
    // 添加轻微的不规则性
    const irregularity = radius * 0.1
    
    let path = `M ${centerX} ${centerY - radius}`
    
    // 使用多个三次贝塞尔曲线创建手写风格的圆圈
    const segments = 8
    for (let i = 1; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segments)
      const prevAngle = startAngle + (endAngle - startAngle) * ((i - 1) / segments)
      
      // 添加随机变化
      const radiusVariation = radius + (Math.random() - 0.5) * irregularity
      const x = centerX + radiusVariation * Math.cos(angle)
      const y = centerY + radiusVariation * Math.sin(angle)
      
      // 控制点
      const cp1Angle = prevAngle + (angle - prevAngle) * 0.33
      const cp2Angle = prevAngle + (angle - prevAngle) * 0.67
      const cp1X = centerX + radius * Math.cos(cp1Angle) * 1.1
      const cp1Y = centerY + radius * Math.sin(cp1Angle) * 1.1
      const cp2X = centerX + radius * Math.cos(cp2Angle) * 1.1
      const cp2Y = centerY + radius * Math.sin(cp2Angle) * 1.1
      
      path += ` C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x} ${y}`
    }
    
    return path
  }

  /**
   * 生成删除线路径（手写风格，略微倾斜）
   */
  static generateStrikethroughPath(startX: number, y: number, width: number): string {
    // 轻微的手写倾斜和不规则性
    const endX = startX + width
    const slope = (Math.random() - 0.5) * 0.05 // 轻微倾斜
    const endY = y + slope * width
    
    // 添加中间的控制点使线条更自然
    const midX = startX + width / 2
    const midY = y + slope * width / 2 + (Math.random() - 0.5) * 3
    
    return `M ${startX} ${y} Q ${midX} ${midY} ${endX} ${endY}`
  }

  /**
   * 生成下划线路径（手写风格）
   */
  static generateUnderlinePath(startX: number, y: number, width: number): string {
    // 类似删除线，但通常更平直
    const endX = startX + width
    const endY = y + (Math.random() - 0.5) * 2 // 更小的变化
    
    // 轻微的弧度
    const midX = startX + width / 2
    const midY = y + (Math.random() - 0.5) * 1
    
    return `M ${startX} ${y} Q ${midX} ${midY} ${endX} ${endY}`
  }

  /**
   * 生成高亮路径（矩形区域）
   */
  static generateHighlightPath(x: number, y: number, width: number, height: number): string {
    // 简单的矩形路径
    return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`
  }
}

/**
 * 创建动画标记Shape的辅助函数
 */
export function createAnimatedMarkShape(
  markType: AnimatedMarkShape['props']['markType'],
  boundingBox: { x: number; y: number; w: number; h: number },
  options: Partial<AnimatedMarkShape['props']> = {}
): Omit<AnimatedMarkShape, 'id' | 'typeName' | 'index'> {
  
  let pathData = ''
  let shapeW = boundingBox.w
  let shapeH = boundingBox.h
  
  const centerX = boundingBox.w / 2
  const centerY = boundingBox.h / 2
  
  switch (markType) {
    case 'circle':
      const radius = Math.max(Math.max(boundingBox.w, boundingBox.h) * 0.6, 20)
      pathData = PathGenerator.generateCirclePath(centerX, centerY, radius)
      shapeW = shapeH = radius * 2.2
      break
      
    case 'strikethrough':
      pathData = PathGenerator.generateStrikethroughPath(0, centerY, boundingBox.w)
      break
      
    case 'underline':
      pathData = PathGenerator.generateUnderlinePath(0, boundingBox.h, boundingBox.w)
      break
      
    case 'highlight':
      pathData = PathGenerator.generateHighlightPath(0, 0, boundingBox.w, boundingBox.h)
      break
  }

  return {
    type: 'animated-mark',
    x: boundingBox.x - (shapeW - boundingBox.w) / 2,
    y: boundingBox.y - (shapeH - boundingBox.h) / 2,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    parentId: null,
    props: {
      markType,
      pathData,
      color: '#ef4444',
      strokeWidth: 3,
      duration: 1200,
      delay: 0,
      w: shapeW,
      h: shapeH,
      ...options
    }
  }
}

/**
 * 批量创建序列化动画标记
 */
export function createSequentialAnimatedMarks(
  marks: Array<{
    type: AnimatedMarkShape['props']['markType']
    boundingBox: { x: number; y: number; w: number; h: number }
    options?: Partial<AnimatedMarkShape['props']>
  }>,
  baseDelay: number = 300
): Array<Omit<AnimatedMarkShape, 'id' | 'typeName' | 'index'>> {
  
  return marks.map((mark, index) => {
    const delay = index * baseDelay
    return createAnimatedMarkShape(mark.type, mark.boundingBox, {
      delay,
      ...mark.options
    })
  })
} 