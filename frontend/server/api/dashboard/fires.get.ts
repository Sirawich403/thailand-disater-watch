import { fetchRealFireData } from '../../utils/realTimeData'

export default defineEventHandler(async () => {
    return await fetchRealFireData()
})
