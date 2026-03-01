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
            // Return empty instead of 500 so the page still renders
            return { reports: [] }
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
        console.error('Error fetching reports:', error)
        // Return empty instead of throwing so the page still renders
        return { reports: [] }
    }
})
