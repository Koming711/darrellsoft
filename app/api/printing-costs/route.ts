import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getServerUser, getDataFilter, requireAuth } from '@/lib/server-auth'

export async function GET(request: NextRequest) {
  try {
    const user = getServerUser(request)
    const printingCosts = await db.printingCost.findMany({
      where: await getDataFilter(user),
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(printingCosts, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error) {
    console.error('Error fetching printing costs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch printing costs' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authErr = requireAuth(request)
    if (authErr) return authErr
    const user = getServerUser(request)!
    const body = await request.json()
    const {
      machineName,
      grammage,
      printAreaWidth,
      printAreaHeight,
      pricePerColor,
      specialColorPrice,
      minimumPrintQuantity,
      priceAboveMinimumPerSheet,
      platePricePerSheet
    } = body

    if (!machineName || !printAreaWidth || !printAreaHeight ||
        !pricePerColor || !specialColorPrice || !minimumPrintQuantity ||
        !priceAboveMinimumPerSheet || !platePricePerSheet) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    const printingCost = await db.printingCost.create({
      data: {
        machineName,
        grammage: grammage ? parseInt(grammage) : 0,
        printAreaWidth: parseFloat(printAreaWidth),
        printAreaHeight: parseFloat(printAreaHeight),
        pricePerColor: parseFloat(pricePerColor),
        specialColorPrice: parseFloat(specialColorPrice),
        minimumPrintQuantity: parseInt(minimumPrintQuantity),
        priceAboveMinimumPerSheet: parseFloat(priceAboveMinimumPerSheet),
        platePricePerSheet: parseFloat(platePricePerSheet),
        userId: user?.id || null,
      }
    })

    return NextResponse.json(printingCost, { status: 201 })
  } catch (error) {
    console.error('Error creating printing cost:', error)
    return NextResponse.json(
      { error: 'Failed to create printing cost' },
      { status: 500 }
    )
  }
}
