import { fetchWorldDisasters } from '../../utils/worldDisasters'

export default defineEventHandler(async () => {
    return await fetchWorldDisasters()
})
