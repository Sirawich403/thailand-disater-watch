<template>
  <div class="alert-banner" :class="bannerClass">
    <span class="alert-icon material-symbols-rounded">
      {{ alertIcon }}
    </span>
    <div class="alert-content">
      <div class="alert-title">{{ alertTitle }}</div>
      <div class="alert-text">{{ alertText }}</div>
    </div>
    <button 
      v-if="primaryAlertLocation" 
      class="view-map-btn" 
      @click="$emit('view-map', primaryAlertLocation)"
    >
      <span class="material-symbols-rounded">my_location</span>
      ดูพิกัด
    </button>
    <span v-if="bannerClass !== 'safe'" class="risk-badge" :class="bannerClass">
      {{ bannerBadge }}
    </span>
  </div>
</template>

<script setup>
const props = defineProps({
  riskLevel: { type: String, default: 'safe' },
  stations: { type: Array, default: () => [] },
  fires: { type: Array, default: () => [] },
})

defineEmits(['view-map'])

const activeFires = computed(() => props.fires.filter((f) => f.status === 'active'))
const hasHighFire = computed(() => props.fires.some((f) => f.intensity === 'extreme' || f.intensity === 'high'))

// สถานีที่ ThaiWater API ยืนยันว่าล้นตลิ่ง (situation_level >= 5, real-time)
const dangerStations = computed(() => props.stations.filter((s) => s.riskLevel === 'danger'))
// สถานีที่ ThaiWater API ยืนยันว่าวิกฤต (situation_level >= 3)
const criticalStations = computed(() => props.stations.filter((s) => s.riskLevel === 'critical'))
// สถานีเฝ้าระวัง (situation_level >= 2)
const warningStations = computed(() => props.stations.filter((s) => s.riskLevel === 'warning'))
// ไฟป่ารุนแรงมาก
const extremeFires = computed(() => activeFires.value.filter((f) => f.intensity === 'extreme'))

const primaryAlertLocation = computed(() => {
  if (dangerStations.value.length > 0) return dangerStations.value[0]
  if (extremeFires.value.length >= 5) return extremeFires.value[0]
  if (criticalStations.value.length > 0) return criticalStations.value[0]
  if (extremeFires.value.length > 0) return extremeFires.value[0]
  if (warningStations.value.length > 0) return warningStations.value[0]
  if (activeFires.value.length > 0) return activeFires.value[0]
  return null
})

// เกณฑ์เข้มงวด — วิกฤตจริงๆ เท่านั้น (ข้อมูล real-time จาก API)
const bannerClass = computed(() => {
  // วิกฤต = ล้นตลิ่งจริง (situation_level >= 5) หรือ ไฟ extreme >= 5 จุด
  if (dangerStations.value.length > 0 || extremeFires.value.length >= 5) return 'danger'
  // เฝ้าระวัง = situation_level >= 2 หรือ มีไฟ high/extreme
  if (criticalStations.value.length > 0 || warningStations.value.length > 0 || hasHighFire.value) return 'warning'
  if (activeFires.value.length > 0) return 'warning'
  return 'safe'
})

const alertIcon = computed(() => {
  if (bannerClass.value === 'danger') return 'crisis_alert'
  if (bannerClass.value === 'warning') return 'warning'
  return 'verified_user'
})

const bannerBadge = computed(() => {
  if (bannerClass.value === 'danger') return 'วิกฤต'
  if (bannerClass.value === 'warning') return 'เฝ้าระวัง'
  return ''
})

const alertTitle = computed(() => {
  // วิกฤต — ล้นตลิ่ง + ไฟ extreme
  if (dangerStations.value.length && extremeFires.value.length) {
    return '🚨 แจ้งเตือนวิกฤต — น้ำล้นตลิ่ง + ไฟป่ารุนแรงมาก!'
  }
  // วิกฤต — ล้นตลิ่ง (situation_level >= 5)
  if (dangerStations.value.length) {
    return '🚨 แจ้งเตือนวิกฤต — ระดับน้ำล้นตลิ่ง! (ข้อมูล Real-time จาก ThaiWater)'
  }
  // ไฟ extreme >= 5 จุด
  if (extremeFires.value.length >= 5) {
    return '🔥 แจ้งเตือนวิกฤต — ไฟป่ารุนแรงมากหลายจุด!'
  }
  // เฝ้าระวัง — situation_level >= 3 (วิกฤตจาก API แต่ยังไม่ล้นตลิ่ง)
  if (criticalStations.value.length) {
    return '⚠️ เฝ้าระวังสูง — ระดับน้ำใกล้วิกฤต (ข้อมูล Real-time)'
  }
  // ไฟ extreme แต่ไม่ถึง 5 จุด
  if (extremeFires.value.length > 0) {
    return '🔥 เฝ้าระวังไฟป่า — ตรวจพบจุดไฟรุนแรงมาก'
  }
  if (hasHighFire.value) {
    return '🔥 เฝ้าระวังไฟป่า — ตรวจพบจุดไฟรุนแรง'
  }
  if (activeFires.value.length > 0) {
    return '🔥 ตรวจพบไฟไหม้ — กำลังติดตามสถานการณ์'
  }
  // เฝ้าระวัง — situation_level >= 2
  if (warningStations.value.length) {
    return '🟡 เฝ้าระวัง — ระดับน้ำสูงกว่าปกติ (ข้อมูล Real-time)'
  }

  return '✅ สถานการณ์ปกติ — ระดับน้ำอยู่ในเกณฑ์ปลอดภัย'
})

const alertText = computed(() => {
  const parts = []

  // ข้อมูลน้ำ — จาก ThaiWater API real-time
  if (dangerStations.value.length) {
    const names = dangerStations.value.slice(0, 3).map((s) => s.name).join(', ')
    parts.push(`สถานี ${names} ประดับน้ำสูงเกินตลิ่ง (situation_level=5 จาก ThaiWater API)`)
  } else if (criticalStations.value.length) {
    const names = criticalStations.value.slice(0, 3).map((s) => s.name).join(', ')
    parts.push(`สถานี ${names} ระดับน้ำวิกฤต (situation_level≥3 จาก ThaiWater API)`)
  } else if (warningStations.value.length) {
    const names = warningStations.value.slice(0, 3).map((s) => s.name).join(', ')
    parts.push(`สถานี ${names} มีระดับน้ำสูงกว่าเกณฑ์เฝ้าระวัง`)
  }

  // ข้อมูลไฟ — จาก NASA FIRMS
  if (activeFires.value.length > 0) {
    const fireNames = activeFires.value.slice(0, 2).map((f) => f.name).join(', ')
    const totalArea = activeFires.value.reduce((sum, f) => sum + f.areaSqKm, 0).toFixed(1)
    parts.push(`ตรวจพบไฟ ${activeFires.value.length} จุด (${fireNames}) พื้นที่รวม ${totalArea} ตร.กม.`)

    const topExtreme = extremeFires.value[0]
    if (topExtreme?.peakEstimate) {
      parts.push(`AI คาดการณ์ ${topExtreme.name} จะขยายถึง ${topExtreme.peakEstimate.areaSqKm} ตร.กม. ใน ${topExtreme.peakEstimate.timeHours} ชม.`)
    }
  }

  if (parts.length === 0) {
    return 'ระดับน้ำทุกสถานีอยู่ในเกณฑ์ปกติ ไม่พบจุดไฟไหม้ — ข้อมูล Real-time จาก ThaiWater API & NASA FIRMS'
  }

  return parts.join(' • ')
})
</script>
