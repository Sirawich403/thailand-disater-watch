import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async () => {
    try {
        const prisma = new PrismaClient()
        const reports = await prisma.communityReport.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100 // Limit for prototype
        })
        return { reports }
    } catch (error) {
        console.error('Error fetching reports:', error)
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
})
