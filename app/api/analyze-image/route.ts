import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { imagePath, question } = await request.json()

    if (!imagePath || !question) {
      return NextResponse.json(
        { error: 'imagePath and question are required' },
        { status: 400 }
      )
    }

    // Read image file and convert to base64
    const imageBuffer = await readFile(imagePath)
    const base64Image = imageBuffer.toString('base64')
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'

    // Create ZAI instance
    const zai = await ZAI.create()

    // Analyze image
    const response = await zai.chat.completions.createVision({
      model: 'qwen-vl-max',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: question
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    })

    const analysis = response.choices[0]?.message?.content

    return NextResponse.json({
      success: true,
      analysis
    })
  } catch (error: any) {
    console.error('Error analyzing image:', error)
    return NextResponse.json(
      { error: 'Failed to analyze image', details: error?.message },
      { status: 500 }
    )
  }
}
