<template>
  <div>
    <!-- Loading Overlay -->
    <div v-if="isPending" class="loading-overlay">
      <div class="spinner"></div>
      <div>กำลังโหลดข้อมูล...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="isError" class="error-overlay">
      <span class="material-symbols-rounded">error</span>
      <div>ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้</div>
      <button class="retry-btn" @click="retryFetch">ลองใหม่อีกครั้ง</button>
    </div>

    <div v-else>
      <!-- Alert Banner -->
      <AlertBanner :risk-level="overallRisk" :stations="dashboardStations" :fires="firesList" @view-map="handleViewMap" />

    <!-- Summary Stats -->
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-icon water">
          <span class="material-symbols-rounded">water_drop</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">สถานีวิกฤตสูงสุด</div>
          <div class="stat-value">{{ p1Level.toFixed(2) }} m</div>
          <div class="stat-change" :class="p1Trend > 0 ? 'up' : 'down'">
            {{ p1Trend > 0 ? '▲' : '▼' }} {{ Math.abs(p1Trend).toFixed(2) }}m/ชม.
          </div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon rain">
          <span class="material-symbols-rounded">rainy</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">ฝนสะสม 24 ชม.</div>
          <div class="stat-value">{{ totalRain.toFixed(1) }} mm</div>
          <div class="stat-change" style="color: var(--text-muted)">ทุกสถานีรวม</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon risk">
          <span class="material-symbols-rounded">shield</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">ระดับความเสี่ยง</div>
          <div class="stat-value" :style="{ color: riskColor }">{{ riskLabelTh }}</div>
          <div class="stat-change" style="color: var(--text-muted)">จาก ThaiWater API (Real-time)</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon fire">
          <span class="material-symbols-rounded">local_fire_department</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">จุดไฟไทย (FIRMS)</div>
          <div class="stat-value" :style="{ color: fireCountColor }">{{ activeFireCount }} จุด</div>
          <div class="stat-change" style="color: var(--text-muted)">โลก {{ worldFireCount }} • NRT ~3 ชม.</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6">
          <span class="material-symbols-rounded">rainy</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">ฝนตก (Real-time)</div>
          <div class="stat-value" style="color: #3b82f6">{{ rainStationCount }} สถานี</div>
          <div class="stat-change" style="color: var(--text-muted)">ThaiWater API</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon" :style="{ background: aqiIconBg, color: aqiIconColor }">
          <span class="material-symbols-rounded">air</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">PM2.5 / AQI</div>
          <div class="stat-value" :style="{ color: aqiIconColor }">{{ worstAqi }}</div>
          <div class="stat-change" style="color: var(--text-muted)">{{ worstAqiCity }}</div>
        </div>
      </div>
      <div class="stat-item">
        <div class="stat-icon time">
          <span class="material-symbols-rounded">schedule</span>
        </div>
        <div class="stat-info">
          <div class="stat-label">อัปเดตล่าสุด</div>
          <div class="stat-value" style="font-size: 1rem">{{ lastUpdate }}</div>
          <div class="stat-change" style="color: var(--text-muted)">อัปเดตทุก 5 นาที</div>
        </div>
      </div>
    </div>

    <!-- Dashboard Grid -->
    <div class="dashboard-grid">
      <!-- Map -->
      <div class="map-section">
        <FloodMap
          ref="floodMapRef"
          :stations="dashboardStations"
          :fires="firesList"
          :world-fires="worldFiresList"
          :reports="communityReports"
          :rain-stations="rainStationsList"
          :spread-predictions="fireSpreadPredictions"
          :aqi-stations="aqiStationsList"
          :selected-fire-id="selectedFireId"
          :focus-fire="focusFire"
          :focus-station="focusStation"
          @select-station="selectStation"
          @select-fire="selectFire"
          @add-report="showReportForm = true"
        />
      </div>

      <!-- Right Column: Stations + AI Prediction -->
      <div class="right-column">
        <div class="glass-card">
          <div class="card-header">
            <div class="card-title">
              <span class="material-symbols-rounded">sensors</span>
              สถานีตรวจวัด
            </div>
            <span class="station-count-badge">{{ dashboardStations.length }} แห่ง</span>
          </div>
          <div class="stations-list" :class="{ expanded: showAllStations }">
            <StationCard
              v-for="station in visibleStations"
              :key="station.id"
              :station="station"
              :is-active="selectedStationId === station.id"
              @select="selectStation"
            />
          </div>
          <button
            v-if="dashboardStations.length > 5"
            class="show-more-btn"
            @click="showAllStations = !showAllStations"
          >
            <span class="material-symbols-rounded">{{ showAllStations ? 'expand_less' : 'expand_more' }}</span>
            {{ showAllStations ? 'แสดงน้อยลง' : `ดูเพิ่มเติม (${dashboardStations.length - 5} สถานี)` }}
          </button>
        </div>

        <PredictionPanel :station="selectedStation" />
      </div>

      <!-- Fire Spread Prediction -->
      <div class="fire-section">
        <FireSpreadPanel
          :fires="firesList"
          :selected-fire-id="selectedFireId"
          @select-fire="handleFireSelect"
        />
      </div>

      <!-- Chart -->
      <div class="chart-section">
        <WaterLevelChart
          :station-id="selectedStationId"
          :station-name="selectedStation?.name || 'สถานี'"
        />
      </div>
    </div> <!-- End dashboard-grid -->
    </div> <!-- End v-else -->

    <!-- Modals -->
    <ReportForm
      :is-open="showReportForm"
      @close="showReportForm = false"
      @submitted="handleReportSubmitted"
    />
  </div>
</template>

<script setup>
// Fetch dashboard data
const { data: dashboard, pending: pendingDashboard, error: errorDashboard, refresh: refreshDashboard } = await useFetch('/api/dashboard/summary', {
  server: false,
})

// Fetch fire data
const { data: fireDashboard, pending: pendingFire, error: errorFire, refresh: refreshFire } = await useFetch('/api/dashboard/fires', {
  server: false,
})

// Fetch community reports
const { data: reportsData, pending: pendingReports, error: errorReports, refresh: refreshReports } = await useFetch('/api/reports', {
  server: false,
})

// Fetch rainfall data
const { data: rainData, pending: pendingRain, refresh: refreshRain } = await useFetch('/api/dashboard/rain', {
  server: false,
})

// Fetch AQI data
const { data: aqiData, refresh: refreshAqi } = await useFetch('/api/dashboard/aqi', {
  server: false,
})

// Combined loading and error states
const isPending = computed(() => pendingDashboard.value || pendingFire.value || pendingReports.value || pendingRain.value)
const isError = computed(() => errorDashboard.value || errorFire.value || errorReports.value)

function retryFetch() {
  refreshDashboard()
  refreshFire()
  refreshReports()
  refreshRain()
  refreshAqi()
}

const selectedStationId = ref('S001')
const selectedFireId = ref('')
const showAllStations = ref(false)
const focusFire = ref(null)
const focusStation = ref(null)
const floodMapRef = ref(null)
const showReportForm = ref(false)

function handleViewMap(locationData) {
  if (locationData && locationData.lat && locationData.lng) {
    focusStation.value = { 
      lat: locationData.lat, 
      lng: locationData.lng, 
      id: locationData.id || `loc-${Date.now()}`,
      ts: Date.now() 
    }
    
    // Auto-select the station or fire to show its details
    if (locationData.intensity) {
      selectedFireId.value = locationData.id
    } else if (locationData.id) {
      selectedStationId.value = locationData.id
    }
  }
}

const communityReports = computed(() => reportsData.value?.reports || [])

function handleReportSubmitted() {
  refreshReports()
}

const dashboardStations = computed(() => dashboard.value?.stations || [])
const overallRisk = computed(() => dashboard.value?.overallRisk || 'safe')
const selectedStation = computed(() => dashboardStations.value.find((s) => s.id === selectedStationId.value))

const firesList = computed(() => fireDashboard.value?.fires || [])
const worldFiresList = computed(() => fireDashboard.value?.worldFires || [])
const activeFireCount = computed(() => fireDashboard.value?.activeCount || 0)
const worldFireCount = computed(() => fireDashboard.value?.worldCount || 0)
const overallFireRisk = computed(() => fireDashboard.value?.overallFireRisk || 'low')

const rainStationsList = computed(() => rainData.value?.rainStations || [])
const rainStationCount = computed(() => rainData.value?.totalStations || 0)

const fireSpreadPredictions = computed(() => fireDashboard.value?.spreadPredictions || [])

const aqiStationsList = computed(() => aqiData.value?.stations || [])
const worstAqiStation = computed(() => {
  const stations = aqiStationsList.value
  if (!stations.length) return null
  return stations.reduce((worst, s) => (s.aqi > worst.aqi ? s : worst), stations[0])
})
const worstAqi = computed(() => worstAqiStation.value?.aqi || '-')
const worstAqiCity = computed(() => worstAqiStation.value?.name || 'AQICN')
const aqiIconColor = computed(() => worstAqiStation.value?.color || '#22c55e')
const aqiIconBg = computed(() => {
  const c = aqiIconColor.value
  return c + '22'
})

// Show only first 5 stations unless expanded
const visibleStations = computed(() => {
  if (showAllStations.value) return dashboardStations.value
  return dashboardStations.value.slice(0, 5)
})

const p1Level = computed(() => {
  const first = dashboardStations.value[0]
  return first?.currentLevel || 0
})

const p1Trend = computed(() => {
  const first = dashboardStations.value[0]
  return first?.trend || 0
})

const totalRain = computed(() => {
  return dashboardStations.value.reduce((sum, s) => sum + (s.rainfall?.accumulated24h || 0), 0)
})

const riskColor = computed(() => {
  switch (overallRisk.value) {
    case 'danger': return 'var(--color-danger)'
    case 'warning': return 'var(--color-warning)'
    default: return 'var(--color-safe)'
  }
})

const riskLabelTh = computed(() => {
  switch (overallRisk.value) {
    case 'danger': return 'วิกฤต'
    case 'warning': return 'เฝ้าระวัง'
    default: return 'ปกติ'
  }
})

const fireCountColor = computed(() => {
  if (activeFireCount.value === 0) return 'var(--color-safe)'
  return activeFireCount.value >= 3 ? '#dc2626' : '#f97316'
})

const fireRiskColor = computed(() => {
  switch (overallFireRisk.value) {
    case 'extreme': return '#dc2626'
    case 'high': return '#f97316'
    case 'medium': return '#f59e0b'
    default: return 'var(--color-safe)'
  }
})

const fireRiskLabel = computed(() => {
  switch (overallFireRisk.value) {
    case 'extreme': return '🔥 รุนแรงมาก'
    case 'high': return '🔥 รุนแรง'
    case 'medium': return '⚠️ ปานกลาง'
    default: return '✅ ปกติ'
  }
})

const lastUpdate = computed(() => {
  if (!dashboard.value?.timestamp) return '--:--'
  return new Date(dashboard.value.timestamp).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
})

function selectStation(id) {
  selectedStationId.value = id
}

function selectFire(id) {
  selectedFireId.value = id
}

function handleFireSelect(id) {
  selectedFireId.value = id
  // Find fire and pan map to it
  const fire = firesList.value.find((f) => f.id === id)
  if (fire) {
    focusFire.value = { lat: fire.lat, lng: fire.lng, id: fire.id, ts: Date.now() }
  }
}

// Auto-refresh every 60 seconds
let refreshTimer = null
onMounted(() => {
  // Auto-select first fire
  if (firesList.value.length > 0) {
    selectedFireId.value = firesList.value[0].id
  }
  refreshTimer = setInterval(async () => {
    await refreshNuxtData()
  }, 60000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.station-count-badge {
  font-size: 0.68rem;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
}

.stations-list {
  max-height: 420px;
  overflow: hidden;
  transition: max-height 0.4s ease;
}

.stations-list.expanded {
  max-height: none;
}

.show-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 8px 0;
  margin-top: 8px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.show-more-btn:hover {
  background: rgba(56, 189, 248, 0.06);
  border-color: rgba(56, 189, 248, 0.3);
}

.show-more-btn .material-symbols-rounded {
  font-size: 18px;
}
</style>
