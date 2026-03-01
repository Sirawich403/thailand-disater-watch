<template>
  <div class="chatbot-container">
    <!-- Chat Window -->
    <Transition name="slide-up">
      <div v-if="isOpen" class="chat-window glass-card">
        <div class="chat-header">
          <div class="header-info">
            <span class="material-symbols-rounded">robot_2</span>
            <div>
              <h3 style="margin: 0; font-size: 1rem;">Disaster AI Assistant</h3>
              <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted)">ถามข่าวสารน้ำท่วม/ไฟป่าได้เลย</p>
            </div>
          </div>
          <button class="icon-btn" @click="isOpen = false">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="chat-messages" ref="messagesContainer">
          <div 
            v-for="(msg, index) in messages" 
            :key="index"
            class="message-wrapper"
            :class="msg.role"
          >
            <div class="message-bubble">
              {{ msg.content }}
            </div>
          </div>
          
          <div v-if="isLoading" class="message-wrapper assistant">
            <div class="message-bubble loading-bubble">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <form @submit.prevent="sendMessage" style="display: flex; gap: 8px; width: 100%;">
            <input 
              v-model="inputMsg" 
              type="text" 
              placeholder="พิมพ์คำถามที่นี่..." 
              :disabled="isLoading"
              class="chat-input"
            />
            <button type="submit" class="send-btn" :disabled="!inputMsg.trim() || isLoading">
              <span class="material-symbols-rounded">send</span>
            </button>
          </form>
        </div>
      </div>
    </Transition>

    <!-- Floating Action Button -->
    <button 
      class="chat-fab" 
      @click="isOpen = !isOpen"
      :class="{ 'is-open': isOpen }"
      aria-label="เปิดผู้ช่วย AI"
    >
      <span class="material-symbols-rounded" v-if="!isOpen">chat</span>
      <span class="material-symbols-rounded" v-else>keyboard_arrow_down</span>
    </button>
  </div>
</template>

<script setup>
const isOpen = ref(false)
const inputMsg = ref('')
const isLoading = ref(false)
const messagesContainer = ref(null)

const messages = ref([
  {
    role: 'assistant',
    content: 'สวัสดีครับ ผมคือ AI ผู้ช่วยเฝ้าระวังภัยพิบัติระดับประเทศ มีอะไรให้ผมช่วยสืบค้นข้อมูลน้ำท่วมหรือไฟป่าไหมครับ?'
  }
])

async function sendMessage() {
  if (!inputMsg.value.trim() || isLoading.value) return
  
  const userMsg = inputMsg.value
  messages.value.push({ role: 'user', content: userMsg })
  inputMsg.value = ''
  isLoading.value = true
  scrollToBottom()
  
  try {
    const { data, error } = await useFetch('/api/chat', {
      method: 'POST',
      body: { message: userMsg }
    })
    
    if (error.value) throw error.value
    
    messages.value.push({ 
      role: 'assistant', 
      content: data.value?.response || 'ขออภัยครับ เกิดข้อผิดพลาดในการประมวลผล'
    })
  } catch (err) {
    console.error(err)
    messages.value.push({ 
      role: 'assistant', 
      content: 'ระบบ AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ ⚠️'
    })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

function scrollToBottom() {
  setTimeout(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  }, 50)
}
</script>

<style scoped>
.chatbot-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.chat-fab {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--gradient-water);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.chat-fab:hover {
  transform: scale(1.05) translateY(-5px);
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.6);
}

.chat-fab .material-symbols-rounded {
  font-size: 28px;
}

.chat-window {
  width: 350px;
  height: 500px;
  max-height: calc(100vh - 120px);
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--border-glass);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  background: var(--bg-card);
  backdrop-filter: blur(16px);
}

.chat-header {
  padding: 16px;
  background: rgba(14, 165, 233, 0.1);
  border-bottom: 1px solid var(--border-glass);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-info .material-symbols-rounded {
  background: var(--gradient-water);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-size: 32px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-wrapper {
  display: flex;
  width: 100%;
}

.message-wrapper.user {
  justify-content: flex-end;
}

.message-wrapper.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 0.9rem;
  line-height: 1.4;
  white-space: pre-wrap;
}

.user .message-bubble {
  background: var(--accent);
  color: #030712;
  border-bottom-right-radius: 4px;
}

.assistant .message-bubble {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 4px;
}

[data-theme="light"] .assistant .message-bubble {
  background: #f1f5f9;
  border-color: #e2e8f0;
}

.chat-input-area {
  padding: 12px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(0, 0, 0, 0.2);
}

[data-theme="light"] .chat-input-area {
  background: #f8fafc;
}

.chat-input {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  border-radius: 20px;
  padding: 8px 16px;
  outline: none;
  transition: border-color 0.2s;
}

.chat-input:focus {
  border-color: var(--accent);
}

.send-btn {
  background: var(--accent);
  color: #030712;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}

.send-btn:active {
  transform: scale(0.95);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Typing animation */
.loading-bubble {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 38px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  background: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom right;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

@media (max-width: 480px) {
  .chat-window {
    width: calc(100vw - 32px);
    right: 16px;
    bottom: 80px;
    height: 60vh;
  }
}
</style>
