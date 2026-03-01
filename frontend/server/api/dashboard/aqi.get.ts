import { fetchAirQualityData } from '../../utils/airQuality'

export default defineEventHandler(async () => {
    return await fetchAirQualityData()
})
