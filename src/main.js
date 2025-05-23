import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import './style.css'
import './assets/styles/lazyload.css'
import App from './App.vue'
import router from './router'
import './utils/leancloud'
import i18n from './i18n'
import { createHead } from '@vueuse/head'
import lazyLoad from './directives/lazyLoad'
import { startWorkStatusChecker } from './utils/workStatusChecker'
import { seoMiddleware } from './middleware/seo'
import { prerenderMiddleware, updatePrerenderMiddleware } from './middleware/prerender'
import { setupAudioContext } from './utils/audio'
import { startScheduler } from './server/workStatusScheduler'
import { prerenderService } from './services/prerenderService'

// 创建Vue应用实例
const vueApp = createApp(App)
const head = createHead()
const pinia = createPinia()

// 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  vueApp.component(key, component)
}

// 注册全局指令
vueApp.directive('lazy-load', lazyLoad)

// 使用插件
vueApp.use(pinia)
vueApp.use(router)
vueApp.use(ElementPlus)
vueApp.use(i18n)
vueApp.use(head)
vueApp.use(seoMiddleware)

// 设置路由实例
prerenderService.setRouter(router)

// 启动作品状态检查调度器
if (import.meta.env.PROD) {  // 只在生产环境启动
  startScheduler()
}

// 通过路由守卫实现预渲染功能
router.beforeEach(async (to, from, next) => {
  // 处理 SEO
  if (vueApp.config.globalProperties.$handleSEO) {
    await vueApp.config.globalProperties.$handleSEO(to)
  }
  
  try {
    const shouldContinue = await prerenderMiddleware(to, from)
    if (!shouldContinue) {
      return false
    }
  } catch (error) {
    console.error('Prerender error:', error)
  }
  
  next()
})

// 处理更新预渲染内容
router.afterEach(async (to) => {
  try {
    await updatePrerenderMiddleware(to)
  } catch (error) {
    console.error('Update prerender error:', error)
  }
})

// 初始化音频上下文
setupAudioContext()

// 等待路由就绪后挂载应用
router.isReady().then(() => {
  // 设置初始语言
  const savedLocale = localStorage.getItem('language')
  if (savedLocale && ['zh', 'en', 'ru'].includes(savedLocale)) {
    i18n.global.locale.value = savedLocale
  } else {
    const browserLocale = navigator.language.split('-')[0]
    i18n.global.locale.value = ['zh', 'en', 'ru'].includes(browserLocale) ? browserLocale : 'zh'
  }
  
  // 设置 HTML lang 属性
  document.querySelector('html').setAttribute('lang', i18n.global.locale.value)
  
  // 初始化预渲染服务
  prerenderService.initialize().catch(error => {
    console.error('Failed to initialize prerender service:', error)
  })
  
  // 挂载应用
  vueApp.mount('#app')
  document.dispatchEvent(new Event('render-event'))
})

// 启动作品状态检查器
const stopChecker = startWorkStatusChecker(30000)

// 在应用关闭时停止检查器
window.addEventListener('beforeunload', () => {
  stopChecker()
})
