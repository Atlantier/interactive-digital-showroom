import { create } from 'zustand'
import { en, type TranslationDictionary } from './locales/en'
import { zh } from './locales/zh'

export type Locale = 'en' | 'zh'

const LOCALE_STORAGE_KEY = 'showroom_locale_v1'
const dictionaries: Record<Locale, TranslationDictionary> = {
  en,
  zh,
}

function isLocale(value: string | null): value is Locale {
  return value === 'en' || value === 'zh'
}

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'

  try {
    const storedLocale = window.localStorage.getItem(
      LOCALE_STORAGE_KEY,
    )
    return isLocale(storedLocale) ? storedLocale : 'en'
  } catch {
    return 'en'
  }
}

function syncDocument(locale: Locale) {
  if (typeof document === 'undefined') return

  const dictionary = dictionaries[locale]
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  document.documentElement.dataset.locale = locale
  document.title = dictionary.meta.title
  document
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute('content', dictionary.meta.description)
}

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
}

export const useI18nStore = create<I18nState>((set, get) => ({
  locale: readInitialLocale(),
  setLocale: (locale) => {
    if (get().locale === locale) return

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Locale still updates when storage is unavailable.
    }
    syncDocument(locale)
    set({ locale })
  },
  toggleLocale: () => {
    get().setLocale(get().locale === 'en' ? 'zh' : 'en')
  },
}))

syncDocument(useI18nStore.getState().locale)

export function useI18n() {
  const locale = useI18nStore((state) => state.locale)
  const setLocale = useI18nStore((state) => state.setLocale)
  const toggleLocale = useI18nStore((state) => state.toggleLocale)

  return {
    locale,
    setLocale,
    toggleLocale,
    t: dictionaries[locale],
  }
}

export type { TranslationDictionary }
export { formatTranslation } from './locales/en'
