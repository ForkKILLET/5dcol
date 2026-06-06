export interface AssetLoadProgress {
  completed: number
  total: number
}

export type AssetLoadProgressCallback = (progress: AssetLoadProgress) => void
