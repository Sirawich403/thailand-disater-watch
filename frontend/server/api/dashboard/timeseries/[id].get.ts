// server/utils/mockData is auto-imported by Nitro
export default defineEventHandler((event) => {
    const stationId = getRouterParam(event, 'id')
    if (!stationId) {
        throw createError({ statusCode: 400, message: 'Station ID required' })
    }
    return getStationTimeseries(stationId)
})
