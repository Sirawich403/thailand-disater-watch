// World Disasters — ReliefWeb API + EONET (NASA) with fallback data

interface CacheEntry<T> {
    data: T
    timestamp: number
}

let worldDisasterCache: CacheEntry<any> | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Disaster type to emoji mapping
function getDisasterEmoji(type: string): string {
    const lower = type.toLowerCase()
    if (lower.includes('flood')) return '🌊'
    if (lower.includes('earthquake') || lower.includes('seismic')) return '🏚️'
    if (lower.includes('volcano') || lower.includes('volcanic')) return '🌋'
    if (lower.includes('cyclone') || lower.includes('typhoon') || lower.includes('hurricane') || lower.includes('storm') || lower.includes('tropical') || lower.includes('severe')) return '🌀'
    if (lower.includes('fire') || lower.includes('wildfire')) return '🔥'
    if (lower.includes('drought')) return '☀️'
    if (lower.includes('tsunami')) return '🌊'
    if (lower.includes('landslide') || lower.includes('mudslide')) return '⛰️'
    if (lower.includes('epidemic') || lower.includes('pandemic')) return '🦠'
    if (lower.includes('cold') || lower.includes('snow') || lower.includes('winter')) return '❄️'
    if (lower.includes('heat') || lower.includes('heatwave')) return '🌡️'
    if (lower.includes('tornado')) return '🌪️'
    if (lower.includes('ice') || lower.includes('sea')) return '🧊'
    return '⚠️'
}

// Severity color mapping
function getSeverityInfo(status: string): { level: string; color: string; priority: number } {
    const lower = (status || '').toLowerCase()
    if (lower.includes('alert') || lower.includes('warning') || lower.includes('red') || lower.includes('extreme')) {
        return { level: 'high', color: '#dc2626', priority: 3 }
    }
    if (lower.includes('ongoing') || lower.includes('current') || lower.includes('orange') || lower.includes('active')) {
        return { level: 'medium', color: '#f59e0b', priority: 2 }
    }
    return { level: 'active', color: '#3b82f6', priority: 1 }
}

// Try NASA EONET API (free, no key)
async function tryEonet(): Promise<any[] | null> {
    try {
        const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?limit=20&status=open'
        const response: any = await $fetch(url, { timeout: 10000 })
        const events = response?.events || []
        if (events.length === 0) return null

        return events.map((event: any, idx: number) => {
            const cat = event.categories?.[0]?.title || 'Disaster'
            const geo = event.geometry?.[event.geometry.length - 1]
            const coords = geo?.coordinates || [0, 0]
            const severity = getSeverityInfo(event.closed ? 'past' : 'active')

            return {
                id: `WD${(idx + 1).toString().padStart(3, '0')}`,
                name: event.title || 'Unknown Event',
                type: cat,
                emoji: getDisasterEmoji(cat),
                country: '', // EONET doesn't give country
                countryIso: '',
                date: geo?.date || event.geometry?.[0]?.date || new Date().toISOString(),
                status: event.closed ? 'closed' : 'active',
                severity: severity.level,
                severityColor: severity.color,
                priority: severity.priority,
                url: event.link || '',
                lat: coords[1] || 0,
                lng: coords[0] || 0,
                description: `${cat} — Source: ${event.sources?.[0]?.id || 'NASA EONET'}`,
            }
        })
    } catch (e: any) {
        console.error('[WorldDisasters] EONET error:', e.message)
        return null
    }
}

// Try ReliefWeb API (POST method)
async function tryReliefWeb(): Promise<any[] | null> {
    try {
        const url = 'https://api.reliefweb.int/v1/disasters?appname=thailand-disaster-watch&profile=list&preset=latest&slim=1&limit=20'
        const response: any = await $fetch(url, { timeout: 10000 })
        const items = response?.data || []
        if (items.length === 0) return null

        return items.map((item: any, idx: number) => {
            const fields = item.fields || {}
            const types = fields.type || []
            const countries = fields.country || []
            const typeName = types[0]?.name || 'Disaster'
            const countryName = countries.map((c: any) => c.name).join(', ') || 'Unknown'
            const countryIso = countries[0]?.iso3 || ''
            const coords = getCountryCoords(countryIso)
            const severity = getSeverityInfo(fields.status || '')

            return {
                id: `WD${(idx + 1).toString().padStart(3, '0')}`,
                name: fields.name || 'Unknown Disaster',
                type: typeName,
                emoji: getDisasterEmoji(typeName),
                country: countryName,
                countryIso,
                date: fields.date?.created || new Date().toISOString(),
                status: fields.status || 'current',
                severity: severity.level,
                severityColor: severity.color,
                priority: severity.priority,
                url: fields.url || '',
                lat: coords.lat,
                lng: coords.lng,
                description: '',
            }
        })
    } catch (e: any) {
        console.error('[WorldDisasters] ReliefWeb error:', e.message)
        return null
    }
}

// Fallback: realistic world disaster data
function getFallbackDisasters(): any[] {
    const now = new Date()
    const disasters = [
        { name: 'Turkey - Syria Earthquake Aftermath', type: 'Earthquake', country: 'Turkey, Syria', iso: 'TUR', status: 'ongoing', sev: 'high' },
        { name: 'Cyclone Freddy - Madagascar, Mozambique', type: 'Tropical Cyclone', country: 'Madagascar, Mozambique', iso: 'MDG', status: 'alert', sev: 'high' },
        { name: 'Pakistan Floods Recovery', type: 'Flood', country: 'Pakistan', iso: 'PAK', status: 'ongoing', sev: 'medium' },
        { name: 'Drought in Horn of Africa', type: 'Drought', country: 'Ethiopia, Somalia, Kenya', iso: 'ETH', status: 'ongoing', sev: 'high' },
        { name: 'Wildfire Season - Canada', type: 'Wildfire', country: 'Canada', iso: 'CAN', status: 'active', sev: 'medium' },
        { name: 'Volcanic Activity - Kilauea, Hawaii', type: 'Volcano', country: 'United States', iso: 'USA', status: 'active', sev: 'medium' },
        { name: 'Flood Emergency - Bangladesh', type: 'Flood', country: 'Bangladesh', iso: 'BGD', status: 'ongoing', sev: 'high' },
        { name: 'Typhoon Season - Philippines', type: 'Tropical Cyclone', country: 'Philippines', iso: 'PHL', status: 'active', sev: 'medium' },
        { name: 'Earthquake - Indonesia (Sulawesi)', type: 'Earthquake', country: 'Indonesia', iso: 'IDN', status: 'alert', sev: 'high' },
        { name: 'Wildfire - Australia (New South Wales)', type: 'Wildfire', country: 'Australia', iso: 'AUS', status: 'active', sev: 'medium' },
        { name: 'Landslide - Colombia', type: 'Landslide', country: 'Colombia', iso: 'COL', status: 'ongoing', sev: 'medium' },
        { name: 'Flood - Myanmar (Rakhine State)', type: 'Flood', country: 'Myanmar', iso: 'MMR', status: 'ongoing', sev: 'medium' },
        { name: 'Heatwave - India (Rajasthan)', type: 'Heatwave', country: 'India', iso: 'IND', status: 'active', sev: 'medium' },
        { name: 'Volcanic Eruption - Iceland (Sundhnúkur)', type: 'Volcano', country: 'Iceland', iso: 'ISL', status: 'active', sev: 'medium' },
        { name: 'Earthquake - Japan (Noto Peninsula)', type: 'Earthquake', country: 'Japan', iso: 'JPN', status: 'ongoing', sev: 'high' },
        { name: 'Flood - Brazil (Rio Grande do Sul)', type: 'Flood', country: 'Brazil', iso: 'BRA', status: 'ongoing', sev: 'high' },
        { name: 'Severe Storm - United States (Texas)', type: 'Severe Storm', country: 'United States', iso: 'USA', status: 'active', sev: 'medium' },
        { name: 'Drought - Southern Africa', type: 'Drought', country: 'Zimbabwe, Zambia', iso: 'ZWE', status: 'ongoing', sev: 'medium' },
        { name: 'Flood - Nigeria (Lagos)', type: 'Flood', country: 'Nigeria', iso: 'NGA', status: 'active', sev: 'medium' },
        { name: 'Volcanic Activity - Merapi, Indonesia', type: 'Volcano', country: 'Indonesia', iso: 'IDN', status: 'active', sev: 'medium' },
    ]

    return disasters.map((d, idx) => {
        const coords = getCountryCoords(d.iso)
        const severity = getSeverityInfo(d.sev)
        const daysAgo = Math.floor(Math.random() * 30) + 1
        const date = new Date(now.getTime() - daysAgo * 86400000)

        return {
            id: `WD${(idx + 1).toString().padStart(3, '0')}`,
            name: d.name,
            type: d.type,
            emoji: getDisasterEmoji(d.type),
            country: d.country,
            countryIso: d.iso,
            date: date.toISOString(),
            status: d.status,
            severity: severity.level,
            severityColor: severity.color,
            priority: severity.priority,
            url: '',
            lat: coords.lat + (Math.random() - 0.5) * 2,
            lng: coords.lng + (Math.random() - 0.5) * 2,
            description: `${d.type} event in ${d.country}`,
        }
    })
}

export async function fetchWorldDisasters() {
    // Check cache
    if (worldDisasterCache && Date.now() - worldDisasterCache.timestamp < CACHE_TTL) {
        return worldDisasterCache.data
    }

    let disasters: any[] | null = null
    let source = 'Fallback Data'

    // Try EONET first
    disasters = await tryEonet()
    if (disasters && disasters.length > 0) {
        source = 'NASA EONET'
        console.log(`[WorldDisasters] Fetched ${disasters.length} events from NASA EONET`)
    }

    // Try ReliefWeb next
    if (!disasters || disasters.length === 0) {
        disasters = await tryReliefWeb()
        if (disasters && disasters.length > 0) {
            source = 'ReliefWeb (UN OCHA)'
            console.log(`[WorldDisasters] Fetched ${disasters.length} events from ReliefWeb`)
        }
    }

    // Fallback to realistic mock data
    if (!disasters || disasters.length === 0) {
        console.log('[WorldDisasters] APIs unavailable, using fallback data')
        disasters = getFallbackDisasters()
        source = 'Fallback Data (APIs unavailable)'
    }

    // Sort by priority (highest first), then by date (newest first)
    disasters.sort((a: any, b: any) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return new Date(b.date).getTime() - new Date(a.date).getTime()
    })

    const result = {
        timestamp: new Date().toISOString(),
        source,
        totalCount: disasters.length,
        disasters: disasters.slice(0, 20),
    }

    worldDisasterCache = { data: result, timestamp: Date.now() }
    return result
}

// Approximate country center coordinates by ISO3 code
function getCountryCoords(iso3: string): { lat: number; lng: number } {
    const coords: Record<string, { lat: number; lng: number }> = {
        AFG: { lat: 33.93, lng: 67.71 }, AGO: { lat: -11.20, lng: 17.87 },
        ALB: { lat: 41.15, lng: 20.17 }, ARG: { lat: -38.42, lng: -63.62 },
        AUS: { lat: -25.27, lng: 133.78 }, BGD: { lat: 23.68, lng: 90.36 },
        BRA: { lat: -14.24, lng: -51.93 }, CAN: { lat: 56.13, lng: -106.35 },
        CHN: { lat: 35.86, lng: 104.20 }, COL: { lat: 4.57, lng: -74.30 },
        COD: { lat: -4.04, lng: 21.76 }, CUB: { lat: 21.52, lng: -77.78 },
        ECU: { lat: -1.83, lng: -78.18 }, EGY: { lat: 26.82, lng: 30.80 },
        ETH: { lat: 9.15, lng: 40.49 }, FRA: { lat: 46.23, lng: 2.21 },
        DEU: { lat: 51.17, lng: 10.45 }, GHA: { lat: 7.95, lng: -1.02 },
        GTM: { lat: 15.78, lng: -90.23 }, HTI: { lat: 18.97, lng: -72.29 },
        HND: { lat: 15.20, lng: -86.24 }, IDN: { lat: -0.79, lng: 113.92 },
        IND: { lat: 20.59, lng: 78.96 }, IRN: { lat: 32.43, lng: 53.69 },
        IRQ: { lat: 33.22, lng: 43.68 }, ISL: { lat: 64.96, lng: -19.02 },
        ITA: { lat: 41.87, lng: 12.57 }, JPN: { lat: 36.20, lng: 138.25 },
        KEN: { lat: -0.02, lng: 37.91 }, KOR: { lat: 35.91, lng: 127.77 },
        LAO: { lat: 19.86, lng: 102.50 }, LBN: { lat: 33.85, lng: 35.86 },
        LBY: { lat: 26.34, lng: 17.23 }, MDG: { lat: -18.77, lng: 46.87 },
        MEX: { lat: 23.63, lng: -102.55 }, MMR: { lat: 21.91, lng: 95.96 },
        MOZ: { lat: -18.67, lng: 35.53 }, MWI: { lat: -13.25, lng: 34.30 },
        NGA: { lat: 9.08, lng: 8.68 }, NPL: { lat: 28.39, lng: 84.12 },
        NZL: { lat: -40.90, lng: 174.89 }, PAK: { lat: 30.38, lng: 69.35 },
        PER: { lat: -9.19, lng: -75.02 }, PHL: { lat: 12.88, lng: 121.77 },
        PNG: { lat: -6.31, lng: 143.96 }, RUS: { lat: 61.52, lng: 105.32 },
        SDN: { lat: 12.86, lng: 30.22 }, SOM: { lat: 5.15, lng: 46.20 },
        SSD: { lat: 6.88, lng: 31.31 }, SYR: { lat: 34.80, lng: 39.00 },
        THA: { lat: 15.87, lng: 100.99 }, TUR: { lat: 38.96, lng: 35.24 },
        TZA: { lat: -6.37, lng: 34.89 }, UGA: { lat: 1.37, lng: 32.29 },
        UKR: { lat: 48.38, lng: 31.17 }, USA: { lat: 37.09, lng: -95.71 },
        VEN: { lat: 6.42, lng: -66.59 }, VNM: { lat: 14.06, lng: 108.28 },
        YEM: { lat: 15.55, lng: 48.52 }, ZAF: { lat: -30.56, lng: 22.94 },
        ZMB: { lat: -13.13, lng: 27.85 }, ZWE: { lat: -19.02, lng: 29.15 },
    }
    return coords[iso3] || { lat: 0, lng: 20 }
}
