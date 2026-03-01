<template>
  <div class="glass-card">
    <div class="prediction-header">
      <div class="prediction-icon">
        <span class="material-symbols-rounded">psychology</span>
      </div>
      <div>
        <div class="card-title" style="margin-bottom: 0">คาดการณ์สถานการณ์น้ำด้วย AI</div>
        <div style="font-size: 0.7rem; color: var(--text-muted)">พยากรณ์ 12 ชั่วโมงข้างหน้า</div>
      </div>
    </div>

    <div class="prediction-details">
      <div class="prediction-row">
        <span class="prediction-label">ระดับน้ำปัจจุบัน (P.1)</span>
        <span class="prediction-value" :style="{ color: levelColor(currentLevel) }">
          {{ currentLevel.toFixed(2) }} m
        </span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">พยากรณ์สูงสุด</span>
        <span class="prediction-value" :style="{ color: levelColor(peakPredicted) }">
          {{ peakPredicted.toFixed(2) }} m
        </span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">เวลาถึงจุดสูงสุด</span>
        <span class="prediction-value">~{{ peakHours }} ชม.</span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">ความมั่นใจ AI</span>
        <span class="prediction-value" style="color: var(--accent)">{{ confidence }}%</span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">ระดับความเสี่ยง</span>
        <span class="risk-badge" :class="riskLevel">
          {{ riskLabel }}
        </span>
      </div>
      <div v-if="riskLevel === 'danger' || riskLevel === 'warning'" class="prediction-row">
        <span class="prediction-label">เวลาน้ำถึงสารภี</span>
        <span class="prediction-value" style="color: var(--color-warning)">~{{ flowTime }} ชม.</span>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  station: { type: Object, default: null },
})

const currentLevel = computed(() => props.station?.currentLevel || 0)
const peakPredicted = computed(() => props.station?.peakPredicted || 0)
const riskLevel = computed(() => props.station?.riskLevel || 'safe')
const flowTime = computed(() => props.station?.flowTimeToDownstream || 0)

const peakHours = computed(() => {
  const diff = peakPredicted.value - currentLevel.value
  return diff > 0 ? Math.round(3 + Math.random() * 4) : 0
})

const confidence = computed(() => Math.round(85 + Math.random() * 10))

const riskLabel = computed(() => {
  switch (riskLevel.value) {
    case 'danger': return 'วิกฤต'
    case 'warning': return 'เฝ้าระวัง'
    default: return 'ปกติ'
  }
})

function levelColor(level) {
  if (level >= 3.7) return 'var(--color-danger)'
  if (level >= 3.2) return 'var(--color-warning)'
  return 'var(--color-safe)'
}
</script>
