// OCR字符识别类型定义

export interface CharacterBox {
  id: string;           // 唯一标识符 c001, c002...
  char: string;         // 识别的字符
  bbox: {
    x: number;          // 左上角x坐标
    y: number;          // 左上角y坐标
    w: number;          // 宽度
    h: number;          // 高度
  };
  center: {
    x: number;          // 中心点x坐标
    y: number;          // 中心点y坐标
  };
  confidence: number;   // 识别置信度
}

export interface OCRResult {
  imageId: string;
  timestamp: number;
  originalImage: string;    // base64编码的原始图像
  preprocessedImage: string; // base64编码的预处理图像
  fullText: string;         // 完整识别文本
  charBoxes: CharacterBox[]; // 字符级别识别结果
  metadata: {
    imageWidth: number;
    imageHeight: number;
    processingTime: number;
    detectedInternalScaleFactor?: number;
  };
}

export interface TesseractWord {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface TesseractCharacter {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface ImageProcessingOptions {
  grayscale: boolean;
  binary: boolean;
  denoise: boolean;
  enhance: boolean;
}

export interface OCRProcessingResult {
  success: boolean;
  result?: OCRResult;
  error?: string;
  processingTime: number;
}

// 错误分析相关类型定义

export interface HandwritingError {
  id: string;           // 对应的字符ID (c001, c002...)
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  center: {
    x: number;
    y: number;
  };
  errorType: 'math' | 'notation' | 'dimension' | 'property' | 'concept';
  suggestion: string;   // 建议的正确值
  explanation: string;  // 错误说明
  action: 'circle' | 'strikethrough' | 'underline' | 'highlight';
}

export interface ErrorAnalysisResult {
  originalContent: string;
  hasErrors: boolean;
  results: HandwritingError[];
  fills: any[]; // 保留原始结构
}

export interface ErrorAnalysisRequest {
  image: string;        // base64图像
  charBoxes: CharacterBox[];
  fullText: string;
}

export interface ErrorAnalysisResponse {
  success: boolean;
  result?: ErrorAnalysisResult;
  error?: string;
  processingTime: number;
} 