<template>
  <div class="glass-card">
    <div class="card-header">
      <div class="card-title">
        <span class="material-symbols-rounded">show_chart</span>
        กราฟระดับน้ำ — {{ activeStationName }}
      </div>
      <div class="chart-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="chart-tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>
    <div class="chart-wrapper">
      <canvas ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<script setup>
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const props = defineProps({
  stationId: { type: String, default: 'S002' },
  stationName: { type: String, default: 'P.1 สะพานนวรัฐ' },
})

const activeTab = ref('24h')
const chartCanvas = ref(null)
let chartInstance = null

const tabs = [
  { id: '12h', label: '12 ชม.' },
  { id: '24h', label: '24 ชม.' },
  { id: '72h', label: '72 ชม.' },
]

const activeStationName = computed(() => props.stationName)

const { data: tsData } = await useFetch(() => `/api/dashboard/timeseries/${props.stationId}`)

function getFilteredData(hours) {
  if (!tsData.value) return { waterLevel: [], rainfall: [], predictions: [] }
  const cutoff = Date.now() - hours * 3600000
  return {
    waterLevel: tsData.value.waterLevel.filter((d) => d.timestamp >= cutoff),
    rainfall: tsData.value.rainfall.filter((d) => d.timestamp >= cutoff),
    predictions: tsData.value.predictions,
  }
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function buildChart() {
  if (!chartCanvas.value || !tsData.value) return

  const hours = activeTab.value === '12h' ? 12 : activeTab.value === '24h' ? 24 : 72
  const filtered = getFilteredData(hours)

  const waterLabels = filtered.waterLevel.map((d) => formatTime(d.timestamp))
  const waterValues = filtered.waterLevel.map((d) => d.level)
  const rainfallValues = filtered.rainfall.map((d) => d.amount)

  // Add prediction data
  const predLabels = filtered.predictions.map((d) => formatTime(d.timestamp))
  const predValues = filtered.predictions.map((d) => d.predictedLevel)

  const allLabels = [...waterLabels, ...predLabels]
  const actualWithGap = [...waterValues, ...new Array(predLabels.length).fill(null)]
  const predWithGap = [...new Array(waterLabels.length - 1).fill(null), waterValues[waterValues.length - 1], ...predValues]
  const rainWithGap = [...rainfallValues, ...new Array(predLabels.length).fill(null)]

  if (chartInstance) chartInstance.destroy()

  const ctx = chartCanvas.value.getContext('2d')

  // Create gradient for actual water level
  const waterGradient = ctx.createLinearGradient(0, 0, 0, 280)
  waterGradient.addColorStop(0, 'rgba(14, 165, 233, 0.3)')
  waterGradient.addColorStop(1, 'rgba(14, 165, 233, 0.01)')

  const predGradient = ctx.createLinearGradient(0, 0, 0, 280)
  predGradient.addColorStop(0, 'rgba(245, 158, 11, 0.2)')
  predGradient.addColorStop(1, 'rgba(245, 158, 11, 0.01)')

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: 'ระดับน้ำจริง (m)',
          data: actualWithGap,
          borderColor: '#0ea5e9',
          backgroundColor: waterGradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#0ea5e9',
          spanGaps: false,
        },
        {
          label: 'AI พยากรณ์ (m)',
          data: predWithGap,
          borderColor: '#f59e0b',
          backgroundColor: predGradient,
          borderWidth: 2.5,
          borderDash: [6, 4],
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#f59e0b',
          spanGaps: false,
        },
        {
          label: 'ปริมาณฝน (mm)',
          data: rainWithGap,
          type: 'bar',
          backgroundColor: 'rgba(99, 102, 241, 0.35)',
          borderColor: 'rgba(99, 102, 241, 0.6)',
          borderWidth: 1,
          borderRadius: 2,
          yAxisID: 'y1',
          barPercentage: 0.8,
          order: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(56, 189, 248, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 10 },
            maxTicksLimit: 12,
            maxRotation: 0,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.06)',
            drawBorder: false,
          },
        },
        y: {
          position: 'left',
          title: {
            display: true,
            text: 'ระดับน้ำ (m)',
            color: '#64748b',
            font: { family: 'Inter', size: 11 },
          },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 10 },
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.06)',
            drawBorder: false,
          },
          suggestedMin: 0,
          suggestedMax: 5,
        },
        y1: {
          position: 'right',
          title: {
            display: true,
            text: 'ปริมาณฝน (mm)',
            color: '#64748b',
            font: { family: 'Inter', size: 11 },
          },
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 10 },
          },
          grid: { display: false },
          suggestedMin: 0,
          suggestedMax: 50,
        },
      },
    },
  })
}

watch(activeTab, () => {
  nextTick(buildChart)
})

watch(() => props.stationId, async () => {
  await refreshNuxtData()
  nextTick(buildChart)
})

onMounted(() => {
  nextTick(buildChart)
})

onUnmounted(() => {
  if (chartInstance) chartInstance.destroy()
})
</script>
