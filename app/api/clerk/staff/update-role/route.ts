// app/api/clerk/staff/update-role/route.ts
// スタッフ権限更新時にClerkのpublic_metadataも更新

import { clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { getStaffManagementClient, staffManagementErrorResponse } from '@/lib/auth/staff-management'
import { updateStaffRoleSchema } from '@/lib/validations/api/staff'
import { validateRequest, createValidationErrorResponse } from '@/lib/api/validation'

export async function PATCH(req: NextRequest) {
  try {
    // 1. 認証チェック
    const { convex } = await getStaffManagementClient()

    // 2. リクエストボディの検証
    const validation = await validateRequest(req, updateStaffRoleSchema)
    if (!validation.success) {
      return createValidationErrorResponse(validation.error)
    }

    const { staff_id, clerk_user_id, new_role } = validation.data
    let staff
    try {
      staff = await convex.query(api.staff.role_sync.query.getForSync, {
        staff_id: staff_id as Id<'staff'>,
        new_role,
      })
    } catch {
      return NextResponse.json(
        { error: '保存済みのスタッフ権限を同期する権限がありません' },
        { status: 403 }
      )
    }
    if (clerk_user_id && staff.clerk_user_id !== clerk_user_id) {
      return NextResponse.json({ error: 'スタッフとClerkユーザーが一致しません' }, { status: 400 })
    }

    // 5. Clerkユーザーが存在する場合のみpublic_metadata更新
    if (staff.clerk_user_id) {
      console.log('🔄 Clerk public_metadata更新中...')
      const clerk = await clerkClient()

      try {
        // 現在のメタデータを取得
        const clerkUser = await clerk.users.getUser(staff.clerk_user_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentMetadata = (clerkUser.publicMetadata as any) || {}

        // roleのみを更新（他のメタデータは保持）
        const updatedMetadata = {
          ...currentMetadata,
          role: staff.role,
          last_role_updated_at: new Date().toISOString(),
        }

        await clerk.users.updateUserMetadata(staff.clerk_user_id, {
          publicMetadata: updatedMetadata,
        })

        console.log('✅ Clerk public_metadata更新成功')
      } catch (clerkError) {
        console.error('❌ Clerk public_metadata更新エラー:', clerkError)
        // Clerkの更新に失敗してもConvex側は成功として扱う
        // ただし、警告として返す
        return NextResponse.json({
          success: true,
          warning: 'Convex側の更新は成功しましたが、Clerkの権限情報更新に失敗しました',
          staff_id,
          new_role: staff.role,
        })
      }
    }

    // 6. 成功レスポンス
    return NextResponse.json({
      success: true,
      message: 'スタッフ権限を更新しました',
      staff_id,
      new_role: staff.role,
      clerk_updated: !!staff.clerk_user_id,
    })
  } catch (error: unknown) {
    const authorizationError = staffManagementErrorResponse(error)
    if (authorizationError) return authorizationError
    console.error('スタッフ権限更新エラー:', error)

    return NextResponse.json({ error: 'スタッフ権限の更新に失敗しました' }, { status: 500 })
  }
}
