<template>
  <ClientOnly>
    <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-content glass-card">
          <div class="modal-header">
            <div class="modal-title">
              <span class="material-symbols-rounded">campaign</span>
              <h2>แจ้งเหตุภัยพิบัติ</h2>
            </div>
            <button class="icon-btn" @click="close">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>

          <form @submit.prevent="submitReport" class="report-form">
            <div class="form-group">
              <label>ประเภทภัยพิบัติ</label>
              <div class="type-selector">
                <button 
                  type="button" 
                  class="type-btn" 
                  :class="{ active: form.type === 'flood' }" 
                  @click="form.type = 'flood'"
                >
                  <span class="material-symbols-rounded">water_drop</span>
                  น้ำท่วม
                </button>
                <button 
                  type="button" 
                  class="type-btn" 
                  :class="{ active: form.type === 'fire', danger: form.type === 'fire' }" 
                  @click="form.type = 'fire'"
                >
                  <span class="material-symbols-rounded">local_fire_department</span>
                  ไฟป่า
                </button>
              </div>
            </div>

            <div class="form-group">
              <label>รายละเอียดเหตุการณ์</label>
              <textarea 
                v-model="form.description" 
                rows="4" 
                placeholder="ระบุความรุนแรง หรือสังเกตการณ์เบื้องต้น..."
                required
              ></textarea>
            </div>

            <div class="form-group location-group">
              <label>ตำแหน่งของคุณ</label>
              <div class="location-status">
                <span class="material-symbols-rounded" :class="{ 'text-success': locationFound, 'text-warning': !locationFound }">
                  {{ locationFound ? 'my_location' : 'location_searching' }}
                </span>
                <span>{{ locationFound ? 'ระบุตำแหน่งแล้ว' : 'กำลังค้นหาตำแหน่ง...' }}</span>
                <span v-if="locationFound" class="coords">({{ form.lat.toFixed(4) }}, {{ form.lng.toFixed(4) }})</span>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn-cancel" @click="close">ยกเลิก</button>
              <button type="submit" class="btn-submit" :disabled="isSubmitting || !locationFound">
                <span class="material-symbols-rounded" v-if="!isSubmitting">send</span>
                <span class="spinner" v-else></span>
                {{ isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งรายงาน' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
    </Teleport>
  </ClientOnly>
</template>

<script setup>
const props = defineProps({ isOpen: Boolean })
const emit = defineEmits(['close', 'submitted'])

const isSubmitting = ref(false)
const locationFound = ref(false)
const form = ref({
  type: 'flood',
  description: '',
  lat: 0,
  lng: 0,
})

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    // Reset form and get location
    form.value.description = ''
    form.value.type = 'flood'
    locationFound.value = false
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          form.value.lat = position.coords.latitude
          form.value.lng = position.coords.longitude
          locationFound.value = true
        },
        (error) => {
          console.error("Error getting location", error)
          // Fallback to Chiang Mai center if denied
          form.value.lat = 18.7953
          form.value.lng = 98.9620
          locationFound.value = true 
        }
      )
    }
  }
})

function close() {
  emit('close')
}

async function submitReport() {
  isSubmitting.value = true
  try {
    const { data, error } = await useFetch('/api/reports', {
      method: 'POST',
      body: form.value
    })
    
    if (error.value) throw error.value
    
    emit('submitted', data.value.report)
    close()
  } catch (err) {
    console.error('Submit report failed:', err)
    alert('เกิดข้อผิดพลาดในการส่งข้อมูล')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-content {
  width: 100%;
  max-width: 500px;
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-card);
}

[data-theme="light"] .modal-content {
  background: #ffffff;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.modal-title .material-symbols-rounded {
  color: var(--accent);
  font-size: 28px;
}

.report-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.type-selector {
  display: flex;
  gap: 12px;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  font-weight: 600;
}

[data-theme="light"] .type-btn {
  background: #f1f5f9;
}

.type-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

.type-btn.active.danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

textarea {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px;
  color: var(--text-primary);
  font-family: inherit;
  resize: vertical;
}

[data-theme="light"] textarea {
  background: #f8fafc;
}

textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.location-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
}

[data-theme="light"] .location-status {
  background: #f8fafc;
}

.text-success { color: var(--color-safe); }
.text-warning { color: var(--color-warning); }
.coords { color: var(--text-muted); font-size: 0.8rem; }

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}

.btn-cancel {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.btn-submit {
  padding: 10px 24px;
  background: var(--gradient-water);
  border: none;
  color: white;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: opacity 0.2s;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
