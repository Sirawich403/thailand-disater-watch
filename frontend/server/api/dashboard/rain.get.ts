import { fetchRealRainData } from '../../utils/realTimeData'

export default defineEventHandler(async () => {
    return await fetchRealRainData()
})
