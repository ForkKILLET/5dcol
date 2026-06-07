export interface AssetLoadProgress {
  completed: number
  total: number
}

export type AssetLoadProgressCallback = (progress: AssetLoadProgress) => void

const ASSET_BASE_URL = (import.meta.env.VITE_ASSET_BASE_URL ?? '').replace(/\/+$/, '')

export function getAssetUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, '')
  return ASSET_BASE_URL
    ? `${ASSET_BASE_URL}/${normalizedPath}`
    : `./${normalizedPath}`
}
