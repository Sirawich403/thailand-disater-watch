/**
 * Air Quality Data — AQICN (World Air Quality Index)
 * Fetches PM2.5 / AQI data for Thailand stations
 */

const AQI_CACHE: Record<string, { data: any, ts: number }> = {}
const AQI_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// Major cities/stations in Thailand to query
const THAI_AQI_CITIES = [
    { name: 'กรุงเทพ', nameEn: 'Bangkok', query: 'bangkok' },
    { name: 'เชียงใหม่', nameEn: 'Chiang Mai', query: 'chiang-mai' },
    { name: 'เชียงราย', nameEn: 'Chiang Rai', query: 'chiang-rai' },
    { name: 'ลำปาง', nameEn: 'Lampang', query: 'lampang' },
    { name: 'แม่ฮ่องสอน', nameEn: 'Mae Hong Son', query: 'mae-hong-son' },
    { name: 'ขอนแก่น', nameEn: 'Khon Kaen', query: 'khon-kaen' },
    { name: 'นครราชสีมา', nameEn: 'Nakhon Ratchasima', query: 'nakhon-ratchasima' },
    { name: 'สงขลา', nameEn: 'Songkhla', query: 'songkhla' },
    { name: 'ภูเก็ต', nameEn: 'Phuket', query: 'phuket' },
    { name: 'สุราษฎร์ธานี', nameEn: 'Surat Thani', query: 'surat-thani' },
    { name: 'อุดรธานี', nameEn: 'Udon Thani', query: 'udon-thani' },
    { name: 'นครสวรรค์', nameEn: 'Nakhon Sawan', query: 'nakhon-sawan' },
    { name: 'ระยอง', nameEn: 'Rayong', query: 'rayong' },
    { name: 'สระบุรี', nameEn: 'Saraburi', query: 'saraburi' },
    { name: 'ลำพูน', nameEn: 'Lamphun', query: 'lamphun' },
]

function getAqiLevel(aqi: number) {
    if (aqi <= 50) return { level: 'good', label: 'ดี', labelEn: 'Good', color: '#22c55e' }
    if (aqi <= 100) return { level: 'moderate', label: 'ปานกลาง', labelEn: 'Moderate', color: '#f59e0b' }
    if (aqi <= 150) return { level: 'unhealthy-sensitive', label: 'มีผลต่อกลุ่มเสี่ยง', labelEn: 'Unhealthy for Sensitive', color: '#f97316' }
    if (aqi <= 200) return { level: 'unhealthy', label: 'มีผลต่อสุขภาพ', labelEn: 'Unhealthy', color: '#ef4444' }
    if (aqi <= 300) return { level: 'very-unhealthy', label: 'อันตราย', labelEn: 'Very Unhealthy', color: '#a855f7' }
    return { level: 'hazardous', label: 'อันตรายมาก', labelEn: 'Hazardous', color: '#7f1d1d' }
}

export async function fetchAirQualityData() {
    const cacheKey = 'aqi-all'
    const cached = AQI_CACHE[cacheKey]
    if (cached && Date.now() - cached.ts < AQI_CACHE_TTL) return cached.data

    const config = useRuntimeConfig()
    const token = config.aqicnApiToken

    if (!token) {
        console.log('[AQI] No AQICN_API_TOKEN set, skipping')
        return { timestamp: new Date().toISOString(), source: 'unavailable', stations: [] }
    }

    const stations: any[] = []

    // Fetch in parallel with small batches
    const results = await Promise.allSettled(
        THAI_AQI_CITIES.map(async (city) => {
            try {
                const url = `https://api.waqi.info/feed/${city.query}/?token=${token}`
                const res: any = await $fetch(url, { timeout: 8000 })
                if (res?.status === 'ok' && res.data) {
                    const d = res.data
                    const aqi = d.aqi || 0
                    const aqiInfo = getAqiLevel(aqi)
                    return {
                        name: city.name,
                        nameEn: city.nameEn,
                        lat: d.city?.geo?.[0] || 0,
                        lng: d.city?.geo?.[1] || 0,
                        aqi,
                        pm25: d.iaqi?.pm25?.v || null,
                        pm10: d.iaqi?.pm10?.v || null,
                        o3: d.iaqi?.o3?.v || null,
                        temp: d.iaqi?.t?.v || null,
                        humidity: d.iaqi?.h?.v || null,
                        wind: d.iaqi?.w?.v || null,
                        ...aqiInfo,
                        dominantPol: d.dominentpol || 'pm25',
                        time: d.time?.s || '',
                    }
                }
                return null
            } catch {
                return null
            }
        })
    )

    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
            stations.push(r.value)
        }
    }

    const result = {
        timestamp: new Date().toISOString(),
        source: 'AQICN (World Air Quality Index)',
        dataDelay: 'Real-time — ข้อมูลคุณภาพอากาศจากสถานีตรวจวัดทั่วประเทศ',
        totalStations: stations.length,
        stations,
    }

    AQI_CACHE[cacheKey] = { data: result, ts: Date.now() }
    return result
}
