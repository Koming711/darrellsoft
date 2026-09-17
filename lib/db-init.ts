import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

let isInitialized = false

export async function initializeDatabase() {
  if (isInitialized) return
  try {
    await prisma.$connect()
    isInitialized = true
    console.log('✓ Database connected')
  } catch (error) {
    console.error('✗ Database connection error:', error)
  }
}

export default prisma
