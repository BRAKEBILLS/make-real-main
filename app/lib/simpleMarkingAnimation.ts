import { Editor, TLShapeId, createShapeId } from 'tldraw'

/**
 * 动画配置接口
 */
interface AnimationConfig {
  duration: number;
  delay: number;
  type: 'circle' | 'strikethrough' | 'underline';
}

/**
 * 计算圆形路径（用于路径长度计算）
 */
function getCirclePath(centerX: number, centerY: number, radius: number): string {
  return `M ${centerX + radius} ${centerY} A ${radius} ${radius} 0 1 1 ${centerX + radius - 0.1} ${centerY}`
}

/**
 * 计算路径长度（简化版本）
 */
function calculatePathLength(pathData: string): number {
  // 对于圆形，周长 = 2 * π * r
  // 这里是简化计算，实际应该解析路径
  const matches = pathData.match(/A ([0-9.]+)/);
  if (matches) {
    const radius = parseFloat(matches[1]);
    return 2 * Math.PI * radius;
  }
  return 100; // 默认长度
}

// 💡 预设CSS样式以确保新创建的形状立即隐藏
let stylesInjected = false;

function injectHiddenStyles() {
  if (stylesInjected) return;
  
  const style = document.createElement('style');
  style.id = 'tldraw-animation-styles';
  style.textContent = `
    /* 更精确的选择器，匹配tldraw的实际DOM结构 */
    svg.tl-svg-container path {
      transition: none !important;
    }
    
    /* 动画隐藏状态 */
    .tldraw-animation-hidden {
      stroke-dasharray: var(--path-length, 1000) !important;
      stroke-dashoffset: var(--path-length, 1000) !important;
      transition: none !important;
    }
    
    /* 动画显示状态 */
    .tldraw-animation-visible {
      stroke-dasharray: var(--path-length, 1000) !important;
      stroke-dashoffset: 0 !important;
      transition: stroke-dashoffset var(--animation-duration, 1500ms) ease-out !important;
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
  console.log('🎨 CSS预设样式已注入');
}

/**
 * 使用MutationObserver监听形状创建并立即应用动画
 */
function setupShapeObserver(shapeId: TLShapeId, duration: number) {
  // 确保CSS样式已注入
  injectHiddenStyles();
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          
          // 查找我们创建的形状 - 更广泛的搜索
          let shapeElement = element.querySelector(`[data-shape-id="${shapeId}"]`);
          if (!shapeElement && element.getAttribute?.('data-shape-id') === shapeId) {
            shapeElement = element;
          }
          
          if (shapeElement) {
            console.log(`🎯 检测到形状创建: ${shapeId}`);
            console.log('🔍 形状元素:', shapeElement);
            
            // 查找所有可能的路径元素
            const pathElements = shapeElement.querySelectorAll('path') as NodeListOf<SVGPathElement>;
            console.log(`📍 找到 ${pathElements.length} 个路径元素`);
            
            if (pathElements.length > 0) {
              // 处理第一个路径元素（通常是主要的绘制路径）
              const pathElement = pathElements[0];
              
              // 🚀 同步立即处理，不使用任何setTimeout
              try {
                console.log('🔧 同步处理路径动画...');
                
                // 立即尝试获取路径长度
                let pathLength: number;
                try {
                  pathLength = pathElement.getTotalLength();
                  console.log(`📏 路径长度: ${pathLength}`);
                } catch (error) {
                  console.warn('⚠️ 无法获取路径长度，使用默认值');
                  pathLength = 300; // 使用默认值
                }
                
                if (pathLength && pathLength > 0) {
                  // 🔧 立即同步设置隐藏样式
                  console.log('🫥 立即隐藏路径...');
                  pathElement.style.strokeDasharray = `${pathLength}`;
                  pathElement.style.strokeDashoffset = `${pathLength}`;
                  pathElement.style.transition = 'none';
                  
                  // 强制同步重绘
                  pathElement.getBoundingClientRect();
                  
                  console.log(`🫥 路径已隐藏: strokeDasharray=${pathLength}, strokeDashoffset=${pathLength}`);
                  
                  // 🔧 立即开始动画，仍然是同步的
                  console.log('🎬 立即启动动画...');
                  pathElement.style.setProperty('transition', `stroke-dashoffset ${duration}ms ease-out`, 'important');
                  pathElement.style.strokeDashoffset = '0';
                  
                  console.log(`🎬 动画已启动: ${shapeId}, 持续时间: ${duration}ms`);
                  
                  // 🔍 立即验证（同步）
                  const computedDashOffset = window.getComputedStyle(pathElement).strokeDashoffset;
                  const computedTransition = window.getComputedStyle(pathElement).transition;
                  console.log(`🔍 即时验证: dashOffset=${computedDashOffset}, transition=${computedTransition}`);
                  
                  // 🔧 如果transition不生效，立即启用手动动画
                  if (computedTransition === 'none' || computedTransition === 'all 0s ease 0s') {
                    console.log('⚠️ CSS transition失效，启动手动动画...');
                    
                    const startTime = Date.now();
                    const startOffset = pathLength;
                    
                    const animateFrame = () => {
                      const elapsed = Date.now() - startTime;
                      const progress = Math.min(elapsed / duration, 1);
                      
                      // 使用 ease-out 缓动函数
                      const easeOutProgress = 1 - Math.pow(1 - progress, 3);
                      const currentOffset = startOffset * (1 - easeOutProgress);
                      
                      pathElement.style.strokeDashoffset = `${currentOffset}px`;
                      
                      if (progress < 1) {
                        requestAnimationFrame(animateFrame);
                      } else {
                        console.log('🏁 手动动画完成');
                      }
                    };
                    
                    requestAnimationFrame(animateFrame);
                  }
                }
              } catch (error) {
                console.error('❌ 同步处理失败:', error);
              }
              
              // 停止观察
              observer.disconnect();
            } else {
              console.warn(`⚠️ 未找到路径元素: ${shapeId}`);
            }
          }
        }
      });
    });
  });
  
  // 开始观察DOM变化
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 5秒后自动断开观察器（防止内存泄漏）
  setTimeout(() => {
    observer.disconnect();
    console.log(`⏰ 观察器已超时断开: ${shapeId}`);
  }, 5000);
}

/**
 * 🔴 创建圆圈动画 - 从12点钟方向开始顺时针绘制
 */
export function animateCircle(
  editor: Editor,
  centerX: number,
  centerY: number,
  radius: number,
  delay: number = 0
): TLShapeId {
  const shapeId = createShapeId()
  
  console.log(`🔴 创建圆圈动画: 中心(${centerX}, ${centerY}), 半径=${radius}, 延迟=${delay}ms`)
  
  // 创建geo ellipse形状
  const circleShape = {
    id: shapeId,
    type: 'geo' as const,
    x: centerX - radius,
    y: centerY - radius,
    props: {
      geo: 'ellipse' as const,
      w: radius * 2,
      h: radius * 2,
      color: 'red' as const,
      fill: 'none' as const,
      dash: 'draw' as const,  // 手写风格
      size: 'm' as const,     // 保持m size，更粗的线条
    }
  }

  if (delay === 0) {
    // 设置观察器
    setupShapeObserver(shapeId, 1500);
    
    // 立即创建形状
    editor.createShape(circleShape);
    console.log(`✅ 圆圈形状已创建: ${shapeId}`);
  } else {
    setTimeout(() => {
      // 设置观察器
      setupShapeObserver(shapeId, 1500);
      
      // 创建形状
      editor.createShape(circleShape);
      console.log(`✅ 圆圈形状已创建: ${shapeId}`);
    }, delay);
  }

  return shapeId
}

/**
 * ❌ 创建删除线动画 - 从左到右绘制水平线
 */
export function animateStrikethrough(
  editor: Editor,
  startX: number,
  y: number,
  width: number,
  delay: number = 0
): TLShapeId {
  const shapeId = createShapeId()
  
  console.log(`❌ 创建删除线动画: 起点(${startX}, ${y}), 宽度=${width}, 延迟=${delay}ms`)
  
  // 创建line形状
  const lineShape = {
    id: shapeId,
    type: 'line' as const,
    x: startX,
    y: y - 2, // 稍微向上偏移
    props: {
      points: {
        start: { id: 'start', index: 'a1' as const, x: 0, y: 0 },
        end: { id: 'end', index: 'a2' as const, x: width, y: 0 }
      },
      color: 'red' as const,
      size: 'm' as const,
      dash: 'draw' as const,  // 手写风格
    }
  }

  if (delay === 0) {
    // 设置观察器
    setupShapeObserver(shapeId, 1000);
    
    // 立即创建形状
    editor.createShape(lineShape);
    console.log(`✅ 删除线形状已创建: ${shapeId}`);
  } else {
    setTimeout(() => {
      // 设置观察器
      setupShapeObserver(shapeId, 1000);
      
      // 创建形状
      editor.createShape(lineShape);
      console.log(`✅ 删除线形状已创建: ${shapeId}`);
    }, delay);
  }

  return shapeId
}

/**
 * ⭐ 创建下划线动画 - 从左到右绘制绿色强调线
 */
export function animateUnderline(
  editor: Editor,
  startX: number,
  y: number,
  width: number,
  delay: number = 0
): TLShapeId {
  const shapeId = createShapeId()
  
  console.log(`⭐ 创建下划线动画: 起点(${startX}, ${y}), 宽度=${width}, 延迟=${delay}ms`)
  
  // 创建line形状
  const lineShape = {
    id: shapeId,
    type: 'line' as const,
    x: startX,
    y: y + 3, // 向下偏移作为下划线
    props: {
      points: {
        start: { id: 'start', index: 'a1' as const, x: 0, y: 0 },
        end: { id: 'end', index: 'a2' as const, x: width, y: 0 }
      },
      color: 'green' as const,  // 绿色强调
      size: 'm' as const,
      dash: 'draw' as const,  // 手写风格
    }
  }

  if (delay === 0) {
    // 设置观察器
    setupShapeObserver(shapeId, 1200);
    
    // 立即创建形状
    editor.createShape(lineShape);
    console.log(`✅ 下划线形状已创建: ${shapeId}`);
  } else {
    setTimeout(() => {
      // 设置观察器
      setupShapeObserver(shapeId, 1200);
      
      // 创建形状
      editor.createShape(lineShape);
      console.log(`✅ 下划线形状已创建: ${shapeId}`);
    }, delay);
  }

  return shapeId
}



/**
 * 批量创建动画标记 - 支持序列化显示
 */
export function createSequentialAnimations(
  editor: Editor,
  animations: Array<{
    type: 'circle';
    params: [number, number, number]; // centerX, centerY, radius
  } | {
    type: 'strikethrough' | 'underline';
    params: [number, number, number]; // startX, y, width
  }>,
  sequentialDelay: number = 300
): TLShapeId[] {
  const shapeIds: TLShapeId[] = []
  
  animations.forEach((animation, index) => {
    const delay = index * sequentialDelay
    let shapeId: TLShapeId
    
    switch (animation.type) {
      case 'circle':
        const [centerX, centerY, radius] = animation.params
        shapeId = animateCircle(editor, centerX, centerY, radius, delay)
        break
      case 'strikethrough':
        const [startX1, y1, width1] = animation.params
        shapeId = animateStrikethrough(editor, startX1, y1, width1, delay)
        break
      case 'underline':
        const [startX2, y2, width2] = animation.params
        shapeId = animateUnderline(editor, startX2, y2, width2, delay)
        break
      default:
        // 如果类型不匹配，跳过这个动画
        return
    }
    
    shapeIds.push(shapeId)
  })
  
  console.log(`🎬 批量动画创建完成: ${shapeIds.length} 个动画`)
  return shapeIds
} 