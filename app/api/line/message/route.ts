import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { success: false, error: '予約IDを指定して予約通知APIを使用してください' },
    { status: 410 }
  )
}
