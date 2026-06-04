import en from '@/locales/en.yml'
import zh from '@/locales/zh.yml'

export const LANGUAGES = ['en', 'zh'] as const

export type Language = typeof LANGUAGES[number]
export type TranslationKey = string
export type TranslationParams = Record<string, string | number>

type Dictionary = Record<string, string>

const LANGUAGE_STORAGE_KEY = '5dcol.language'

const dictionaries = {
  en,
  zh,
} satisfies Record<Language, Dictionary>

export const isLanguage = (value: string): value is Language => (
  LANGUAGES.includes(value as Language)
)

export const getStoredLanguage = (): Language => {
  const stored = getStorage()?.getItem(LANGUAGE_STORAGE_KEY)
  if (stored && isLanguage(stored)) return stored

  const browserLanguage = globalThis.navigator?.language?.toLowerCase()
  if (browserLanguage?.startsWith('zh')) return 'zh'
  return 'en'
}

export const storeLanguage = (language: Language) => {
  getStorage()?.setItem(LANGUAGE_STORAGE_KEY, language)
}

export const createTranslator = (language: Language) => (
  key: TranslationKey,
  params: TranslationParams = {},
): string => {
  const template = dictionaries[language][key] ?? dictionaries.en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_: string, name: string) => String(params[name] ?? `{${name}}`))
}

const getStorage = (): Storage | null => {
  try {
    return globalThis.localStorage
  }
  catch {
    return null
  }
}
