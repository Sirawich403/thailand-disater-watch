// Real-time data fetching from NASA FIRMS and ThaiWater APIs

import { predictFireSpread, predictRainDirection } from './fireSpreadModel'

// ============================================
// OpenWeatherMap — Wind/Weather Data
// ============================================

const windCache: Record<string, { data: any, ts: number }> = {}
const WIND_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export async function fetchWindData(lat: number, lng: number) {
    const cacheKey = `${lat.toFixed(1)},${lng.toFixed(1)}`
    const cached = windCache[cacheKey]
    if (cached && Date.now() - cached.ts < WIND_CACHE_TTL) return cached.data

    const config = useRuntimeConfig()
    const apiKey = config.openweatherApiKey
    if (!apiKey) return { speed: 5, deg: 90, humidity: 60, temp: 30 } // defaults

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`
        const res: any = await $fetch(url, { timeout: 5000 })
        const wind = {
            speed: res.wind?.speed || 0,
            deg: res.wind?.deg || 0,
            humidity: res.main?.humidity || 50,
            temp: res.main?.temp || 25,
        }
        windCache[cacheKey] = { data: wind, ts: Date.now() }
        return wind
    } catch {
        return { speed: 5, deg: 90, humidity: 60, temp: 30 }
    }
}

// ============================================
// Cache layer (15 min TTL)
// ============================================
interface CacheEntry<T> {
    data: T
    timestamp: number
}

const cache: Record<string, CacheEntry<any>> = {}
const CACHE_TTL = 3 * 60 * 1000 // 3 minutes — tight enough for near real-time, loose enough to avoid rate limits

function getCached<T>(key: string): T | null {
    const entry = cache[key]
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return entry.data as T
    }
    return null
}

function setCache<T>(key: string, data: T): void {
    cache[key] = { data, timestamp: Date.now() }
}

// ============================================
// NASA FIRMS — Fire Hotspot Data
// ============================================

// Thailand bounding box (entire country)
const CM_BBOX = '97.3,5.6,105.7,20.5'

interface FirmsRecord {
    latitude: number
    longitude: number
    brightness: number
    scan: number
    track: number
    acq_date: string
    acq_time: string
    satellite: string
    confidence: string
    version: string
    bright_ti4: number
    bright_ti5: number
    frp: number
    daynight: string
}

function parseFirmsCsv(csv: string): FirmsRecord[] {
    const lines = csv.trim().split('\n')
    if (lines.length < 2) return []

    const headerLine = lines[0]!
    const headers = headerLine.split(',').map((h) => h.trim())
    const records: FirmsRecord[] = []

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!
        const values = line.split(',').map((v) => v.trim())
        if (values.length < headers.length) continue

        const record: any = {}
        headers.forEach((h, idx) => {
            const v = values[idx] || ''
            if (['latitude', 'longitude', 'brightness', 'scan', 'track', 'bright_ti4', 'bright_ti5', 'frp'].includes(h)) {
                record[h] = parseFloat(v) || 0
            } else {
                record[h] = v
            }
        })
        records.push(record as FirmsRecord)
    }

    return records
}

function brightnessToIntensity(brightness: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (brightness >= 400) return 'extreme'
    if (brightness >= 350) return 'high'
    if (brightness >= 310) return 'medium'
    return 'low'
}

function getIntensityLevel(intensity: string) {
    switch (intensity) {
        case 'extreme': return 4
        case 'high': return 3
        case 'medium': return 2
        case 'low': return 1
        default: return 0
    }
}

// Group nearby fire points into clusters
function clusterFires(records: FirmsRecord[], thresholdKm: number = 2): FirmsRecord[][] {
    const used = new Set<number>()
    const clusters: FirmsRecord[][] = []

    for (let i = 0; i < records.length; i++) {
        if (used.has(i)) continue
        const ri = records[i]!
        const cluster: FirmsRecord[] = [ri]
        used.add(i)

        for (let j = i + 1; j < records.length; j++) {
            if (used.has(j)) continue
            const rj = records[j]!
            const dist = haversineKm(ri.latitude, ri.longitude, rj.latitude, rj.longitude)
            if (dist <= thresholdKm) {
                cluster.push(rj)
                used.add(j)
            }
        }
        clusters.push(cluster)
    }
    return clusters
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Generate fire spread prediction (uses same model as before but with real data)
function generateFireSpreadPrediction(fire: any) {
    const predictions: any[] = []
    const hoursToPredict = [1, 2, 3, 6, 9, 12]

    const windFactor = Math.max(0.5, (fire.windSpeed || 15) / 15)
    const humidityFactor = Math.max(0.3, (100 - (fire.humidity || 30)) / 70)
    const vegFactor = fire.vegetationFactor || 1.0
    const baseSpreadRate = 0.15 * windFactor * humidityFactor * vegFactor

    let currentArea = fire.areaSqKm || 0.5

    for (const h of hoursToPredict) {
        const decayFactor = Math.exp(-0.05 * h)
        const spreadRate = baseSpreadRate * decayFactor
        const prevIdx = hoursToPredict.indexOf(h)
        const prevH = prevIdx > 0 ? (hoursToPredict[prevIdx - 1] ?? 0) : 0
        currentArea += spreadRate * (h - prevH)
        currentArea += (Math.random() - 0.3) * 0.05

        const radiusKm = Math.sqrt(Math.max(0.01, currentArea) / Math.PI)
        const confidence = Math.max(40, 95 - h * 4.5)

        predictions.push({
            hoursFromNow: h,
            estimatedAreaSqKm: Math.round(currentArea * 100) / 100,
            estimatedRadiusKm: Math.round(radiusKm * 100) / 100,
            spreadRate: Math.round(spreadRate * 100) / 100,
            spreadDirectionDeg: (fire.windDirectionDeg || 0) + (Math.random() - 0.5) * 30,
            spreadDirection: fire.windDirection || 'N/A',
            confidence: Math.round(confidence * 10) / 10,
        })
    }
    return predictions
}

// Regional bounding boxes for global top-20 fire sampling
// (much smaller than world/1 — each returns quickly)
const WORLD_REGIONS: { name: string; bbox: string }[] = [
    { name: 'SE_Asia', bbox: '90,0,130,25' },      // SE Asia + India
    { name: 'S_America', bbox: '-80,-35,-35,5' },     // Amazon / S America
    { name: 'C_Africa', bbox: '10,-15,40,15' },      // Central Africa
    { name: 'S_Europe', bbox: '-10,35,45,50' },      // Southern Europe / Mediterranean
    { name: 'Australia', bbox: '110,-45,155,-10' },   // Australia
]

export async function fetchRealFireData() {
    const cached = getCached<any>('fires')
    if (cached) return cached

    const config = useRuntimeConfig()
    const firmsKey = config.firmsMapKey

    if (!firmsKey) {
        console.log('[FIRMS] No API key set, using mock data. Set FIRMS_MAP_KEY env var.')
        return getFireSummary()
    }

    try {
        console.log('[FIRMS] Starting fire data fetch...')
        const startTime = Date.now()

        // 1) Fetch Thailand fires (primary) — this is the most important
        const thaiUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${CM_BBOX}/1`

        // 2) Fetch only 2 key world regions (instead of 5) to save time
        const keyRegions = WORLD_REGIONS.slice(0, 2) // SE_Asia + S_America
        const regionUrls = keyRegions.map(r =>
            `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${r.bbox}/1`
        )

        const [thaiResponse, ...regionResponses] = await Promise.all([
            $fetch<string>(thaiUrl, { responseType: 'text', timeout: 6000 }).catch((e) => {
                console.error('[FIRMS] Thai fetch failed:', e?.message || e)
                return ''
            }),
            ...regionUrls.map((url, i) =>
                $fetch<string>(url, { responseType: 'text', timeout: 6000 }).catch((e) => {
                    console.error(`[FIRMS] Region ${keyRegions[i]?.name} failed:`, e?.message || e)
                    return ''
                })
            ),
        ])

        console.log(`[FIRMS] API calls completed in ${Date.now() - startTime}ms`)

        const thaiRecordsRaw = parseFirmsCsv(thaiResponse)

        // ★ Filter: only keep real fires (not thermal anomalies / agricultural burns)
        const filterRealFires = (records: FirmsRecord[]) =>
            records.filter(r =>
                (r.confidence === 'nominal' || r.confidence === 'n' || r.confidence === 'high' || r.confidence === 'h')
                && (r.frp || 0) >= 2
            )

        let thaiRecords = filterRealFires(thaiRecordsRaw)
        console.log(`[FIRMS] Thailand raw: ${thaiRecordsRaw.length}, after filter: ${thaiRecords.length}`)

        // ★ Limit to top 100 by FRP to keep clustering fast (O(n²) is expensive)
        thaiRecords.sort((a, b) => (b.frp || 0) - (a.frp || 0))
        thaiRecords = thaiRecords.slice(0, 100)

        // Merge regional records
        let worldRecords: FirmsRecord[] = []
        regionResponses.forEach((csv, i) => {
            const records = filterRealFires(parseFirmsCsv(csv))
            console.log(`[FIRMS] Region ${keyRegions[i]?.name}: ${records.length} real fires`)
            worldRecords.push(...records)
        })

        // Filter out records that fall inside the Thai bbox
        worldRecords = worldRecords.filter(r =>
            !(r.latitude >= 5.6 && r.latitude <= 20.5 && r.longitude >= 97.3 && r.longitude <= 105.7)
        )

        // Sort by FRP and keep top 60 for clustering
        worldRecords.sort((a, b) => (b.frp || 0) - (a.frp || 0))
        worldRecords = worldRecords.slice(0, 60)

        console.log(`[FIRMS] After limit — Thai: ${thaiRecords.length}, World: ${worldRecords.length}`)

        // Process records into fire clusters (5km threshold for grouping)
        const processRecords = (records: FirmsRecord[], prefix: string = 'F') => {
            if (records.length === 0) return []
            const clusters = clusterFires(records, 5)
            return clusters.map((cluster, idx) => {
                const lat = cluster.reduce((s, r) => s + r.latitude, 0) / cluster.length
                const lng = cluster.reduce((s, r) => s + r.longitude, 0) / cluster.length
                const maxBrightness = Math.max(...cluster.map(r => r.bright_ti4 || r.brightness))
                const totalFrp = cluster.reduce((s, r) => s + (r.frp || 0), 0)
                const areaSqKm = Math.round(cluster.length * 0.14 * 100) / 100
                const detTimes = cluster.map((r) => {
                    const timeStr = r.acq_time.padStart(4, '0')
                    return `${r.acq_date}T${timeStr.slice(0, 2)}:${timeStr.slice(2)}:00Z`
                })
                const earliest = detTimes.sort()[0] || new Date().toISOString()
                const intensity = brightnessToIntensity(maxBrightness)

                const fire: any = {
                    id: `${prefix}${(idx + 1).toString().padStart(3, '0')}`,
                    name: `จุดไฟ #${idx + 1} (${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E)`,
                    nameEn: `Fire Cluster #${idx + 1}`,
                    lat, lng,
                    detectedAt: earliest,
                    intensity, areaSqKm,
                    windSpeed: 15, windDirection: 'ไม่ทราบ', windDirectionDeg: 0,
                    humidity: 30, temperature: 35,
                    vegetationType: 'ไม่ระบุ', vegetationFactor: 1.0,
                    status: 'active' as const,
                    brightness: maxBrightness,
                    frp: Math.round(totalFrp * 10) / 10,
                    pixelCount: cluster.length,
                    confidence: cluster[0]?.confidence || 'nominal',
                    satellite: cluster[0]?.satellite || 'VIIRS SNPP',
                    source: 'NASA FIRMS',
                }

                const hoursActive = Math.round((Date.now() - new Date(earliest).getTime()) / 3600000 * 10) / 10
                const predictions = generateFireSpreadPrediction(fire)
                const peakPrediction = predictions[predictions.length - 1]

                return {
                    ...fire,
                    hoursActive,
                    predictions,
                    peakEstimate: {
                        areaSqKm: peakPrediction.estimatedAreaSqKm,
                        radiusKm: peakPrediction.estimatedRadiusKm,
                        timeHours: peakPrediction.hoursFromNow,
                    },
                    intensityLevel: getIntensityLevel(intensity),
                }
            }).sort((a, b) => b.intensityLevel - a.intensityLevel)
        }

        const thaiFires = processRecords(thaiRecords, 'F')
        const allWorldClusters = processRecords(worldRecords, 'W')
        const worldFires = allWorldClusters.slice(0, 20)

        console.log(`[FIRMS] Clusters — Thai: ${thaiFires.length}, World: ${worldFires.length}`)

        // Spread predictions — top 3 fires only, parallel wind data (to stay within Vercel timeout)
        const predictionFires = thaiFires.length > 0 ? thaiFires.slice(0, 3) : worldFires.slice(0, 3)
        console.log(`[FIRMS] Computing spread predictions for ${predictionFires.length} fires...`)

        const spreadPredictions: any[] = []
        try {
            const windResults = await Promise.all(
                predictionFires.map(fire => fetchWindData(fire.lat, fire.lng).catch(() => null))
            )
            predictionFires.forEach((fire, i) => {
                const wind = windResults[i]
                if (wind) {
                    const pred = predictFireSpread(fire, fire.id, wind)
                    spreadPredictions.push(pred)
                }
            })
        } catch (e) {
            console.error('[FIRMS] Spread predictions failed:', e)
        }

        console.log(`[FIRMS] Total time: ${Date.now() - startTime}ms, predictions: ${spreadPredictions.length}`)

        const activeCount = thaiFires.length
        const maxIntensity = Math.max(...thaiFires.map((f) => f.intensityLevel), 0)
        const overallFireRisk = maxIntensity >= 4 ? 'extreme' : maxIntensity >= 3 ? 'high' : maxIntensity >= 2 ? 'medium' : 'low'

        const result = {
            timestamp: new Date().toISOString(),
            source: 'NASA FIRMS (VIIRS SNPP)',
            dataDelay: 'Near Real-Time (NRT) — ข้อมูลจากดาวเทียม ล่าช้าประมาณ 2–3 ชั่วโมง',
            dataRange: 'ย้อนหลัง 24 ชั่วโมง',
            activeCount,
            totalCount: thaiFires.length,
            worldCount: worldFires.length,
            overallFireRisk,
            fires: thaiFires,
            worldFires,
            spreadPredictions,
        }

        setCache('fires', result)
        return result
    } catch (error: any) {
        console.error('[FIRMS] API error, falling back to mock:', error.message)
        return getFireSummary()
    }
}

// ============================================
// ThaiWater — Rainfall Data
// ============================================

const THAIWATER_RAIN_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'

export async function fetchRealRainData() {
    const cached = getCached<any>('rain')
    if (cached) return cached

    try {
        const response: any = await $fetch(THAIWATER_RAIN_URL, { timeout: 15000 })
        const allStations = response?.data || response?.rain_data?.data || []

        const rainStations = allStations
            .filter((s: any) => s.station?.tele_station_lat && s.rain_24h != null && parseFloat(s.rain_24h) >= 1)
            .map((s: any) => ({
                lat: s.station.tele_station_lat,
                lng: s.station.tele_station_long,
                name: s.station.tele_station_name?.th || 'สถานี',
                province: s.geocode?.province_name?.th || '',
                amphoe: s.geocode?.amphoe_name?.th || '',
                rain24h: parseFloat(s.rain_24h) || 0,
                rain1h: parseFloat(s.rain_1h) || 0,
                rainToday: parseFloat(s.rain_today) || 0,
                datetime: s.rainfall_datetime || '',
                intensity: parseFloat(s.rain_24h) >= 90 ? 'extreme'
                    : parseFloat(s.rain_24h) >= 35 ? 'heavy'
                        : parseFloat(s.rain_24h) >= 10 ? 'moderate'
                            : 'light',
            }))
            .sort((a: any, b: any) => b.rain24h - a.rain24h)
            .slice(0, 50)

        // Compute rain direction predictions for top 10 stations only (to stay within Vercel timeout)
        const topRainStations = rainStations.slice(0, 10)
        console.log(`[Rain] Computing direction predictions for ${topRainStations.length}/${rainStations.length} stations...`)
        for (const station of topRainStations) {
            try {
                const wind = await fetchWindData(station.lat, station.lng)
                const pred = predictRainDirection(station.lat, station.lng, station.rain24h, wind)
                station.windSpeed = wind.speed
                station.windDeg = wind.deg
                station.rainDirection = pred.directionLabel
                station.rainDirectionDeg = pred.directionDeg
                station.predictedPath = pred.predictedPath
            } catch (e) { /* skip */ }
        }

        const result = {
            timestamp: new Date().toISOString(),
            source: 'ThaiWater API (HII)',
            dataDelay: 'Real-time — ข้อมูลสดจากสถานีวัดฝนทั่วประเทศ',
            totalStations: rainStations.length,
            rainStations,
        }

        setCache('rain', result)
        return result
    } catch (error: any) {
        console.error('[ThaiWater Rain] API error:', error.message)
        return { timestamp: new Date().toISOString(), source: 'unavailable', totalStations: 0, rainStations: [] }
    }
}

// ============================================
// ThaiWater — Water Level Data
// ============================================

const THAIWATER_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load'

// ThaiWater situation_level mapping
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mapSituationLevel(level: number): string {
    // 1=ปกติ, 2=เฝ้าระวัง, 3=วิกฤต, 4=ปลอดภัย(others), 5=ล้นตลิ่ง
    if (level >= 5) return 'danger'
    if (level >= 3) return 'warning'
    return 'safe'
}

export async function fetchRealWaterData() {
    const cached = getCached<any>('water')
    if (cached) return cached

    try {
        const response: any = await $fetch(THAIWATER_URL, { timeout: 15000 })
        const allStations = response?.waterlevel_data?.data || []

        // Use all stations nationwide — take the most critical ones
        // Sort by situation level (most critical first)
        const sortedStations = allStations
            .filter((s: any) => s.station?.tele_station_lat && s.waterlevel_msl)
            .sort((a: any, b: any) => (b.situation_level || 0) - (a.situation_level || 0))

        if (sortedStations.length === 0) {
            console.log('[ThaiWater] No stations found in response, using mock data')
            return getDashboardSummary()
        }

        // Take top 50 most critical stations
        const topStations = sortedStations.slice(0, 50)

        const stations = topStations.map((s: any, idx: number) => {
            const station = s.station || {}
            const geocode = s.geocode || {}
            const currentLevel = parseFloat(s.waterlevel_msl) || 0
            const prevLevel = parseFloat(s.waterlevel_msl_previous) || currentLevel
            const trend = Math.round((currentLevel - prevLevel) * 100) / 100

            // Determine type based on position (upstream/midstream/downstream by latitude)
            const lat = station.tele_station_lat || 18.78
            let type = 'midstream'
            let typeLabel = 'กลางน้ำ'
            if (lat > 18.9) { type = 'upstream'; typeLabel = 'ต้นน้ำ' }
            else if (lat < 18.7) { type = 'downstream'; typeLabel = 'ปลายน้ำ' }

            // ใช้ situation_level จาก ThaiWater API โดยตรง (Real-time เท่านั้น)
            // 1=ปกติ, 2=เฝ้าระวัง, 3=วิกฤต, 4=ปลอดภัย(others), 5=ล้นตลิ่ง
            const situationLevel = s.situation_level || 0

            const minBank = station.min_bank || 999

            let riskLevel = 'safe'
            if (situationLevel >= 5) riskLevel = 'danger'       // ล้นตลิ่ง — วิกฤตจริง
            else if (situationLevel >= 3) riskLevel = 'critical' // วิกฤต — เฝ้าระวังสูง
            else if (situationLevel >= 2) riskLevel = 'warning'  // เฝ้าระวัง
            // ไม่ใช้ threshold ที่ประมาณเอง — ใช้เฉพาะข้อมูล real-time จาก API

            const flowTimeToDownstream = type === 'upstream' ? 6 : type === 'midstream' ? 3 : 0

            return {
                id: `S${(idx + 1).toString().padStart(3, '0')}`,
                name: station.tele_station_name?.th || `สถานี ${station.tele_station_oldcode || idx + 1}`,
                nameEn: station.tele_station_name?.en || station.tele_station_oldcode || `Station ${idx + 1}`,
                type,
                typeLabel,
                lat: station.tele_station_lat || 18.78,
                lng: station.tele_station_long || 98.99,
                elevation: 0,
                description: `${geocode.amphoe_name?.th || ''} ${geocode.province_name?.th || 'เชียงใหม่'}`,
                thresholds: { warning: minBank * 0.8, critical: minBank * 0.95 },
                currentLevel,
                situationLevel,
                trend,
                trendDirection: trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'stable',
                rainfall: {
                    current: 0,
                    accumulated24h: 0,
                },
                riskLevel,
                peakPredicted: currentLevel + (trend > 0 ? trend * 6 : 0),
                flowTimeToDownstream,
                source: 'ThaiWater API',
                stationCode: station.tele_station_oldcode || '',
                agencyName: s.agency?.agency_shortname?.th || '',
                riverName: s.river_name || '',
                lastUpdate: s.waterlevel_datetime || '',
                bankLevel: minBank,
                diffFromBank: s.diff_wl_bank || '',
                diffText: s.diff_wl_bank_text || '',
                storagePercent: parseFloat(s.storage_percent) || 0,
            }
        })

        // Overall risk — ใช้เฉพาะ situation_level จาก API เท่านั้น
        const dangerCount = stations.filter((s: any) => s.riskLevel === 'danger').length
        const criticalCount = stations.filter((s: any) => s.riskLevel === 'critical').length
        const warningCount = stations.filter((s: any) => s.riskLevel === 'warning').length
        console.log(`[ThaiWater] Risk summary — danger(ล้นตลิ่ง): ${dangerCount}, critical(วิกฤต): ${criticalCount}, warning(เฝ้าระวัง): ${warningCount}, total: ${stations.length}`)

        // วิกฤตจริง = มีสถานีที่ situation_level >= 5 (ล้นตลิ่ง) เท่านั้น
        const overallRisk = dangerCount > 0
            ? 'danger'
            : (criticalCount > 0 || warningCount > 0)
                ? 'warning'
                : 'safe'

        const result = {
            timestamp: new Date().toISOString(),
            source: 'ThaiWater API (HII/RID)',
            dataDelay: 'Real-time — ข้อมูลสดจากเซ็นเซอร์วัดระดับน้ำทั่วประเทศ',
            overallRisk,
            stations,
        }

        setCache('water', result)
        return result
    } catch (error: any) {
        console.error('[ThaiWater] API error, falling back to mock:', error.message)
        return getDashboardSummary()
    }
}
