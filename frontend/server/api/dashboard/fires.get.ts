import { getFireSummary } from '../../utils/mockData'
import { predictFireSpread } from '../../utils/fireSpreadModel'

export default defineEventHandler(async () => {
    // Return mock data for now as requested
    const summary = getFireSummary()

    // Generate CA spread predictions for the map using mock fires
    const spreadPredictions = summary.fires.slice(0, 3).map((fire) => {
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
        worldCount: 0,
        worldFires: [],
        spreadPredictions
    }
})
