// 图像预处理工具
import { ImageProcessingOptions } from '../types/ocr'

/**
 * 将Canvas转换为ImageData进行处理
 */
export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')!
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * 将ImageData转换回Canvas
 */
export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * 灰度化处理
 */
export function toGrayscale(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data)
  
  for (let i = 0; i < data.length; i += 4) {
    // 使用标准灰度化公式: Y = 0.299*R + 0.587*G + 0.114*B
    const gray = Math.round(
      data[i] * 0.299 +     // Red
      data[i + 1] * 0.587 + // Green
      data[i + 2] * 0.114   // Blue
    )
    
    data[i] = gray         // Red
    data[i + 1] = gray     // Green
    data[i + 2] = gray     // Blue
    // Alpha保持不变 data[i + 3]
  }
  
  return new ImageData(data, imageData.width, imageData.height)
}

/**
 * 二值化处理 (Otsu自动阈值法)
 */
export function toBinary(imageData: ImageData, threshold?: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data)
  
  // 如果没有提供阈值，使用Otsu算法计算最佳阈值
  if (threshold === undefined) {
    threshold = calculateOtsuThreshold(imageData)
  }
  
  for (let i = 0; i < data.length; i += 4) {
    // 假设已经是灰度图像，所以R=G=B
    const gray = data[i]
    const binary = gray > threshold ? 255 : 0
    
    data[i] = binary       // Red
    data[i + 1] = binary   // Green
    data[i + 2] = binary   // Blue
    // Alpha保持不变
  }
  
  return new ImageData(data, imageData.width, imageData.height)
}

/**
 * Otsu算法计算最佳二值化阈值
 */
function calculateOtsuThreshold(imageData: ImageData): number {
  const data = imageData.data
  const histogram = new Array(256).fill(0)
  
  // 计算灰度直方图
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++
  }
  
  const total = imageData.width * imageData.height
  let sum = 0
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i]
  }
  
  let sumB = 0
  let wB = 0
  let wF = 0
  let varMax = 0
  let threshold = 0
  
  for (let t = 0; t < 256; t++) {
    wB += histogram[t] // 背景权重
    if (wB === 0) continue
    
    wF = total - wB // 前景权重
    if (wF === 0) break
    
    sumB += t * histogram[t]
    
    const mB = sumB / wB // 背景均值
    const mF = (sum - sumB) / wF // 前景均值
    
    // 计算类间方差
    const varBetween = wB * wF * (mB - mF) * (mB - mF)
    
    if (varBetween > varMax) {
      varMax = varBetween
      threshold = t
    }
  }
  
  return threshold
}

/**
 * 形态学去噪 (开运算: 先腐蚀后膨胀)
 */
export function denoise(imageData: ImageData): ImageData {
  // 先腐蚀
  const eroded = morphologyErode(imageData, 1)
  // 后膨胀
  return morphologyDilate(eroded, 1)
}

/**
 * 腐蚀运算
 */
function morphologyErode(imageData: ImageData, radius: number): ImageData {
  const { width, height, data } = imageData
  const output = new Uint8ClampedArray(data.length)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      
      let minVal = 255
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy
          const nx = x + dx
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const nIdx = (ny * width + nx) * 4
            minVal = Math.min(minVal, data[nIdx])
          }
        }
      }
      
      output[idx] = minVal
      output[idx + 1] = minVal
      output[idx + 2] = minVal
      output[idx + 3] = data[idx + 3]
    }
  }
  
  return new ImageData(output, width, height)
}

/**
 * 膨胀运算
 */
function morphologyDilate(imageData: ImageData, radius: number): ImageData {
  const { width, height, data } = imageData
  const output = new Uint8ClampedArray(data.length)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      
      let maxVal = 0
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy
          const nx = x + dx
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const nIdx = (ny * width + nx) * 4
            maxVal = Math.max(maxVal, data[nIdx])
          }
        }
      }
      
      output[idx] = maxVal
      output[idx + 1] = maxVal
      output[idx + 2] = maxVal
      output[idx + 3] = data[idx + 3]
    }
  }
  
  return new ImageData(output, width, height)
}

/**
 * 图像增强 (对比度增强)
 */
export function enhanceContrast(imageData: ImageData, factor: number = 1.5): ImageData {
  const data = new Uint8ClampedArray(imageData.data)
  
  for (let i = 0; i < data.length; i += 4) {
    // 对每个颜色通道应用对比度增强
    for (let j = 0; j < 3; j++) {
      let pixel = data[i + j]
      // 应用对比度公式: newPixel = factor * (pixel - 128) + 128
      pixel = factor * (pixel - 128) + 128
      // 确保像素值在0-255范围内
      data[i + j] = Math.max(0, Math.min(255, pixel))
    }
  }
  
  return new ImageData(data, imageData.width, imageData.height)
}

/**
 * 主要的图像预处理函数
 */
export function preprocessImage(
  canvas: HTMLCanvasElement, 
  options: ImageProcessingOptions
): HTMLCanvasElement {
  let imageData = canvasToImageData(canvas)
  
  // 灰度化
  if (options.grayscale) {
    imageData = toGrayscale(imageData)
  }
  
  // 增强对比度
  if (options.enhance) {
    imageData = enhanceContrast(imageData, 1.3)
  }
  
  // 去噪
  if (options.denoise) {
    imageData = denoise(imageData)
  }
  
  // 二值化 (通常放在最后)
  if (options.binary) {
    imageData = toBinary(imageData)
  }
  
  return imageDataToCanvas(imageData)
}

/**
 * 将Canvas转换为Base64
 */
export function canvasToBase64(canvas: HTMLCanvasElement, quality: number = 0.9): string {
  return canvas.toDataURL('image/png', quality)
} 