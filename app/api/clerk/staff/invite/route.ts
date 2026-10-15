// app/api/clerk/staff/invite/route.ts
// スタッフ招待API - Clerk Core 2を使用してスタッフ招待を実行

import { clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { BASE_URL } from '@/lib/constants'
import { Role } from '@/convex/types'
import { z } from 'zod'
import { validateRequest, createValidationErrorResponse } from '@/lib/api/validation'
import { inviteStaffSchema } from '@/lib/validations/api/staff'
import {
  getStaffManagementClient,
  requireStaffManagement,
  staffManagementErrorResponse,
} from '@/lib/auth/staff-management'


// Extend the inviteStaffSchema for full request
const inviteStaffRequestSchema = inviteStaffSchema.extend({
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
  instagram_link: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  featured_hair_images: z.array(z.object({
    original_url: z.string().url(),
    thumbnail_url: z.string().url().optional(),
  })).optional(),
})

// Next.js App Router設定
export const runtime = 'nodejs' // Edge Runtimeではなく、Node.js Runtimeを使用
export const maxDuration = 30 // タイムアウトを30秒に設定

export async function POST(req: NextRequest) {
  console.log('▶️ 招待APIが呼び出されました')
  
  try {
    // 1. 認証チェック - 現在のユーザーが認証されているか確認
    console.log('🔐 認証チェック中...')
    const { convex, userId } = await getStaffManagementClient()
    console.log('👤 ユーザーID:', userId)
    
    if (!userId) {
      console.log('❌ 認証失敗')
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    // 2. リクエストボディの検証
    console.log('💬 リクエストボディを解析中...')
    const validation = await validateRequest(req, inviteStaffRequestSchema)
    if (!validation.success) {
      console.log('❌ バリデーションエラー:', validation.error)
      return createValidationErrorResponse(validation.error)
    }

    const { 
      email,
      tenant_id,
      org_id,
      name,
      description,
      images,
      is_active,
      age,
      gender,
      instagram_link,
      tags,
      role,
      featured_hair_images,
      extra_charge,
      priority,
    } = validation.data
    await requireStaffManagement(convex, tenant_id as Id<'tenant'>, org_id as Id<'organization'>)


    // 5. Convexに招待レコード作成（clerk_user_id = null）
    // 注: メール重複チェックはフロントエンドで事前に実施済み
    // スタッフとstaff_configレコードを作成
    console.log('📝 Convexにスタッフレコード作成中...')
    const result = await convex.mutation(api.staff.invitation.mutation.createWithInvitation, {
      tenant_id: tenant_id as Id<"tenant">,
      org_id: org_id as Id<"organization">,
      email,
      name,
      description,
      images: images || [],
      is_active: is_active ?? true,
      age,
      gender,
      instagram_link,
      tags: tags || [],
      role,
      featured_hair_images: featured_hair_images?.map(img => ({
        original_url: img.original_url,
        thumbnail_url: img.thumbnail_url || ''
      })),
      extra_charge,
      priority,
    })

    console.log('✅ Convexスタッフレコード作成成功:', result.staffId)

    // 7. Clerk招待送信（publicMetadataにstaff_idと全ての必要な情報を含める）
    console.log('🏢 Clerk Clientの有無:', !!clerkClient)
    
    const invitationParams = {
      emailAddress: email,
      redirectUrl: `${BASE_URL}/staff/invite-accept?staff_id=${result.staffId}`,
      publicMetadata: {
        tenant_id,
        org_id,
        role,
        staff_id: result.staffId,
        invited_by: userId,
        invited_at: new Date().toISOString()
      },
      notify: true, // 招待メールを送信するかどうか
      ignoreExisting: true // 既存の招待を無視するかどうか
    }
    
    console.log('🚀 招待パラメータ:', invitationParams)
    console.log('📧 招待作成を実行中...')
    
    const clerk = await clerkClient()
    let invitation
    try {
      // このスタッフの既存の招待IDをチェック
      const existingStaffData = await convex.query(api.staff.invitation.query.getStaffWithInvitation, {
        staff_id: result.staffId as Id<"staff">,
      })
      
      if (existingStaffData?.invitation_id && existingStaffData.invitationStatus === 'pending') {
        console.log('⚠️ このスタッフの既存の招待が見つかりました:', {
          staffId: result.staffId,
          existingInvitationId: existingStaffData.invitation_id,
          email: existingStaffData.invitation_email,
        })
        
        // 既存の招待を取り消す
        try {
          await clerk.invitations.revokeInvitation(existingStaffData.invitation_id)
          console.log('✅ 既存の招待を取り消しました:', existingStaffData.invitation_id)
        } catch (revokeError) {
          console.error('❌ 既存招待の取り消しエラー:', revokeError)
          // エラーコードを確認してrevoked_invitation以外の場合は処理を中断
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorCode = (revokeError as any)?.errors?.[0]?.code
          console.log('🔍 エラーコード:', errorCode)
          
          if (errorCode && errorCode !== 'revoked_invitation') {
            // revoked_invitation（既に取り消し済み）以外のエラーの場合は処理を中断
            throw revokeError
          }
          console.log('ℹ️ 招待は既に取り消し済みです。処理を続行します。')
        }
      }
      
      invitation = await clerk.invitations.createInvitation(invitationParams)
      console.log('✅ Clerk招待作成成功:', {
        newInvitationId: invitation.id,
        email: invitation.emailAddress,
        previousInvitationId: existingStaffData?.invitation_id,
      })
      
      // Convexに招待情報を保存
      await convex.mutation(api.staff.mutation.updateInvitationInfo, {
        staff_id: result.staffId as Id<"staff">,
        invitation_id: invitation.id,
        invitation_email: email,
        invitation_status: 'pending' as const,
        role: role as Role,
      })
      console.log('✅ Convex招待情報更新成功')
    } catch (clerkError) {
      // Clerk招待作成失敗時のrollback処理
      console.error('❌ Clerk招待作成失敗、Convexレコードをキャンセル中...')
      await convex.mutation(api.staff.invitation.mutation.cancelInvitation, {
        staff_id: result.staffId as Id<"staff">,
      })
      throw clerkError
    }

    // 8. 成功レスポンスを返す
    return NextResponse.json({
      success: true,
      invitation_id: invitation.id,
      staff_id: result.staffId,
      message: '招待メールを送信しました',
    })

  } catch (error: unknown) {
    const authorizationError = staffManagementErrorResponse(error)
    if (authorizationError) return authorizationError
    // 9. エラーハンドリング
    console.error('🚨 招待作成エラー:', error)
    console.error('🐞 エラーの詳細:', JSON.stringify(error, null, 2))
    
    // エラータイプを詳細に分析
    if (error instanceof Error) {
      console.error('📄 エラーメッセージ:', error.message)
      console.error('📋 エラースタック:', error.stack)
    }
    
    // Clerkのエラーレスポンスを解析
    if (error && typeof error === 'object' && 'errors' in error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerkErrors = error.errors as any[]
      if (clerkErrors?.[0]?.code === 'form_identifier_exists') {
        return NextResponse.json(
          { error: 'このメールアドレスは既にClerkに登録されています' },
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json(
      { error: '招待の作成に失敗しました' },
      { status: 500 }
    )
  }
}