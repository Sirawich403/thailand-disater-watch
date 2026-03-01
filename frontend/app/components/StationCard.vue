<template>
  <div class="station-card" :class="{ active: isActive }" @click="$emit('select', station.id)">
    <div class="station-indicator" :class="station.type">
      <span class="material-symbols-rounded">
        {{ station.type === 'upstream' ? 'landscape' : station.type === 'midstream' ? 'location_city' : 'water' }}
      </span>
    </div>
    <div class="station-info">
      <div class="station-name">{{ station.name }}</div>
      <div class="station-location">{{ station.typeLabel }} • สูง {{ station.elevation }}m</div>
    </div>
    <div class="station-data">
      <div class="station-level" :class="station.riskLevel">
        {{ station.currentLevel.toFixed(2) }}
      </div>
      <div class="station-unit">เมตร (m)</div>
      <div class="station-trend" :class="station.trendDirection">
        <span class="material-symbols-rounded" style="font-size: 14px">
          {{ station.trendDirection === 'up' ? 'trending_up' : station.trendDirection === 'down' ? 'trending_down' : 'trending_flat' }}
        </span>
        {{ station.trend > 0 ? '+' : '' }}{{ station.trend.toFixed(2) }}m
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  station: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>
