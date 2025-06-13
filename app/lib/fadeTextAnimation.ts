/**
 * 简单文本渐变显示工具
 * 使用TLDraw原生text shape + CSS opacity过渡
 */
import { Editor, TLShapeId, createShapeId, toRichText } from 'tldraw'

/**
 * 创建渐变显示的文本
 * @param editor TLDraw编辑器实例
 * @param text 要显示的文本
 * @param x X坐标
 * @param y Y坐标
 * @param options 配置选项
 * @returns 创建的shape ID
 */
export function createFadeInText(
  editor: Editor,
  text: string,
  x: number,
  y: number,
  options: {
    font?: 'draw' | 'sans' | 'serif' | 'mono'
    size?: 's' | 'm' | 'l' | 'xl'
    color?: 'black' | 'grey' | 'light-violet' | 'violet' | 'blue' | 'light-blue' | 
           'yellow' | 'orange' | 'green' | 'light-green' | 'light-red' | 'red' | 'white'
    duration?: number
    delay?: number
    direction?: 'all' | 'left-to-right'
    charDelay?: number
  } = {}
): TLShapeId {
  // 设置默认值
  const {
    font = 'draw',
    size = 'm',
    color = 'green',
    duration = 1200,
    delay = 0,
    direction = 'left-to-right',
    charDelay = 50
  } = options

  // 创建带有fadein-pending类的文本shape
  const id = createShapeId()
  
  // 创建shape，尽管tldraw不直接支持className，但我们会在DOM元素上添加
  editor.createShape({
    id,
    type: 'text',
    x,
    y,
    props: {
      richText: toRichText(text),
      font,
      size,
      color
    }
  })

  // 立即尝试添加CSS类，防止闪烁
  const addPendingClass = () => {
    const el = document.querySelector(`[data-shape-id="${id}"]`) as HTMLElement
    if (el) {
      // 添加CSS类，立即隐藏元素
      el.classList.add('fadein-pending')
      console.log('✅ 已添加fadein-pending类，防止初始闪烁')
    } else {
      // 如果找不到元素，可能是因为DOM还没有完全渲染，稍后再试
      requestAnimationFrame(addPendingClass)
    }
  }
  
  // 立即尝试添加CSS类
  requestAnimationFrame(addPendingClass)

  // 使用更健壮的方式设置动画
  const applyAnimation = () => {
    setTimeout(() => {
      // 查找shape元素
      const el = document.querySelector(`[data-shape-id="${id}"]`) as HTMLElement
      if (!el) {
        console.warn(`⚠️ 无法找到元素: [data-shape-id="${id}"]，重试中...`)
        // 如果找不到元素，可能还没渲染完成，再次尝试
        setTimeout(applyAnimation, 100)
        return
      }

      console.log(`✅ 找到shape元素: [data-shape-id="${id}"]`, el)
      
      // 确保DOM已经完全加载 - 如果元素有fadein-pending类，保留它直到我们准备好动画
      
      if (direction === 'all') {
        // 整体淡入淡出效果
        
        // 开始动画前先确保元素完全隐藏
        el.style.opacity = '0'
        
        // 移除防闪烁类，但保持不可见
        el.classList.remove('fadein-pending')
        
        // 设置过渡效果
        el.style.transition = `opacity ${duration}ms ease`
        
        // 启动过渡
        requestAnimationFrame(() => {
          el.style.opacity = '1'
        })
      } else if (direction === 'left-to-right') {
        // 从左到右逐字淡入效果 - 使用多种方法查找文本元素
        
        // 方法1: 尝试直接查找tldraw文本元素
        const textElement = el.querySelector('[data-text-el="true"]') as HTMLElement
        
        // 方法2: 查找可编辑的div
        const editableDiv = el.querySelector('[contenteditable="true"]') as HTMLElement
        
        // 方法3: 查找text节点
        const textNodes = Array.from(el.querySelectorAll('*')).filter(node => 
          node.childNodes.length === 1 && 
          node.childNodes[0].nodeType === Node.TEXT_NODE &&
          node.textContent?.includes(text.substring(0, Math.min(10, text.length)))
        )
        
        // 方法4: 查找任何包含文本的元素
        const anyTextElements = Array.from(el.querySelectorAll('*')).filter(node => 
          node.textContent?.trim() === text.trim()
        )
        
        // 记录所有找到的可能元素
        console.log('可能的文本元素:', {
          方法1_textElement: textElement,
          方法2_editableDiv: editableDiv,
          方法3_textNodes: textNodes,
          方法4_anyTextElements: anyTextElements
        })
        
        // 尝试按优先级使用找到的元素
        let targetElement: HTMLElement | null = null
        
        if (textElement) {
          console.log('使用方法1找到的textElement')
          targetElement = textElement
        } else if (editableDiv) {
          console.log('使用方法2找到的editableDiv')
          targetElement = editableDiv
        } else if (textNodes.length > 0) {
          console.log('使用方法3找到的textNode父元素')
          targetElement = textNodes[0] as HTMLElement
        } else if (anyTextElements.length > 0) {
          console.log('使用方法4找到的文本元素')
          targetElement = anyTextElements[0] as HTMLElement
        } else {
          // 如果依然找不到，直接使用shape元素本身
          console.log('未找到特定文本元素，使用shape元素本身')
          targetElement = el
        }
        
        // 如果找到了目标元素，应用打字机效果
        if (targetElement) {
          console.log('应用打字机效果到元素:', targetElement)
          
          // 创建覆盖层容器 - 在我们准备好动画效果之前，保持fadein-pending类
          const container = document.createElement('div')
          container.style.position = 'absolute'
          container.style.top = '0'
          container.style.left = '0'
          container.style.width = '100%'
          container.style.height = '100%'
          container.style.display = 'flex'
          container.style.flexDirection = 'row'
          container.style.flexWrap = 'wrap'
          container.style.pointerEvents = 'none' // 不干扰鼠标事件
          container.style.zIndex = '100'
          container.style.userSelect = 'none' // 防止文本被选中
          
          try {
            // 尝试获取计算样式
            const computedStyle = getComputedStyle(targetElement)
            container.style.fontFamily = computedStyle.fontFamily
            container.style.fontSize = computedStyle.fontSize
            container.style.color = computedStyle.color
            container.style.fontWeight = computedStyle.fontWeight
            
            // 额外添加文本的padding和margin
            container.style.padding = computedStyle.padding
            container.style.margin = computedStyle.margin
            container.style.lineHeight = computedStyle.lineHeight
          } catch (err) {
            console.warn('获取计算样式失败，使用默认样式', err)
          }
          
          // 在容器准备好之后，永久隐藏原始文本元素
          const hideOriginalText = () => {
            Array.from(el.querySelectorAll('*')).forEach(node => {
              if (node !== container && node.textContent?.trim() === text.trim()) {
                (node as HTMLElement).style.opacity = '0';
                (node as HTMLElement).style.visibility = 'hidden'; // 完全隐藏
              }
            });
          };
          
          // 保存原始文本内容，以便我们可以设置一个不可见的文本
          const originalText = targetElement.textContent || '';
          
          // 分割文本并创建每个字符的span
          const chars = text.split('')
          chars.forEach((char, index) => {
            const span = document.createElement('span')
            span.textContent = char
            span.style.opacity = '0'
            span.style.transition = 'opacity 0.3s ease'
            
            // 如果是空格，确保它显示正确
            if (char === ' ') {
              span.style.width = '0.5em'
              span.style.display = 'inline-block'
            }
            
            container.appendChild(span)
            
            // 设置延迟显示
            setTimeout(() => {
              span.style.opacity = '1'
            }, index * charDelay)
          })
          
          // 添加覆盖层到DOM
          el.appendChild(container)
          
          // 只有在容器添加后才移除fadein-pending类，防止闪烁
          el.classList.remove('fadein-pending')
          
          // 确保原始文本元素隐藏
          hideOriginalText();
          
          // 创建一个MutationObserver来监视tldraw元素的变化
          // 确保我们的隐藏设置不会被覆盖
          const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
              if (mutation.type === 'attributes' || mutation.type === 'childList') {
                // 重新隐藏所有文本元素
                hideOriginalText();
              }
            });
          });
          
          // 开始观察，监视属性和子节点变化
          observer.observe(el, { 
            attributes: true, 
            childList: true, 
            subtree: true 
          });
          
          // 打印调试信息
          console.log(`✅ 创建了打字机效果动画，包含${chars.length}个字符`)
        } else {
          // 回退到简单淡入效果
          console.warn('无法找到适合的文本元素，回退到简单淡入效果')
          el.style.opacity = '0'
          
          // 移除防闪烁类
          el.classList.remove('fadein-pending')
          
          el.style.transition = `opacity ${duration}ms ease`
          
          requestAnimationFrame(() => {
            el.style.opacity = '1'
          })
        }
      }

      // 调试信息
      console.log(`✅ 创建渐变文本: "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}"`)
    }, delay)
  }
  
  // 开始应用动画
  requestAnimationFrame(applyAnimation)

  return id
}

/**
 * 创建智能建议的完整UI
 * 创建错误标记和对应的文本建议
 */
export function createSmartSuggestions(
  editor: Editor,
  suggestions: Array<{
    text: string
    x: number
    y: number
    delay?: number
  }>
): TLShapeId[] {
  const createdIds: TLShapeId[] = []
  
  suggestions.forEach((suggestion, index) => {
    const id = createFadeInText(
      editor,
      suggestion.text,
      suggestion.x,
      suggestion.y,
      {
        font: 'draw',
        size: 'm',
        color: 'green',
        direction: 'left-to-right',
        delay: suggestion.delay,
        charDelay: 50 // 每个字符的延迟
      }
    )
    createdIds.push(id)
  })
  
  return createdIds
} 