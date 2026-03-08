<template>
  <div>
    <!-- Page Header -->
    <div class="ranking-page-header">
      <div class="page-title-area">
        <span class="material-symbols-rounded" style="font-size: 32px; color: var(--accent)">emoji_events</span>
        <div>
          <h1 class="page-title">จัดอันดับจังหวัด</h1>
          <p class="page-subtitle">เปรียบเทียบสถานการณ์ภัยพิบัติรายจังหวัด — อัปเดตเรียลไทม์</p>
        </div>
      </div>
      <div class="last-updated" v-if="!loading">
        <span class="material-symbols-rounded" style="font-size: 16px">schedule</span>
        อัปเดต {{ updateTime }}
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-overlay" style="min-height: 400px">
      <div class="spinner"></div>
      <div>กำลังโหลดข้อมูลจัดอันดับ...</div>
    </div>

    <!-- Rankings Grid -->
    <div v-else class="rankings-grid">

      <!-- PM2.5 Ranking -->
      <div class="ranking-card glass-card">
        <div class="rc-header pm25">
          <div class="rc-icon">💨</div>
          <div>
            <div class="rc-title">PM2.5 สูงสุด</div>
            <div class="rc-desc">จังหวัดที่มีฝุ่นหนักที่สุด</div>
          </div>
        </div>
        <div class="rc-list">
          <div v-if="pm25Ranking.length === 0" class="rc-empty">
            <span class="material-symbols-rounded">check_circle</span>
            ไม่มีข้อมูล PM2.5 ในขณะนี้
          </div>
          <div
            v-for="(item, idx) in pm25Ranking"
            :key="'pm25-' + idx"
            class="rc-row"
            :class="{ top1: idx === 0, top3: idx < 3 }"
          >
            <div class="rc-rank" :class="getRankClass(idx)">{{ idx + 1 }}</div>
            <div class="rc-info">
              <div class="rc-name">{{ item.name }}</div>
              <div class="rc-sub">{{ item.label }}</div>
            </div>
            <div class="rc-value" :style="{ color: item.color }">
              <div class="rc-val-big">{{ item.aqi }}</div>
              <div class="rc-val-unit">AQI</div>
            </div>
            <div class="rc-bar-track">
              <div class="rc-bar" :style="{ width: getBarWidth(item.aqi, pm25Max) + '%', background: item.color }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Rain Ranking -->
      <div class="ranking-card glass-card">
        <div class="rc-header rain">
          <div class="rc-icon">🌧️</div>
          <div>
            <div class="rc-title">ฝนตกหนักสุด</div>
            <div class="rc-desc">ปริมาณฝนสะสม 24 ชม.</div>
          </div>
        </div>
        <div class="rc-list">
          <div v-if="rainRanking.length === 0" class="rc-empty">
            <span class="material-symbols-rounded">check_circle</span>
            ไม่มีรายงานฝนตกในขณะนี้
          </div>
          <div
            v-for="(item, idx) in rainRanking"
            :key="'rain-' + idx"
            class="rc-row"
            :class="{ top1: idx === 0, top3: idx < 3 }"
          >
            <div class="rc-rank" :class="getRankClass(idx)">{{ idx + 1 }}</div>
            <div class="rc-info">
              <div class="rc-name">{{ item.province }}</div>
              <div class="rc-sub">{{ item.amphoe }} {{ item.name }}</div>
            </div>
            <div class="rc-value" style="color: #2563eb">
              <div class="rc-val-big">{{ item.rain24h }}</div>
              <div class="rc-val-unit">mm</div>
            </div>
            <div class="rc-bar-track">
              <div class="rc-bar" :style="{ width: getBarWidth(item.rain24h, rainMax) + '%', background: '#3b82f6' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Water Level Ranking -->
      <div class="ranking-card glass-card">
        <div class="rc-header water">
          <div class="rc-icon">💧</div>
          <div>
            <div class="rc-title">ระดับน้ำวิกฤต</div>
            <div class="rc-desc">สถานีที่มีระดับน้ำสูงสุด</div>
          </div>
        </div>
        <div class="rc-list">
          <div v-if="waterRanking.length === 0" class="rc-empty">
            <span class="material-symbols-rounded">check_circle</span>
            ไม่มีสถานีวิกฤตในขณะนี้
          </div>
          <div
            v-for="(item, idx) in waterRanking"
            :key="'water-' + idx"
            class="rc-row"
            :class="{ top1: idx === 0, top3: idx < 3 }"
          >
            <div class="rc-rank" :class="getRankClass(idx)">{{ idx + 1 }}</div>
            <div class="rc-info">
              <div class="rc-name">{{ item.name }}</div>
              <div class="rc-sub">{{ item.description }}</div>
            </div>
            <div class="rc-value" :style="{ color: item.riskLevel === 'danger' ? '#dc2626' : item.riskLevel === 'warning' ? '#d97706' : '#15803d' }">
              <div class="rc-val-big">{{ item.currentLevel?.toFixed(2) }}</div>
              <div class="rc-val-unit">m</div>
            </div>
            <div class="rc-bar-track">
              <div class="rc-bar" :style="{ width: getBarWidth(item.currentLevel, waterMax) + '%', background: item.riskLevel === 'danger' ? '#ef4444' : item.riskLevel === 'warning' ? '#f59e0b' : '#22c55e' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Fire Ranking -->
      <div class="ranking-card glass-card">
        <div class="rc-header fire">
          <div class="rc-icon">🔥</div>
          <div>
            <div class="rc-title">จุดไฟป่ามากสุด</div>
            <div class="rc-desc">จังหวัดที่มีจุดความร้อนมากที่สุด</div>
          </div>
        </div>
        <div class="rc-list">
          <div v-if="fireRanking.length === 0" class="rc-empty">
            <span class="material-symbols-rounded">check_circle</span>
            ไม่พบจุดไฟป่าในขณะนี้ ✅
          </div>
          <div
            v-for="(item, idx) in fireRanking"
            :key="'fire-' + idx"
            class="rc-row"
            :class="{ top1: idx === 0, top3: idx < 3 }"
          >
            <div class="rc-rank" :class="getRankClass(idx)">{{ idx + 1 }}</div>
            <div class="rc-info">
              <div class="rc-name">{{ item.province }}</div>
              <div class="rc-sub">{{ item.count }} จุดความร้อน</div>
            </div>
            <div class="rc-value" :style="{ color: item.count > 10 ? '#dc2626' : item.count > 5 ? '#f97316' : '#f59e0b' }">
              <div class="rc-val-big">{{ item.count }}</div>
              <div class="rc-val-unit">จุด</div>
            </div>
            <div class="rc-bar-track">
              <div class="rc-bar" :style="{ width: getBarWidth(item.count, fireMax) + '%', background: item.count > 10 ? '#ef4444' : item.count > 5 ? '#f97316' : '#f59e0b' }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useHead({ title: 'จัดอันดับจังหวัด — Thailand Disaster Watch' })

const loading = ref(true)
const updateTime = ref('')

const waterStations = ref([])
const aqiStations = ref([])
const fires = ref([])
const rainStationsList = ref([])

onMounted(async () => {
  await fetchAll()
})

async function fetchAll() {
  loading.value = true
  try {
    const [summary, fireData, aqiData, rainData] = await Promise.allSettled([
      $fetch('/api/dashboard/summary'),
      $fetch('/api/dashboard/fires'),
      $fetch('/api/dashboard/aqi'),
      $fetch('/api/dashboard/rain'),
    ])
    waterStations.value = summary.status === 'fulfilled' ? (summary.value?.stations || []) : []
    fires.value = fireData.status === 'fulfilled' ? (fireData.value?.fires || []) : []
    aqiStations.value = aqiData.status === 'fulfilled' ? (aqiData.value?.stations || []) : []
    rainStationsList.value = rainData.status === 'fulfilled' ? (rainData.value?.rainStations || []) : []
    updateTime.value = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    console.error('[Ranking] Fetch error:', e)
  } finally {
    loading.value = false
  }
}

// --- Rankings ---
const pm25Ranking = computed(() => {
  return [...aqiStations.value]
    .filter(s => s.aqi > 0)
    .sort((a, b) => (b.aqi || 0) - (a.aqi || 0))
    .slice(0, 10)
})

const pm25Max = computed(() => pm25Ranking.value[0]?.aqi || 1)

const rainRanking = computed(() => {
  return [...rainStationsList.value]
    .filter(r => r.rain24h > 0)
    .sort((a, b) => (b.rain24h || 0) - (a.rain24h || 0))
    .slice(0, 10)
})

const rainMax = computed(() => rainRanking.value[0]?.rain24h || 1)

const waterRanking = computed(() => {
  return [...waterStations.value]
    .sort((a, b) => {
      // Priority: danger > warning > safe, then by level
      const riskOrder = { danger: 3, critical: 3, warning: 2, safe: 1 }
      const riskDiff = (riskOrder[b.riskLevel] || 0) - (riskOrder[a.riskLevel] || 0)
      if (riskDiff !== 0) return riskDiff
      return (b.currentLevel || 0) - (a.currentLevel || 0)
    })
    .slice(0, 10)
})

const waterMax = computed(() => {
  const levels = waterRanking.value.map(s => s.currentLevel || 0)
  return Math.max(...levels, 1)
})

const fireRanking = computed(() => {
  // Group fires by province
  const provMap = {}
  for (const fire of fires.value) {
    const prov = fire.province || fire.name?.split(' ')[0] || 'ไม่ทราบ'
    if (!provMap[prov]) provMap[prov] = { province: prov, count: 0 }
    provMap[prov].count++
  }
  return Object.values(provMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
})

const fireMax = computed(() => fireRanking.value[0]?.count || 1)

function getBarWidth(value, max) {
  if (!value || !max) return 0
  return Math.min(100, (value / max) * 100)
}

function getRankClass(idx) {
  if (idx === 0) return 'gold'
  if (idx === 1) return 'silver'
  if (idx === 2) return 'bronze'
  return ''
}
</script>

<style scoped>
.ranking-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.page-subtitle {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.last-updated {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: var(--bg-card);
  padding: 4px 12px;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
}

/* Rankings Grid */
.rankings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

@media (max-width: 900px) {
  .rankings-grid {
    grid-template-columns: 1fr;
  }
}

/* Ranking Card */
.ranking-card {
  padding: 0;
  overflow: hidden;
}

.rc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.rc-header.pm25 { background: rgba(234, 88, 12, 0.05); }
.rc-header.rain { background: rgba(37, 99, 235, 0.05); }
.rc-header.water { background: rgba(29, 78, 216, 0.05); }
.rc-header.fire { background: rgba(220, 38, 38, 0.05); }

[data-theme="dark"] .rc-header.pm25 { background: rgba(234, 88, 12, 0.08); }
[data-theme="dark"] .rc-header.rain { background: rgba(37, 99, 235, 0.08); }
[data-theme="dark"] .rc-header.water { background: rgba(29, 78, 216, 0.08); }
[data-theme="dark"] .rc-header.fire { background: rgba(220, 38, 38, 0.08); }

.rc-icon {
  font-size: 28px;
  line-height: 1;
}

.rc-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.rc-desc {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* List */
.rc-list {
  padding: 8px 0;
}

.rc-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 18px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.rc-empty .material-symbols-rounded {
  color: var(--color-safe);
  font-size: 20px;
}

.rc-row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 0 10px;
  padding: 8px 18px;
  transition: background 0.15s;
}

.rc-row:hover {
  background: rgba(29, 78, 216, 0.03);
}

[data-theme="dark"] .rc-row:hover {
  background: rgba(56, 189, 248, 0.05);
}

.rc-row.top1 {
  background: rgba(234, 179, 8, 0.04);
}

.rc-row.top3 {
  font-weight: 500;
}

/* Rank Badge */
.rc-rank {
  grid-row: 1 / 3;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
}

.rc-rank.gold {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #78350f;
  border-color: #f59e0b;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}

.rc-rank.silver {
  background: linear-gradient(135deg, #d1d5db, #9ca3af);
  color: #374151;
  border-color: #9ca3af;
}

.rc-rank.bronze {
  background: linear-gradient(135deg, #d97706, #b45309);
  color: #fff;
  border-color: #b45309;
}

/* Info */
.rc-info {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}

.rc-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-sub {
  font-size: 0.68rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Value */
.rc-value {
  grid-column: 3;
  grid-row: 1;
  text-align: right;
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.rc-val-big {
  font-size: 1.1rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.rc-val-unit {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 500;
}

/* Bar */
.rc-bar-track {
  grid-column: 2 / 4;
  grid-row: 2;
  height: 4px;
  background: var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 4px;
}

.rc-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
