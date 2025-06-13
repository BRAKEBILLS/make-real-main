// 智能位置算法：空间分析引擎
// 用于智能放置建议卡片，避开手写内容密集区域

import { Editor, TLShape } from 'tldraw';
import { HandwritingError } from '../types/ocr';

export interface PositionCandidate {
  x: number;
  y: number;
  score: number;
  direction: string;
  avoided_shapes: number;
  distance_to_error: number;
}

export interface SpatialGrid {
  width: number;
  height: number;
  cellSize: number;
  density: number[][];
  occupied: boolean[][];
}

export interface SuggestionPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  leadLineStart: { x: number; y: number };
  leadLineEnd: { x: number; y: number };
  animationDelay: number;
}

// 创建空间密度网格（32x32）
export function createSpatialGrid(
  editor: Editor, 
  viewportBounds: { x: number; y: number; w: number; h: number }
): SpatialGrid {
  const GRID_SIZE = 32;
  const cellWidth = viewportBounds.w / GRID_SIZE;
  const cellHeight = viewportBounds.h / GRID_SIZE;
  
  const density: number[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
  const occupied: boolean[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));
  
  // 分析所有形状的空间占用
  const shapes = editor.getCurrentPageShapes();
  shapes.forEach(shape => {
    const bounds = editor.getShapeGeometry(shape).bounds;
    const shapeX = bounds.x;
    const shapeY = bounds.y;
    const shapeW = bounds.w;
    const shapeH = bounds.h;
    
    // 计算形状影响的网格区域
    const startCol = Math.max(0, Math.floor((shapeX - viewportBounds.x) / cellWidth));
    const endCol = Math.min(GRID_SIZE - 1, Math.floor((shapeX + shapeW - viewportBounds.x) / cellWidth));
    const startRow = Math.max(0, Math.floor((shapeY - viewportBounds.y) / cellHeight));
    const endRow = Math.min(GRID_SIZE - 1, Math.floor((shapeY + shapeH - viewportBounds.y) / cellHeight));
    
    // 更新密度权重
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        // 基于形状类型计算密度权重
        let weight = 1.0;
        if (shape.type === 'draw') weight = 0.8; // 手绘线条
        else if (shape.type === 'text') weight = 0.9; // 文本
        else if (shape.type === 'geo') weight = 0.6; // 几何形状
        
        density[row][col] += weight;
        occupied[row][col] = true;
      }
    }
  });
  
  return {
    width: GRID_SIZE,
    height: GRID_SIZE,
    cellSize: Math.min(cellWidth, cellHeight),
    density,
    occupied
  };
}

// 8方向候选位置生成
export function generatePositionCandidates(
  errorPosition: { x: number; y: number },
  cardSize: { width: number; height: number },
  viewportBounds: { x: number; y: number; w: number; h: number },
  grid: SpatialGrid
): PositionCandidate[] {
  const candidates: PositionCandidate[] = [];
  const DISTANCE_OPTIONS = [80, 120, 160, 200]; // 4种距离选项
  
  // 8个方向：北、东北、东、东南、南、西南、西、西北
  const directions = [
    { name: 'N', dx: 0, dy: -1 },
    { name: 'NE', dx: 1, dy: -1 },
    { name: 'E', dx: 1, dy: 0 },
    { name: 'SE', dx: 1, dy: 1 },
    { name: 'S', dx: 0, dy: 1 },
    { name: 'SW', dx: -1, dy: 1 },
    { name: 'W', dx: -1, dy: 0 },
    { name: 'NW', dx: -1, dy: -1 }
  ];
  
  directions.forEach(dir => {
    DISTANCE_OPTIONS.forEach(distance => {
      const candidateX = errorPosition.x + (dir.dx * distance);
      const candidateY = errorPosition.y + (dir.dy * distance);
      
      // 检查是否在视窗范围内
      if (
        candidateX >= viewportBounds.x && 
        candidateX + cardSize.width <= viewportBounds.x + viewportBounds.w &&
        candidateY >= viewportBounds.y && 
        candidateY + cardSize.height <= viewportBounds.y + viewportBounds.h
      ) {
        const score = calculatePositionScore(
          { x: candidateX, y: candidateY },
          cardSize,
          errorPosition,
          viewportBounds,
          grid
        );
        
        candidates.push({
          x: candidateX,
          y: candidateY,
          score,
          direction: dir.name,
          avoided_shapes: 0, // 将在calculatePositionScore中更新
          distance_to_error: distance
        });
      }
    });
  });
  
  // 按评分排序
  return candidates.sort((a, b) => b.score - a.score);
}

// 位置评分算法
export function calculatePositionScore(
  position: { x: number; y: number },
  cardSize: { width: number; height: number },
  errorPosition: { x: number; y: number },
  viewportBounds: { x: number; y: number; w: number; h: number },
  grid: SpatialGrid
): number {
  let score = 100; // 基础分数
  
  // 1. 空间密度惩罚（权重40%）
  const densityPenalty = calculateDensityPenalty(position, cardSize, viewportBounds, grid);
  score -= densityPenalty * 40;
  
  // 2. 边界距离加分（权重20%）
  const boundaryBonus = calculateBoundaryBonus(position, cardSize, viewportBounds);
  score += boundaryBonus * 20;
  
  // 3. 错误距离适中加分（权重25%）
  const distanceBonus = calculateDistanceBonus(position, errorPosition);
  score += distanceBonus * 25;
  
  // 4. 方向偏好加分（权重15%）
  const directionBonus = calculateDirectionBonus(position, errorPosition);
  score += directionBonus * 15;
  
  return Math.max(0, score);
}

// 计算密度惩罚
function calculateDensityPenalty(
  position: { x: number; y: number },
  cardSize: { width: number; height: number },
  viewportBounds: { x: number; y: number; w: number; h: number },
  grid: SpatialGrid
): number {
  const cellWidth = viewportBounds.w / grid.width;
  const cellHeight = viewportBounds.h / grid.height;
  
  const startCol = Math.floor((position.x - viewportBounds.x) / cellWidth);
  const endCol = Math.floor((position.x + cardSize.width - viewportBounds.x) / cellWidth);
  const startRow = Math.floor((position.y - viewportBounds.y) / cellHeight);
  const endRow = Math.floor((position.y + cardSize.height - viewportBounds.y) / cellHeight);
  
  let totalDensity = 0;
  let cellCount = 0;
  
  for (let row = Math.max(0, startRow); row <= Math.min(grid.height - 1, endRow); row++) {
    for (let col = Math.max(0, startCol); col <= Math.min(grid.width - 1, endCol); col++) {
      totalDensity += grid.density[row][col];
      cellCount++;
    }
  }
  
  return cellCount > 0 ? (totalDensity / cellCount) * 25 : 0;
}

// 计算边界距离加分
function calculateBoundaryBonus(
  position: { x: number; y: number },
  cardSize: { width: number; height: number },
  viewportBounds: { x: number; y: number; w: number; h: number }
): number {
  const minDistanceToEdge = Math.min(
    position.x - viewportBounds.x, // 距离左边
    position.y - viewportBounds.y, // 距离上边
    viewportBounds.x + viewportBounds.w - (position.x + cardSize.width), // 距离右边
    viewportBounds.y + viewportBounds.h - (position.y + cardSize.height) // 距离下边
  );
  
  // 距离边界适中时加分（40-80px最优）
  if (minDistanceToEdge >= 40 && minDistanceToEdge <= 80) {
    return 1.0;
  } else if (minDistanceToEdge >= 20 && minDistanceToEdge <= 120) {
    return 0.5;
  }
  return 0.0;
}

// 计算错误距离加分
function calculateDistanceBonus(
  position: { x: number; y: number },
  errorPosition: { x: number; y: number }
): number {
  const distance = Math.sqrt(
    Math.pow(position.x - errorPosition.x, 2) + 
    Math.pow(position.y - errorPosition.y, 2)
  );
  
  // 距离在100-150px时最优
  if (distance >= 100 && distance <= 150) {
    return 1.0;
  } else if (distance >= 80 && distance <= 200) {
    return 0.6;
  } else if (distance >= 60 && distance <= 250) {
    return 0.3;
  }
  return 0.0;
}

// 计算方向偏好加分
function calculateDirectionBonus(
  position: { x: number; y: number },
  errorPosition: { x: number; y: number }
): number {
  const dx = position.x - errorPosition.x;
  const dy = position.y - errorPosition.y;
  
  // 偏好右上方和右下方（数学作业习惯）
  if (dx > 0 && dy < 0) return 1.0; // 右上方
  if (dx > 0 && dy > 0) return 0.8; // 右下方
  if (dx > 0 && Math.abs(dy) < 20) return 0.6; // 正右方
  if (dx < 0 && dy < 0) return 0.4; // 左上方
  return 0.2; // 其他方向
}

// 多错误布局优化（避免重叠）
export function optimizeMultipleErrorLayout(
  errors: HandwritingError[],
  viewportBounds: { x: number; y: number; w: number; h: number },
  grid: SpatialGrid,
  cardSize: { width: number; height: number } = { width: 180, height: 120 }
): SuggestionPlacement[] {
  const placements: SuggestionPlacement[] = [];
  const usedPositions: { x: number; y: number; w: number; h: number }[] = [];
  
  errors.forEach((error, index) => {
    const errorCenter = {
      x: error.bbox.x + error.bbox.w / 2,
      y: error.bbox.y + error.bbox.h / 2
    };
    
    // 生成候选位置
    let candidates = generatePositionCandidates(errorCenter, cardSize, viewportBounds, grid);
    
    // 过滤已占用位置
    candidates = candidates.filter(candidate => {
      return !usedPositions.some(used => {
        return !(
          candidate.x >= used.x + used.w ||
          candidate.x + cardSize.width <= used.x ||
          candidate.y >= used.y + used.h ||
          candidate.y + cardSize.height <= used.y
        );
      });
    });
    
    if (candidates.length > 0) {
      const bestPosition = candidates[0];
      
      placements.push({
        x: bestPosition.x,
        y: bestPosition.y,
        width: cardSize.width,
        height: cardSize.height,
        leadLineStart: errorCenter,
        leadLineEnd: {
          x: bestPosition.x + cardSize.width / 2,
          y: bestPosition.y + cardSize.height / 2
        },
        animationDelay: index * 800 // 错误间隔800ms显示
      });
      
      // 记录已占用位置（添加缓冲区）
      usedPositions.push({
        x: bestPosition.x - 20,
        y: bestPosition.y - 20,
        w: cardSize.width + 40,
        h: cardSize.height + 40
      });
    } else {
      // 备用方案：强制放置在错误右侧
      const fallbackX = errorCenter.x + 100;
      const fallbackY = errorCenter.y - cardSize.height / 2;
      
      placements.push({
        x: fallbackX,
        y: fallbackY,
        width: cardSize.width,
        height: cardSize.height,
        leadLineStart: errorCenter,
        leadLineEnd: {
          x: fallbackX + cardSize.width / 2,
          y: fallbackY + cardSize.height / 2
        },
        animationDelay: index * 800
      });
    }
  });
  
  return placements;
}

// 调试工具：可视化网格密度
export function visualizeGrid(grid: SpatialGrid, viewportBounds: { x: number; y: number; w: number; h: number }) {
  console.log('🔍 空间密度网格可视化:');
  console.log(`网格尺寸: ${grid.width}x${grid.height}, 单元格大小: ${grid.cellSize.toFixed(1)}px`);
  
  // 找出高密度区域
  const highDensityAreas: Array<{row: number, col: number, density: number}> = [];
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      if (grid.density[row][col] > 0.5) {
        highDensityAreas.push({ row, col, density: grid.density[row][col] });
      }
    }
  }
  
  highDensityAreas
    .sort((a, b) => b.density - a.density)
    .slice(0, 10)
    .forEach((area, index) => {
      console.log(`高密度区域${index + 1}: (${area.row}, ${area.col}) 密度=${area.density.toFixed(2)}`);
    });
} 