// app/api/clerk/staff/invitations/route.ts
// 招待状況管理API - 招待の確認・再送・キャンセル機能

import { clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { BASE_URL } from '@/lib/constants'
import {
  getStaffManagementClient,
  requireStaffManagement,
  staffManagementErrorResponse,
} from '@/lib/auth/staff-management'


// 招待一覧取得（保留中のもののみ）
export async function GET(req: NextRequest) {
  try {
    // 1. 認証チェック
    const { convex } = await getStaffManagementClient()

    // 2. クエリパラメータからテナント・組織IDを取得（フィルタリング用）
    const { searchParams } = new URL(req.url)
    const tenant_id = searchParams.get('tenant_id')
    const org_id = searchParams.get('org_id')

    if (!tenant_id || !org_id) {
      return NextResponse.json(
        { error: 'tenant_idとorg_idが必要です' },
        { status: 400 }
      )
    }

    await requireStaffManagement(convex, tenant_id as Id<'tenant'>, org_id as Id<'organization'>)

    // 3. Convexから招待中スタッフ一覧を取得（招待情報も含まれている）
    const pendingStaff = await convex.query(api.staff.invitation.query.listPending, {
      tenant_id: tenant_id as Id<'tenant'>,
      org_id: org_id as Id<'organization'>,
    })

    // 4. レスポンスデータを整形（Clerk APIは不要）
    const mergedData = await Promise.all(
      pendingStaff.map(async (staff) => {
        // staff_configから追加情報を取得
        const staffConfig = await convex.query(api.staff.config.query.findByStaffId, {
          tenant_id: staff.tenant_id,
          org_id: staff.org_id,
          staff_id: staff._id,
        });

        return {
          // Convexデータ
          staff_id: staff._id,
          name: staff.name,
          email: staff.invitation_email || '',
          gender: staffConfig?.gender || 'unselected',
          age: staffConfig?.age,
          tags: staffConfig?.tags || [],
          created_at: staff._creationTime,
          
          // 招待データ（Convexから取得）
          invitation_id: staff.clerk_invitation_id || null,
          invitation_status: staff.invitation_status || 'pending',
          invitation_created_at: staff._creationTime, // 招待作成時刻として代用
          
          // メタデータ
          metadata: {
            tenant_id: staff.tenant_id,
            org_id: staff.org_id,
            role: staffConfig?.role || 'staff',
            staff_id: staff._id,
            extra_charge: staffConfig?.extra_charge,
            priority: staffConfig?.priority,
            resent: false,
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      invitations: mergedData,
      total: mergedData.length,
    })

  } catch (error: unknown) {
    const authorizationError = staffManagementErrorResponse(error)
    if (authorizationError) return authorizationError
    console.error('招待一覧取得エラー:', error)
    return NextResponse.json(
      { error: '招待一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// 招待の再送
export async function POST(req: NextRequest) {
  try {
    console.log('🔄 招待再送処理開始')
    
    // 1. 認証チェック
    const { convex, userId } = await getStaffManagementClient()
    console.log('✅ 認証成功:', userId)

    // 2. リクエストボディから再送に必要な情報を取得
    const body = await req.json()
    console.log('📦 受信データ:', body)
    
    const { staff_id, invitation_id, email } = body

    // 3. 必須パラメータの検証
    if (!staff_id || !email) {
      console.log('❌ staff_idが不足')
      return NextResponse.json(
        { error: 'staff_idが必要です' },
        { status: 400 }
      )
    }

    // 4. Convexからスタッフ情報を取得（一時的な情報含む）
    console.log('🔍 スタッフ情報取得中:', staff_id)
    const staffData = await convex.query(api.staff.invitation.query.getStaffWithInvitation, {
      staff_id: staff_id as Id<"staff">,
    })

    if (!staffData) {
      console.log('❌ スタッフが見つかりません')
      return NextResponse.json(
        { error: 'スタッフが見つかりません' },
        { status: 404 }
      )
    }

    await requireStaffManagement(convex, staffData.tenant_id, staffData.org_id)

    console.log('✅ スタッフ情報取得成功:', { 
      name: staffData.name, 
      clerk_user_id: staffData.clerk_user_id,
      status: staffData.invitationStatus 
    })

    if (staffData.invitationStatus === 'accepted') {
      console.log('❌ 既に受諾済み')
      return NextResponse.json(
        { error: '既に受諾済みの招待です' },
        { status: 400 }
      )
    }

    // 5. 古い招待をキャンセル（存在する場合）
    const clerk = await clerkClient()
    
    // フロントエンドから渡されたIDまたはConvexに保存されているIDを使用
    const invitationIdToRevoke = staffData.invitation_id
    if (invitation_id && invitation_id !== invitationIdToRevoke) {
      return NextResponse.json({ error: '招待IDがスタッフと一致しません' }, { status: 400 })
    }
    
    if (invitationIdToRevoke) {
      console.log('🗑️ 古い招待をキャンセル中:', invitationIdToRevoke)
      try {
        await clerk.invitations.revokeInvitation(invitationIdToRevoke)
        console.log('✅ 古い招待のキャンセル成功')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (revokeError: any) {
        const errorMessage = revokeError?.errors?.[0]?.message || revokeError?.message
        console.warn('⚠️ 古い招待のキャンセルに失敗:', errorMessage)
        
        // already revokedエラーの場合は問題なし
        if (errorMessage && (
          errorMessage.toLowerCase().includes('already revoked') ||
          errorMessage.toLowerCase().includes('resource_not_found')
        )) {
          console.log('✅ 招待は既に無効化されています')
        }
        // 続行（招待が既に無効の可能性）
      }
    }

    // 6. リダイレクトURLの確認
    const redirectUrl = `${BASE_URL}/staff/invite-accept`
    console.log('🔗 リダイレクトURL:', redirectUrl)

    // 7. 新しい招待を作成（再送）
    console.log('📧 新しい招待を作成中...')
    
    const invitationParams = {
      emailAddress: email ?? 'no-email',
      redirectUrl,
      publicMetadata: {
        tenant_id: staffData.tenant_id,
        org_id: staffData.org_id,
        role: staffData.config?.role || 'staff',
        staff_id: staffData._id,
        // 事前設定情報も含める
        extra_charge: staffData.config?.extra_charge,
        priority: staffData.config?.priority,
        invited_by: userId,
        invited_at: new Date().toISOString(),
        resent: true, // 再送フラグ
      },
      notify: true,
      ignoreExisting: true,
    }
    
    console.log('🚀 招待パラメータ:', JSON.stringify(invitationParams, null, 2))
    
    const invitation = await clerk.invitations.createInvitation(invitationParams)
    
    console.log('✅ 招待作成成功:', invitation.id)
    
    // Convexに新しい招待情報を保存
    await convex.mutation(api.staff.mutation.updateInvitationInfo, {
      staff_id: staff_id as Id<"staff">,
      invitation_id: invitation.id,
      invitation_email: email,
      invitation_status: 'pending' as const,
      role: staffData.config?.role || 'staff',
    })
    console.log('✅ Convex招待情報更新成功')

    return NextResponse.json({
      success: true,
      invitation_id: invitation.id,
      message: '招待メールを再送しました',
    })

  } catch (error: unknown) {
    const authorizationError = staffManagementErrorResponse(error)
    if (authorizationError) return authorizationError
    console.error('❌ 招待再送エラー:', error)
    
    // エラーの詳細をログ出力
    if (error && typeof error === 'object') {
      console.error('📋 エラー詳細:', JSON.stringify(error, null, 2))
    }
    
    // Clerkのエラーレスポンスを解析
    if (error && typeof error === 'object' && 'errors' in error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerkErrors = error.errors as any[]
      console.error('🏢 Clerkエラー:', clerkErrors)
      
      if (clerkErrors?.[0]?.code === 'form_identifier_exists') {
        return NextResponse.json(
          { error: 'このメールアドレスは既にClerkに登録されています' },
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json(
      { error: '招待の再送に失敗しました' },
      { status: 500 }
    )
  }
}