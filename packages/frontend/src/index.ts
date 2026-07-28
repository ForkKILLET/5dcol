import { createApp } from 'vue'
import App from './App.vue'
import {
  initializeRecovery,
  reportFatalRecoveryError,
} from './composables/recovery'
import { i18n } from './i18n'
import './index.css'

initializeRecovery()

const app = createApp(App)
app.config.errorHandler = (error, _instance, info) => {
  console.error(error)
  reportFatalRecoveryError(error, {
    context: info,
    source: 'vue',
  })
}

app.use(i18n).mount('#root')
