import { useSupabase } from '../../utils/supabase'

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)

        // Basic validation
        if (!body.type || typeof body.lat !== 'number' || typeof body.lng !== 'number' || !body.description) {
            throw createError({ statusCode: 400, statusMessage: 'Bad Request: Missing required fields' })
        }

        const supabase = useSupabase()
        const { data: report, error } = await supabase
            .from('community_reports')
            .insert({
                type: body.type,
                lat: body.lat,
                lng: body.lng,
                description: body.description,
                image_url: body.imageUrl || null,
                status: 'pending',
            })
            .select()
            .single()

        if (error) {
            console.error('[Reports POST] Supabase error:', error.message)
            throw createError({ statusCode: 500, statusMessage: 'Database error' })
        }

        return {
            success: true,
            report: {
                id: report.id,
                type: report.type,
                lat: report.lat,
                lng: report.lng,
                description: report.description,
                imageUrl: report.image_url,
                status: report.status,
                createdAt: report.created_at,
            },
        }
    } catch (error: any) {
        if (error.statusCode) throw error
        console.error('Error creating report:', error)
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
})
