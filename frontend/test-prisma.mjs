import { PrismaClient } from '@prisma/client'

try {
    const p = new PrismaClient()
    console.log('Successfully instantiated PrismaClient in pure Node JS!')
    process.exit(0)
} catch (e) {
    console.error('FAILED TO INSTANTIATE PRISMA:', e)
    process.exit(1)
}
