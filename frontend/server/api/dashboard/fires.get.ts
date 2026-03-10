import { getFireSummary } from '../../utils/mockData'
import { predictFireSpread } from '../../utils/fireSpreadModel'
import { fetchRealFireData } from '../../utils/realTimeData'

export default defineEventHandler(async () => {
    // Return mock data for Thai fires as requested
    const summary = getFireSummary()

    // Fetch real data to get the world fires
    const realData = await fetchRealFireData()

    // Generate CA spread predictions for the map using mock fires
    const spreadPredictions = summary.fires.slice(0, 3).map((fire: any) => {
        return predictFireSpread(
            {
                lat: fire.lat,
                lng: fire.lng,
                frp: fire.intensity === 'extreme' ? 100 : fire.intensity === 'high' ? 50 : 20,
                intensity: fire.intensity,
                intensityLevel: fire.intensityLevel
            },
            fire.id,
            {
                speed: fire.windSpeed,
                deg: fire.windDirectionDeg,
                humidity: fire.humidity,
                temp: fire.temperature
            }
        )
    })

    return {
        ...summary,
        worldCount: realData.worldCount || 0,
        worldFires: realData.worldFires || [],
        spreadPredictions
    }
})
