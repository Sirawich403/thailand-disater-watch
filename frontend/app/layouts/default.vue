<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-inner">
        <div class="logo-area">
          <div class="logo-icon">🛡️</div>
          <div>
            <div class="logo-text">Thailand Disaster Watch</div>
            <div class="logo-subtitle">ระบบเฝ้าระวังภัยพิบัติทั่วประเทศ — Real-Time Data</div>
          </div>
        </div>
        <div class="header-status">
          <button 
            class="theme-toggle" 
            @click="toggleTheme" 
            :title="isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'"
          >
            <span class="material-symbols-rounded">{{ isDarkMode ? 'light_mode' : 'dark_mode' }}</span>
          </button>
          <div class="live-badge">
            <span class="live-dot"></span>
            LIVE
          </div>
          <div class="header-time">{{ currentTime }}</div>
        </div>
      </div>
    </header>
    <main class="main-content">
      <slot />
    </main>
    <ChatbotWidget />
  </div>
</template>

<script setup>
const currentTime = ref('')
let timer = null
const isDarkMode = ref(false)

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value
  document.documentElement.setAttribute('data-theme', isDarkMode.value ? 'dark' : 'light')
  localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light')
}

function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark') {
    isDarkMode.value = true
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    isDarkMode.value = false
    document.documentElement.setAttribute('data-theme', 'light')
  }
  updateTime()
  timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>
