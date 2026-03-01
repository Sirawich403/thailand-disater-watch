import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)

        // Basic validation
        if (!body.type || typeof body.lat !== 'number' || typeof body.lng !== 'number' || !body.description) {
            throw createError({ statusCode: 400, statusMessage: 'Bad Request: Missing required fields' })
        }

        const prisma = new PrismaClient()
        const report = await prisma.communityReport.create({
            data: {
                type: body.type,
                lat: body.lat,
                lng: body.lng,
                description: body.description,
                imageUrl: body.imageUrl || null,
                status: 'pending'
            }
        })

        return { success: true, report }
    } catch (error) {
        console.error('Error creating report:', error)
        if ((error as any).statusCode) throw error
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
})
