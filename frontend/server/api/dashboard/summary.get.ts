import { fetchRealWaterData } from '../../utils/realTimeData'

export default defineEventHandler(async () => {
    return await fetchRealWaterData()
})
