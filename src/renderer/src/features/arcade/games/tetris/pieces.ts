// 七种方块的基准形状与旋转态（矩阵旋转派生，避免手写 28 组坐标出错）。

export type TetrominoKind = "I" | "O" | "T" | "S" | "Z" | "J" | "L"

export const TETROMINO_KINDS: TetrominoKind[] = ["I", "O", "T", "S", "Z", "J", "L"]

// 0 = 空，1 = 实心；行 × 列。
export type TetrominoMatrix = number[][]

const BASE_MATRICES: Record<TetrominoKind, TetrominoMatrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
}

/**
 * 顺时针旋转矩阵（转置后逐行反转）。
 */
export const rotateClockwise = (matrix: TetrominoMatrix): TetrominoMatrix =>
  matrix[0].map((_, column) => matrix.map((row) => row[column]).reverse())

const buildRotations = (base: TetrominoMatrix): TetrominoMatrix[] => {
  const rotations: TetrominoMatrix[] = [base]
  for (let index = 1; index < 4; index += 1) {
    rotations.push(rotateClockwise(rotations[index - 1]))
  }
  return rotations
}

// 每个方块的 4 个旋转态。
export const TETROMINO_ROTATIONS: Record<TetrominoKind, TetrominoMatrix[]> = TETROMINO_KINDS.reduce(
  (result, kind) => {
    result[kind] = buildRotations(BASE_MATRICES[kind])
    return result
  },
  {} as Record<TetrominoKind, TetrominoMatrix[]>,
)

/**
 * 取某方块在某旋转态下的实心格相对坐标（列, 行）。
 */
export const getTetrominoOffsets = (
  kind: TetrominoKind,
  rotation: number,
): Array<[number, number]> => {
  const matrix = TETROMINO_ROTATIONS[kind][((rotation % 4) + 4) % 4]
  const offsets: Array<[number, number]> = []
  matrix.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell === 1) offsets.push([columnIndex, rowIndex])
    })
  })
  return offsets
}
