import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

const app = createApp(App)

app.use(createPinia())

app.use(createVuetify())

app.mount('#app')
