<template>
  <div>
      <!-- Alert Banner -->
      <AlertBanner v-if="!pendingDashboard" :risk-level="overallRisk" :stations="dashboardStations" :fires="firesList" @view-map="handleViewMap" />

      <!-- View Mode Toggle -->
      <div class="view-toggle-bar">
        <button
          class="view-toggle-btn"
          :class="{ active: viewMode === 'thailand' }"
          @click="viewMode = 'thailand'"
        >
          <span class="toggle-emoji">🇹🇭</span>
          ข้อมูลไทย (Real-time)
        </button>
        <button
          class="view-toggle-btn"
          :class="{ active: viewMode === 'world' }"
          @click="switchToWorld"
        >
          <span class="toggle-emoji">🌍</span>
          Top 20 ภัยพิบัติโลก
        </button>
      </div>

      <!-- World Disasters View -->
      <div v-if="viewMode === 'world'" class="world-disasters-section">
        <div v-if="pendingWorld" class="loading-overlay" style="min-height: 200px">
          <div class="spinner"></div>
          <div>กำลังโหลดข้อมูลภัยพิบัติโลก...</div>
        </div>
        <template v-else>
          <div class="world-disasters-header">
            <div class="card-title">
              <span class="material-symbols-rounded">public</span>
              ภัยพิบัติโลก Top 20 (ReliefWeb / UN OCHA)
            </div>
            <span class="station-count-badge">{{ worldDisastersList.length }} เหตุการณ์</span>
          </div>
          <div class="world-disasters-grid">
            <div
              v-for="disaster in worldDisastersList"
              :key="disaster.id"
              class="world-disaster-card"
              :class="disaster.severity"
              @click="focusWorldDisaster(disaster)"
            >
              <div class="wd-emoji">{{ disaster.emoji }}</div>
              <div class="wd-info">
                <div class="wd-name">{{ disaster.name }}</div>
                <div class="wd-meta">
                  <span class="wd-type">{{ disaster.type }}</span>
                  <span class="wd-country">📍 {{ disaster.country }}</span>
                </div>
                <div class="wd-date">{{ formatDisasterDate(disaster.date) }}</div>
              </div>
              <div class="wd-severity" :style="{ background: disaster.severityColor + '20', color: disaster.severityColor }">
                {{ disaster.severity === 'high' ? 'รุนแรง' : disaster.severity === 'medium' ? 'กำลังดำเนินอยู่' : 'ติดตาม' }}
              </div>
            </div>
          </div>

          <!-- World Map -->
          <div class="map-section" style="margin-top: 1.25rem">
            <FloodMap
              ref="floodMapRef"
              :stations="[]"
              :fires="[]"
              :world-fires="[]"
              :reports="[]"
              :rain-stations="[]"
              :spread-predictions="[]"
              :aqi-stations="[]"
              :selected-fire-id="''"
              :focus-fire="null"
              :focus-station="focusStation"
              :world-disasters="worldDisastersList"
              :view-mode="viewMode"
              @select-station="() => {}"
              @select-fire="() => {}"
              @add-report="() => {}"
            />
          </div>
        </template>
      </div>

    <!-- Summary Stats (Thai mode only) -->
    <div v-if="viewMode === 'thailand'" class="stats-bar">
      <!-- Skeleton Stats -->
      <template v-if="pendingDashboard || pendingFire">
        <div v-for="i in 7" :key="'skel-stat-'+i" class="skeleton-stat-item">
          <div class="skeleton skeleton-stat-icon"></div>
          <div class="skeleton-stat-lines">
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line medium"></div>
            <div class="skeleton skeleton-line tiny"></div>
          </div>
        </div>
      </template>
      <!-- Real Stats -->
      <template v-else>
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
      </template>
    </div>

    <!-- Dashboard Grid (Thai mode only) -->
    <div v-if="viewMode === 'thailand'" class="dashboard-grid">
      <!-- Map -->
      <div class="map-section">
        <!-- Skeleton Map -->
        <div v-if="pendingDashboard" class="skeleton skeleton-map">
          <span class="material-symbols-rounded">map</span>
          กำลังโหลดแผนที่...
        </div>
        <!-- Real Map -->
        <FloodMap
          v-else
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
            <span class="station-count-badge">{{ pendingDashboard ? '...' : dashboardStations.length + ' แห่ง' }}</span>
          </div>
          <!-- Skeleton Stations -->
          <div v-if="pendingDashboard" class="stations-list">
            <div v-for="i in 4" :key="'skel-st-'+i" class="skeleton-station">
              <div class="skeleton skeleton-station-icon"></div>
              <div class="skeleton-station-info">
                <div class="skeleton skeleton-line" style="width: 65%"></div>
                <div class="skeleton skeleton-line tiny"></div>
              </div>
              <div class="skeleton skeleton-station-value"></div>
            </div>
          </div>
          <!-- Real Stations -->
          <template v-else>
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
          </template>
        </div>

        <PredictionPanel :station="selectedStation" />
      </div>

      <!-- Fire Spread Prediction -->
      <div class="fire-section">
        <!-- Skeleton Fire Panel -->
        <div v-if="pendingFire" class="skeleton-fire-panel">
          <div class="skeleton-fire-header">
            <div class="skeleton skeleton-line" style="width: 30%; height: 16px"></div>
          </div>
          <div class="skeleton-fire-cards">
            <div v-for="i in 3" :key="'skel-fire-'+i" class="skeleton skeleton-fire-card"></div>
          </div>
        </div>
        <!-- Real Fire Panel -->
        <FireSpreadPanel
          v-else
          :fires="firesList"
          :selected-fire-id="selectedFireId"
          @select-fire="handleFireSelect"
        />
      </div>

      <!-- Chart -->
      <div class="chart-section">
        <!-- Skeleton Chart -->
        <div v-if="pendingDashboard" class="skeleton-chart">
          <div class="skeleton skeleton-line" style="width: 25%; height: 16px"></div>
          <div class="skeleton-chart-bars">
            <div v-for="i in 12" :key="'skel-bar-'+i" class="skeleton skeleton-chart-bar" :style="{ height: (20 + Math.random() * 60) + '%' }"></div>
          </div>
        </div>
        <!-- Real Chart -->
        <WaterLevelChart
          v-else
          :station-id="selectedStationId"
          :station-name="selectedStation?.name || 'สถานี'"
        />
      </div>
    </div> <!-- End dashboard-grid -->

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

// World Disasters (lazy — only fetched on demand)
const viewMode = ref('thailand')
const worldData = ref(null)
const pendingWorld = ref(false)

async function switchToWorld() {
  viewMode.value = 'world'
  if (!worldData.value) {
    pendingWorld.value = true
    try {
      worldData.value = await $fetch('/api/dashboard/world-disasters')
    } catch (e) {
      console.error('Failed to fetch world disasters:', e)
    } finally {
      pendingWorld.value = false
    }
  }
}

const worldDisastersList = computed(() => worldData.value?.disasters || [])

function formatDisasterDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

function focusWorldDisaster(disaster) {
  if (disaster.lat && disaster.lng) {
    focusStation.value = {
      lat: disaster.lat,
      lng: disaster.lng,
      id: disaster.id,
      ts: Date.now()
    }
  }
}

// Note: Loading states are now handled per-section in the template (skeleton loading)
// const isPending/isError removed — each section shows its own skeleton/error

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
  return rainStationsList.value.reduce((sum, s) => sum + (s.rain24h || 0), 0)
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

// Auto-refresh every 5 minutes (matches server cache TTL of 3 min)
let refreshTimer = null
onMounted(() => {
  // Auto-select first fire
  if (firesList.value.length > 0) {
    selectedFireId.value = firesList.value[0].id
  }
  refreshTimer = setInterval(async () => {
    console.log('[Auto-refresh] Refreshing all data...')
    await refreshNuxtData()
  }, 5 * 60 * 1000) // 5 minutes
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

/* ===== View Toggle ===== */
.view-toggle-bar {
  display: flex;
  gap: 0;
  margin-bottom: 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  padding: 4px;
  box-shadow: var(--shadow-card);
}

.view-toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: 0.88rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.view-toggle-btn:hover {
  color: var(--text-primary);
  background: rgba(29, 78, 216, 0.04);
}

.view-toggle-btn.active {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 2px 8px rgba(29, 78, 216, 0.3);
}

.toggle-emoji {
  font-size: 1.1rem;
}

/* ===== World Disasters ===== */
.world-disasters-section {
  animation: slide-in-down 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.world-disasters-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.world-disasters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 0.75rem;
}

.world-disaster-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: var(--shadow-card);
}

.world-disaster-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card), 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: var(--accent);
}

.world-disaster-card.high {
  border-left: 3px solid #dc2626;
}

.world-disaster-card.medium {
  border-left: 3px solid #f59e0b;
}

.world-disaster-card.active {
  border-left: 3px solid #3b82f6;
}

.wd-emoji {
  font-size: 1.8rem;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(29, 78, 216, 0.06);
  border-radius: var(--radius-sm);
}

.wd-info {
  flex: 1;
  min-width: 0;
}

.wd-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
  margin-bottom: 3px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.wd-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.wd-type {
  background: rgba(29, 78, 216, 0.08);
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  color: var(--accent);
}

.wd-date {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.wd-severity {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

@keyframes slide-in-down {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  .world-disasters-grid {
    grid-template-columns: 1fr;
  }
  .view-toggle-btn {
    font-size: 0.78rem;
    padding: 8px 12px;
  }
}
</style>
