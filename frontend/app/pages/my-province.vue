<template>
  <div>
    <!-- Page Header -->
    <div class="province-page-header">
      <div class="page-title-area">
        <span class="material-symbols-rounded" style="font-size: 32px; color: var(--accent)">location_on</span>
        <div>
          <h1 class="page-title">จังหวัดของฉัน</h1>
          <p class="page-subtitle">ติดตามสถานการณ์ภัยพิบัติในจังหวัดที่คุณสนใจ</p>
        </div>
      </div>
    </div>

    <!-- Province Selector -->
    <div class="glass-card province-selector-card">
      <div class="card-header">
        <div class="card-title">
          <span class="material-symbols-rounded">add_location_alt</span>
          เลือกจังหวัดที่สนใจ
        </div>
        <span class="selected-count" v-if="selectedProvinces.length > 0">
          {{ selectedProvinces.length }} จังหวัด
        </span>
      </div>
      
      <div class="province-search-row">
        <div class="province-search-input-wrap">
          <span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-muted)">search</span>
          <input 
            v-model="searchTerm" 
            type="text" 
            placeholder="ค้นหาจังหวัด..." 
            class="province-search-input"
          />
        </div>
      </div>

      <div class="province-chips">
        <button
          v-for="prov in filteredProvinceList"
          :key="prov"
          class="province-chip"
          :class="{ selected: selectedProvinces.includes(prov) }"
          @click="toggleProvince(prov)"
        >
          <span class="material-symbols-rounded" style="font-size: 14px">
            {{ selectedProvinces.includes(prov) ? 'check_circle' : 'add_circle_outline' }}
          </span>
          {{ prov }}
        </button>
      </div>
    </div>

    <!-- No Selection State -->
    <div v-if="selectedProvinces.length === 0" class="empty-state glass-card">
      <span class="material-symbols-rounded" style="font-size: 48px; color: var(--text-muted)">pin_drop</span>
      <p class="empty-title">ยังไม่ได้เลือกจังหวัด</p>
      <p class="empty-text">เลือกจังหวัดด้านบนเพื่อดูสถานการณ์ภัยพิบัติแบบเจาะลึก</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="loading-overlay" style="min-height: 300px">
      <div class="spinner"></div>
      <div>กำลังโหลดข้อมูล...</div>
    </div>

    <!-- Province Data Cards -->
    <div v-else class="province-results">
      <div
        v-for="prov in selectedProvinces"
        :key="prov"
        class="province-data-card glass-card"
      >
        <div class="pdc-header">
          <div class="pdc-title">
            <span class="material-symbols-rounded" style="color: var(--accent)">location_city</span>
            <h2>{{ prov }}</h2>
          </div>
          <button class="icon-btn remove-btn" @click="removeProvince(prov)" title="ลบจังหวัดนี้">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <!-- Summary Stats Row -->
        <div class="pdc-stats-row">
          <div class="pdc-stat" :class="getWaterStatusClass(prov)">
            <span class="material-symbols-rounded">water_drop</span>
            <div>
              <div class="pdc-stat-value">{{ getWaterCount(prov) }}</div>
              <div class="pdc-stat-label">สถานีน้ำ</div>
            </div>
          </div>
          <div class="pdc-stat" :class="getAqiStatusClass(prov)">
            <span class="material-symbols-rounded">masks</span>
            <div>
              <div class="pdc-stat-value">{{ getAqiValue(prov) }}</div>
              <div class="pdc-stat-label">AQI</div>
            </div>
          </div>
          <div class="pdc-stat" :class="getFireStatusClass(prov)">
            <span class="material-symbols-rounded">local_fire_department</span>
            <div>
              <div class="pdc-stat-value">{{ getFireCount(prov) }}</div>
              <div class="pdc-stat-label">จุดไฟ</div>
            </div>
          </div>
          <div class="pdc-stat">
            <span class="material-symbols-rounded" style="color: #3b82f6">rainy</span>
            <div>
              <div class="pdc-stat-value">{{ getRainValue(prov) }}</div>
              <div class="pdc-stat-label">ฝน 24ชม.</div>
            </div>
          </div>
        </div>

        <!-- Detail Sections -->
        <div class="pdc-details">
          <!-- Water Stations -->
          <div v-if="getWaterStations(prov).length > 0" class="pdc-section">
            <div class="pdc-section-title">💧 สถานีระดับน้ำ</div>
            <div v-for="s in getWaterStations(prov)" :key="s.id" class="pdc-detail-row">
              <span class="pdc-detail-name">{{ s.name }}</span>
              <span class="pdc-detail-value" :class="s.riskLevel">
                {{ s.currentLevel?.toFixed(2) || '-' }} m
                <span class="pdc-risk-tag" :class="s.riskLevel">
                  {{ s.riskLevel === 'danger' ? 'วิกฤต' : s.riskLevel === 'warning' ? 'เฝ้าระวัง' : 'ปกติ' }}
                </span>
              </span>
            </div>
          </div>

          <!-- AQI -->
          <div v-if="getAqiStations(prov).length > 0" class="pdc-section">
            <div class="pdc-section-title">💨 คุณภาพอากาศ</div>
            <div v-for="s in getAqiStations(prov)" :key="s.name" class="pdc-detail-row">
              <span class="pdc-detail-name">{{ s.name }}</span>
              <span class="pdc-detail-value" :style="{ color: s.color }">
                AQI {{ s.aqi }} (PM2.5: {{ s.pm25 || '-' }})
              </span>
            </div>
          </div>

          <!-- Fire -->
          <div v-if="getFireHotspots(prov).length > 0" class="pdc-section">
            <div class="pdc-section-title">🔥 จุดความร้อน</div>
            <div v-for="f in getFireHotspots(prov)" :key="f.id" class="pdc-detail-row">
              <span class="pdc-detail-name">{{ f.name }}</span>
              <span class="pdc-detail-value" :style="{ color: f.intensity === 'extreme' ? '#dc2626' : f.intensity === 'high' ? '#f97316' : '#f59e0b' }">
                {{ f.intensity === 'extreme' ? 'รุนแรงมาก' : f.intensity === 'high' ? 'รุนแรง' : 'ปานกลาง' }}
                ({{ f.areaSqKm }} ตร.กม.)
              </span>
            </div>
          </div>

          <!-- Rain -->
          <div v-if="getRainStations(prov).length > 0" class="pdc-section">
            <div class="pdc-section-title">🌧️ ฝนตก</div>
            <div v-for="r in getRainStations(prov)" :key="r.name" class="pdc-detail-row">
              <span class="pdc-detail-name">{{ r.amphoe }} {{ r.name }}</span>
              <span class="pdc-detail-value" style="color: #3b82f6">
                {{ r.rain24h }} mm
              </span>
            </div>
          </div>

          <!-- No Data -->
          <div v-if="getWaterStations(prov).length === 0 && getAqiStations(prov).length === 0 && getFireHotspots(prov).length === 0 && getRainStations(prov).length === 0"
            class="pdc-no-data"
          >
            <span class="material-symbols-rounded" style="font-size: 24px; color: var(--color-safe)">check_circle</span>
            <span>ไม่พบข้อมูลเฝ้าระวังในจังหวัดนี้ — สถานการณ์ปกติ ✅</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useHead({ title: 'จังหวัดของฉัน — Thailand Disaster Watch' })

const PROVINCE_LIST = [
  'กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร',
  'ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท',
  'ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง',
  'ตราด','ตาก','นครนายก','นครปฐม','นครพนม',
  'นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส',
  'น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์',
  'ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พังงา','พัทลุง',
  'พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่',
  'ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร',
  'ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี',
  'ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ',
  'สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม',
  'สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย',
  'สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู',
  'อ่างทอง','อุดรธานี','อุทัยธานี','อุตรดิตถ์','อุบลราชธานี','อำนาจเจริญ',
]

const searchTerm = ref('')
const selectedProvinces = ref([])
const loading = ref(false)

// Data from API
const waterStations = ref([])
const aqiStations = ref([])
const fires = ref([])
const rainStations = ref([])

const filteredProvinceList = computed(() => {
  if (!searchTerm.value.trim()) return PROVINCE_LIST
  return PROVINCE_LIST.filter(p => p.includes(searchTerm.value.trim()))
})

// Load saved provinces from localStorage
onMounted(() => {
  const saved = localStorage.getItem('my-provinces')
  if (saved) {
    try {
      selectedProvinces.value = JSON.parse(saved)
    } catch (e) { /* ignore */ }
  }
  if (selectedProvinces.value.length > 0) {
    fetchAllData()
  }
})

// Watch for changes and re-fetch
watch(selectedProvinces, (val) => {
  localStorage.setItem('my-provinces', JSON.stringify(val))
  if (val.length > 0 && waterStations.value.length === 0) {
    fetchAllData()
  }
}, { deep: true })

function toggleProvince(prov) {
  const idx = selectedProvinces.value.indexOf(prov)
  if (idx >= 0) {
    selectedProvinces.value.splice(idx, 1)
  } else {
    selectedProvinces.value.push(prov)
    // Fetch data if first selection
    if (waterStations.value.length === 0) {
      fetchAllData()
    }
  }
}

function removeProvince(prov) {
  const idx = selectedProvinces.value.indexOf(prov)
  if (idx >= 0) selectedProvinces.value.splice(idx, 1)
}

async function fetchAllData() {
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
    rainStations.value = rainData.status === 'fulfilled' ? (rainData.value?.rainStations || []) : []
  } catch (e) {
    console.error('[MyProvince] Fetch error:', e)
  } finally {
    loading.value = false
  }
}

// --- Filter functions ---
function matchProvince(text, province) {
  if (!text) return false
  // Normalize: กรุงเทพมหานคร → กรุงเทพ
  const prov = province.replace('มหานคร', '').replace('จังหวัด', '')
  return text.includes(province) || text.includes(prov)
}

function getWaterStations(prov) {
  return waterStations.value.filter(s => 
    matchProvince(s.description || '', prov) || matchProvince(s.name || '', prov)
  )
}

function getAqiStations(prov) {
  return aqiStations.value.filter(s => 
    matchProvince(s.name || '', prov) || matchProvince(s.nameEn || '', prov)
  )
}

function getFireHotspots(prov) {
  return fires.value.filter(f => matchProvince(f.name || '', prov) || matchProvince(f.province || '', prov))
}

function getRainStations(prov) {
  return rainStations.value.filter(r => matchProvince(r.province || '', prov))
}

// --- Summary values ---
function getWaterCount(prov) {
  const stations = getWaterStations(prov)
  if (stations.length === 0) return '-'
  const critical = stations.filter(s => s.riskLevel === 'danger' || s.riskLevel === 'warning').length
  return critical > 0 ? `${critical}⚠️/${stations.length}` : `${stations.length}`
}

function getWaterStatusClass(prov) {
  const stations = getWaterStations(prov)
  if (stations.some(s => s.riskLevel === 'danger')) return 'stat-danger'
  if (stations.some(s => s.riskLevel === 'warning')) return 'stat-warning'
  return ''
}

function getAqiValue(prov) {
  const stations = getAqiStations(prov)
  if (stations.length === 0) return '-'
  const maxAqi = Math.max(...stations.map(s => s.aqi || 0))
  return maxAqi
}

function getAqiStatusClass(prov) {
  const val = getAqiValue(prov)
  if (val === '-') return ''
  if (val > 150) return 'stat-danger'
  if (val > 100) return 'stat-warning'
  return ''
}

function getFireCount(prov) {
  const count = getFireHotspots(prov).length
  return count > 0 ? count : '-'
}

function getFireStatusClass(prov) {
  const count = getFireHotspots(prov).length
  if (count > 5) return 'stat-danger'
  if (count > 0) return 'stat-warning'
  return ''
}

function getRainValue(prov) {
  const stations = getRainStations(prov)
  if (stations.length === 0) return '-'
  const maxRain = Math.max(...stations.map(s => s.rain24h || 0))
  return `${maxRain} mm`
}
</script>

<style scoped>
.province-page-header {
  margin-bottom: 1.5rem;
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

/* Province Selector */
.province-selector-card {
  margin-bottom: 1.5rem;
}

.selected-count {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-glow);
  padding: 4px 10px;
  border-radius: 12px;
}

.province-search-row {
  margin-bottom: 12px;
}

.province-search-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px 12px;
}

.province-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
}

.province-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.province-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.province-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.province-chip.selected {
  background: rgba(29, 78, 216, 0.1);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

[data-theme="dark"] .province-chip.selected {
  background: rgba(56, 189, 248, 0.12);
  border-color: #38bdf8;
  color: #38bdf8;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 3rem 2rem;
}

.empty-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 12px 0 4px;
}

.empty-text {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Province Data Cards */
.province-results {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.province-data-card {
  padding: 0;
  overflow: hidden;
}

.pdc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: rgba(29, 78, 216, 0.04);
  border-bottom: 1px solid var(--border-subtle);
}

[data-theme="dark"] .pdc-header {
  background: rgba(56, 189, 248, 0.05);
}

.pdc-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pdc-title h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.remove-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  transition: all 0.15s;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-danger);
}

/* Stats Row */
.pdc-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-bottom: 1px solid var(--border-subtle);
}

.pdc-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-right: 1px solid var(--border-subtle);
}

.pdc-stat:last-child {
  border-right: none;
}

.pdc-stat .material-symbols-rounded {
  font-size: 22px;
  color: var(--text-muted);
}

.pdc-stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pdc-stat-label {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.pdc-stat.stat-danger .pdc-stat-value { color: var(--color-danger); }
.pdc-stat.stat-danger .material-symbols-rounded { color: var(--color-danger); }
.pdc-stat.stat-warning .pdc-stat-value { color: var(--color-warning); }
.pdc-stat.stat-warning .material-symbols-rounded { color: var(--color-warning); }

/* Details */
.pdc-details {
  padding: 1rem 1.25rem;
}

.pdc-section {
  margin-bottom: 1rem;
}

.pdc-section:last-child {
  margin-bottom: 0;
}

.pdc-section-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-subtle);
}

.pdc-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 0.82rem;
  gap: 12px;
}

.pdc-detail-name {
  color: var(--text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdc-detail-value {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}

.pdc-detail-value.danger { color: var(--color-danger); }
.pdc-detail-value.warning { color: var(--color-warning); }
.pdc-detail-value.safe { color: var(--color-safe); }

.pdc-risk-tag {
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

.pdc-risk-tag.danger {
  background: rgba(220, 38, 38, 0.1);
  color: var(--color-danger);
}

.pdc-risk-tag.warning {
  background: rgba(217, 119, 6, 0.1);
  color: var(--color-warning);
}

.pdc-risk-tag.safe {
  background: rgba(21, 128, 61, 0.1);
  color: var(--color-safe);
}

.pdc-no-data {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .pdc-stats-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .pdc-stat:nth-child(2) {
    border-right: none;
  }

  .pdc-stat:nth-child(3),
  .pdc-stat:nth-child(4) {
    border-top: 1px solid var(--border-subtle);
  }
}

@media (max-width: 480px) {
  .pdc-stats-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
