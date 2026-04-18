import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fr from './locales/fr.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: localStorage.getItem('noorgrid_lang') || 'fr',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

i18n.on('languageChanged', (lang) => {
  localStorage.setItem('noorgrid_lang', lang)
  document.documentElement.lang = lang
})

document.documentElement.lang = i18n.language || 'fr'

export default i18n
