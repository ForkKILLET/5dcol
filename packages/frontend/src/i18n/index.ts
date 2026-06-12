import { createI18n } from 'vue-i18n'
import en from '@/locales/en.yml'
import zh from '@/locales/zh.yml'

export const LANGUAGES = ['en', 'zh'] as const

export type Language = typeof LANGUAGES[number]
export type TranslationKey = string
export type TranslationParams = Record<string, string | number>

type Dictionary = Record<string, string>

export const dictionaries = {
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

export const i18n = createI18n({
  legacy: false,
  globalInjection: false,
  locale: getDefaultLanguage(),
  fallbackLocale: 'en',
  flatJson: true,
  messages: dictionaries,
})
