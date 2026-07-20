import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { loadAllData } from './lib/store'

// Load all required index files on app startup
loadAllData()

const app = createApp(App)
app.use(router)
app.mount('#app')
