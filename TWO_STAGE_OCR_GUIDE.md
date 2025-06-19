# 两阶段OCR机制说明文档

## 概述
为了解决第一次OCR识别时图片元素未正确加载的问题，我们实现了两阶段OCR机制。

## 问题背景
- **原问题**：第一次OCR识别时，图片DOM元素还未完全加载，导致坐标映射不准确
- **表现**：第一次识别的红色圈位置偏移，第二次识别才正确
- **根本原因**：图片元素加载是异步的，OCR处理开始时元素可能还未就绪

## 解决方案：两阶段机制

### 第一阶段：初始化环境
**功能**：
- 截取选中区域的图像
- 创建并正确设置图片DOM元素
- 等待图片完全加载
- 保存初始化数据到状态中

**用户体验**：
- 按钮显示："Initialize OCR Environment"（绿色）
- 进度显示：Initializing OCR environment... → Setting up image elements...
- 完成后显示通知："OCR环境已初始化，请再次点击进行识别"

### 第二阶段：执行OCR识别
**功能**：
- 使用第一阶段准备好的图片数据
- 执行真正的OCR识别和错误分析
- 坐标映射使用已就绪的图片元素

**用户体验**：
- 按钮显示："Start OCR Recognition"（蓝色）
- 执行完整的OCR识别流程
- 显示红色错误标记和智能建议

## 界面变化

### 按钮状态
1. **未初始化**：绿色按钮 "Initialize OCR Environment"
2. **已初始化**：蓝色按钮 "Start OCR Recognition"
3. **处理中**：灰色按钮显示进度
4. **就绪状态**：显示黄色 "✅ Ready - Reset" 按钮用于重置

### 状态指示器
- **✅ Ready - Reset**：点击可重置到未初始化状态
- 清楚地指示当前是否已准备好进行真正的OCR识别

## 使用流程

### 正常使用
1. 选择手写内容区域
2. **第一次点击**："Initialize OCR Environment" - 准备环境
3. 等待初始化完成（几秒钟）
4. **第二次点击**："Start OCR Recognition" - 开始识别
5. 查看识别结果和错误标记

### 重置状态
- 点击 "✅ Ready - Reset" 按钮可重置到初始状态
- 重新选择区域后需要重新初始化

## 技术实现

### 新增状态
```typescript
interface OCRState {
  // ... 现有状态
  isInitialized: boolean                    // 是否已初始化
  initializationData: {                     // 初始化数据
    selectionBounds: BoundingBox | null
    shapeIds: string[]
    imageCanvas: HTMLCanvasElement | null
  } | null
}
```

### 关键函数
- `initializeOCR()`: 第一阶段初始化函数
- `processSelectedShapes()`: 修改为两阶段判断逻辑

### 坐标一致性
- 第一阶段确保图片元素正确创建和加载
- 第二阶段使用相同的图片数据，保证坐标映射一致性

## 优势

1. **消除坐标偏移**：第二次识别时图片元素已完全就绪
2. **用户体验清晰**：明确的两阶段提示
3. **可靠性提升**：不依赖异步加载的timing
4. **向后兼容**：现有API保持不变

## 注意事项

- 必须按顺序执行两个阶段
- 中途不要改变选中区域
- 如需重新识别不同区域，点击Reset重置状态 