import { useSupabase } from '../../utils/supabase'

export default defineEventHandler(async () => {
    try {
        const supabase = useSupabase()
        const { data: reports, error } = await supabase
            .from('community_reports')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)

        if (error) {
            console.error('[Reports GET] Supabase error:', error.message)
            throw createError({ statusCode: 500, statusMessage: 'Database error' })
        }

        // Map snake_case to camelCase for frontend compatibility
        const mapped = (reports || []).map((r: any) => ({
            id: r.id,
            type: r.type,
            lat: r.lat,
            lng: r.lng,
            description: r.description,
            imageUrl: r.image_url,
            status: r.status,
            createdAt: r.created_at,
        }))

        return { reports: mapped }
    } catch (error: any) {
        if (error.statusCode) throw error
        console.error('Error fetching reports:', error)
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
})
