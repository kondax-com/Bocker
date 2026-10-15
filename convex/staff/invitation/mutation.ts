import { denyNotificationAccess, requireActiveOrganization, requireOrganizationAccess, requireStaffManagement } from '@/convex/utils/notificationAccess'
import { verifyServerCapability } from '@/lib/auth/server-capability'
import { v } from 'convex/values';
import { mutation } from '../../_generated/server';
import { updateRecord, createRecord, killRecord } from '@/convex/utils/helpers';
import { roleType, imageType, genderType, Role, Gender } from '@/convex/types';
import { getCurrentUnixTime } from '@/lib/schedules';

/**
 * 招待付きスタッフ作成
 * スタッフレコードを作成（clerk_user_id = null）
 * 基本情報設定、事前設定情報を保存
 */
export const createWithInvitation = mutation({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    email: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    images: v.array(imageType),
    is_active: v.boolean(),
    age: v.optional(v.number()),
    gender: v.optional(genderType),
    instagram_link: v.optional(v.string()),
    tags: v.array(v.string()),
    role: v.optional(roleType),
    featured_hair_images: v.optional(v.array(imageType)),
    extra_charge: v.optional(v.number()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
  
    await requireOrganizationAccess(ctx, args.tenant_id, args.org_id, true)
    // 注: メールアドレスの重複チェックはフロントエンドで実施済み
    
    // スタッフレコード作成（clerk_user_id = null で招待中を示す）
    const staffId = await ctx.db.insert('staff', {
      tenant_id: args.tenant_id,
      org_id: args.org_id,
      connect_clerk: true,
      clerk_user_id: undefined, // 招待中のため null
      name: args.name,
      description: args.description,
      images: args.images,
      is_active: false, // 招待中のため false
      is_archive: true, // 招待中のため true
      updated_at: getCurrentUnixTime(), // 更新日時 (UNIXタイム)
      deleted_at: getCurrentUnixTime(24 * 1095), // 論理削除日時 (UNIXタイム)
    });

    await createRecord(ctx, 'staff_config', {
      tenant_id: args.tenant_id,
      org_id: args.org_id,
      staff_id: staffId,
      age: args.age,
      gender: args.gender,
      instagram_link: args.instagram_link,
      tags: args.tags,
      role: args.role || 'staff' as Role,
      featured_hair_images: args.featured_hair_images || [],
      extra_charge: args.extra_charge || 0,
      priority: args.priority || 0,
    });

    return {
      staffId,
    };
  },
});

/**
 * 招待受諾時の更新
 * clerk_user_idを設定
 * is_activeを有効化
 * staff_configテーブル作成
 */
export const acceptInvitation = mutation({
  args: {
    staff_id: v.id('staff'),
    clerk_user_id: v.string(),
    server_token: v.string(),
    role: v.optional(roleType),
  },
  handler: async (ctx, args) => {

    if (!verifyServerCapability(args.server_token, 'staff:accept-invitation', JSON.stringify(['staff-invitation', args.staff_id, args.clerk_user_id]))) denyNotificationAccess()
    // スタッフレコード取得
    const staff = await ctx.db.get(args.staff_id);
    if (!staff) {
      throw new Error('スタッフが見つかりません');
    }

    await requireActiveOrganization(ctx, staff.tenant_id, staff.org_id)
    if (staff.clerk_user_id) {
      throw new Error('既に受諾済みの招待です');
    }

    // スタッフレコード更新（一時的なデータもクリア）
    await updateRecord(ctx, args.staff_id, {
      clerk_user_id: args.clerk_user_id,
      is_active: true,
      is_archive: false,
    });
    
    // staff_invitationレコードを更新
    const invitation = await ctx.db
      .query('staff_invitation')
      .withIndex('by_tenant_org_staff_archive', (q) =>
        q.eq('tenant_id', staff.tenant_id)
         .eq('org_id', staff.org_id)
         .eq('staff_id', args.staff_id)
         .eq('is_archive', false)
      )
      .first();
    if(invitation) {
      await killRecord(ctx, invitation._id);
    }

    // 週次スケジュールの初期化（全曜日休み）
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
    
    for (const day of daysOfWeek) {
      await createRecord(ctx, 'staff_week_schedule', {
        tenant_id: staff.tenant_id,
        org_id: staff.org_id,
        staff_id: args.staff_id,
        is_open: false,
        day_of_week: day
      });
    }

    return {
      success: true,
      staffId: args.staff_id,
    };
  },
});

/**
 * 招待キャンセル
 * staffレコードの削除
 * 関連データのクリーンアップ
 */
export const cancelInvitation = mutation({
  args: {
    staff_id: v.id('staff'),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staff_id);
    if (!staff) {
      throw new Error('スタッフが見つかりません');
    }

    await requireStaffManagement(ctx, args.staff_id)
    // 既に受諾済みの場合はキャンセルできない
    if (staff.clerk_user_id) {
      throw new Error('既に受諾済みの招待はキャンセルできません');
    }

    // スタッフレコードを削除
    await killRecord(ctx, args.staff_id);
    
    // staff_configレコードを削除
    const staffConfig = await ctx.db.query('staff_config').withIndex('by_tenant_org_staff_archive', (q) => q.eq('tenant_id', staff.tenant_id)
      .eq('org_id', staff.org_id)
      .eq('staff_id', args.staff_id)
    ).first();
    if(staffConfig) {
      await killRecord(ctx, staffConfig._id);
    }

    // 関連するstaff_invitationレコードもアーカイブ
    const invitation = await ctx.db
      .query('staff_invitation')
      .withIndex('by_tenant_org_staff_archive', (q) =>
        q.eq('tenant_id', staff.tenant_id)
         .eq('org_id', staff.org_id)
         .eq('staff_id', args.staff_id)
      )
      .first();
      
    if (invitation) {
      await killRecord(ctx, invitation._id);
    }

    return {
      success: true,
    };
  },
});