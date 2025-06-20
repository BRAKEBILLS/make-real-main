# OCR 数据存储目录

这个目录用于存储手写识别相关的数据文件。

## 目录结构

```
data/
├── ocr-results/         # OCR识别结果JSON文件
├── visualizations/      # 可视化分析图像（显示边界框和中心点）
├── canvas-screenshots/  # 完整画布截图及其元数据
├── coordinates/         # 手写区域坐标数据（c00x格式label）
└── gpt-analysis/        # GPT错误分析结果JSON文件
```

## 文件命名规范

### 文件类型

#### 可视化图像文件
- 可视化图像: `visualization_{imageId}_{timestamp}.png`
  - 显示红色边界框标识字符边界
  - 显示绿色中心点和十字标记
  - 显示红色字符ID标签

#### JSON结果文件  
- OCR结果: `ocr_result_{imageId}_{timestamp}.json`
  - 包含完整的字符坐标数据
  - 包含原始图像和预处理图像的base64数据
  - 包含识别文本和置信度信息

#### 画布截图文件
- 画布截图: `canvas_screenshot_{timestamp}.png`
  - 完整画布的高分辨率截图
  - 包含手写内容和灰色虚线矩形标记
- 截图元数据: `canvas_screenshot_{timestamp}_metadata.json`
  - 包含坐标信息和截图描述

#### 坐标数据文件
- 手写区域坐标: `coordinates_{timestamp}.json`
  - 包含c00x格式的label（c001, c002, c003...）
  - tldraw原生坐标数据（bbox和center）
  - GPT识别匹配所需的完整信息

#### GPT分析文件
- GPT分析结果: `canvas_analysis_{timestamp}.json`
  - 包含GPT错误识别结果
  - 引用对应的画布截图文件
  - 包含手写区域坐标和错误标记信息

## 数据格式

### OCR结果JSON格式
```json
{
  "imageId": "ocr_abc123",
  "timestamp": 1703123456789,
  "originalImage": "data:image/png;base64,...",
  "preprocessedImage": "data:image/png;base64,...",
  "fullText": "Hello World",
  "charBoxes": [
    {
      "id": "c001",
      "char": "H",
      "bbox": { "x": 100, "y": 50, "w": 20, "h": 30 },
      "center": { "x": 110, "y": 65 },
      "confidence": 0.95
    }
  ],
  "metadata": {
    "imageWidth": 800,
    "imageHeight": 600,
    "processingTime": 3500
  }
}
```

## 使用说明

1. **识别和保存流程**:
   - 在画布上手写内容
   - 点击"识别手写"按钮
   - 系统自动完成OCR识别
   - 自动保存2个文件到/data目录：
     - 可视化分析图像 (visualizations/)
     - OCR结果JSON (ocr-results/)

2. **可视化图像特点**:
   - 🔴 红色边界框：标识每个字符的精确位置
   - 🟢 绿色圆点+十字：标识字符中心点坐标  
   - 🆔 红色文字：显示字符ID (c001, c002...)

3. **字符级识别验证**:
   - 检查`data/visualizations/`目录中的可视化图像
   - 确认每个字符都有红色边界框和绿色中心点
   - 查看`data/ocr-results/`目录中的JSON文件验证坐标数据

## 注意事项

- 此目录中的文件仅用于开发和测试
- 生产环境应考虑使用云存储服务
- 注意保护用户隐私，不要提交包含敏感信息的文件到版本控制 