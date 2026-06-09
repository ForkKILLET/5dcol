import en from '@/locales/en.yml'
import zh from '@/locales/zh.yml'

export const LANGUAGES = ['en', 'zh'] as const

export type Language = typeof LANGUAGES[number]
export type TranslationKey = string
export type TranslationParams = Record<string, string | number>

type Dictionary = Record<string, string>

const dictionaries = {
  en,
  zh,
} satisfies Record<Language, Dictionary>

export const isLanguage = (value: string): value is Language => (
  LANGUAGES.includes(value as Language)
)

export const getDefaultLanguage = (): Language => {
  const browserLanguage = globalThis.navigator?.language?.toLowerCase()
  if (browserLanguage?.startsWith('zh')) return 'zh'
  return 'en'
}

export const createTranslator = (language: Language) => (
  key: TranslationKey,
  params: TranslationParams = {},
): string => {
  const template = dictionaries[language][key] ?? dictionaries.en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_: string, name: string) => String(params[name] ?? `{${name}}`))
}
