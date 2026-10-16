
import { mutation } from '@/convex/_generated/server';
import { v } from 'convex/values';
import { createRecord, updateRecord, excludeFields, archiveRecord, killRecord } from '@/convex/utils/helpers';
import { validateRequired, validateStringLength } from '@/convex/utils/validations';
import { assertSameOrganization, denyNotificationAccess, requireOrganizationAccess, requireStaffManagement } from '@/convex/utils/notificationAccess'
import { ConvexError } from 'convex/values';
import { ERROR_SEVERITY, ERROR_STATUS_CODE } from '@/lib/errors/constants';
import { imageType, roleType, invitationStatusType } from '@/convex/types';
import { MAX_NOTES_LENGTH } from '../constants';
import { getPlanLimits } from '../utils/helpers';
import { SubscriptionPlanName, subscriptionPlanNameType } from '../types';

export const create = mutation({
  args: {
    tenant_id: v.id('tenant'), // テナントID
    org_id: v.id('organization'), // 店舗ID
    plan_name: subscriptionPlanNameType, // プラン名
    connect_clerk: v.boolean(), // Clerk ユーザーID (true = clerk認証ユーザー, false = 未認証スタッフ)
    clerk_user_id: v.optional(v.string()), // Clerk ユーザーID ( null = 未認証スタッフ, INVITE=招待中, ${clerk_user_id}=受諾済み)
    name: v.string(), // スタッフ名
    description: v.optional(v.string()), // 自己紹介
    images: v.array(imageType), // 画像
    is_active: v.boolean(), // 有効/無効
  },
  handler: async (ctx, args) => {
    await requireOrganizationAccess(ctx, args.tenant_id, args.org_id, true)
    validateRequired(args.name, 'name');
    validateStringLength(args.name, 'name');
    validateStringLength(args.description, 'description', MAX_NOTES_LENGTH);


    const limits = getPlanLimits(args.plan_name as SubscriptionPlanName);

    // 3. 現在のメニュー数を取得
    // メニュー数を取得するために、最大数+1件取得して、その数をチェックする無駄なデータの取得をしない
    const staffCount = await ctx.db
      .query('staff')
      .withIndex('by_tenant_org_active_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id)
      ).filter((q) => q.eq(q.field('is_archive'), false))
      .take(limits.maxStaffCount + 1);

    // 4. 上限チェック
    if (staffCount.length >= limits.maxStaffCount) {
      // 2 . ConvexError を使用してエラーをスローする
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'menu.core.create',
        message: `${args.plan_name}プランのメニューの最大登録数は${limits.maxMenuCount}件です。`,
        code: 'BAD_REQUEST',
      });
    }



    // スタッフの存在確認
    let existingStaff
    if (args.connect_clerk && args.clerk_user_id) {
      // Clerk連携の場合はclerk_user_idで重複チェック
      existingStaff = await ctx.db
        .query('staff')
        .withIndex('by_tenant_org_active_archive', (q) =>
          q
            .eq('tenant_id', args.tenant_id)
            .eq('org_id', args.org_id)
        ).filter((q) => q.eq(q.field('clerk_user_id'), args.clerk_user_id))
        .filter((q) => q.eq(q.field('is_archive'), false))
        .first()
    } else {
      // Clerk未連携の場合は名前で重複チェック
      existingStaff = await ctx.db
        .query('staff')
        .withIndex('by_tenant_org_active_archive', (q) =>
          q
            .eq('tenant_id', args.tenant_id)
            .eq('org_id', args.org_id)
        ).filter((q) => q.eq(q.field('name'), args.name))
        .filter((q) => q.eq(q.field('connect_clerk'), false))
        .filter((q) => q.eq(q.field('is_archive'), false))
        .first()
    }
    if (existingStaff) {
      const errorMessage = args.connect_clerk 
        ? '指定されたメールアドレスのスタッフがすでに存在します'
        : '指定されたスタッフ名がすでに存在します'
      throw new ConvexError({
        message: errorMessage,
        statusCode: ERROR_STATUS_CODE.CONFLICT,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'staff.create',
        details: { ...existingStaff },
      })
    }

    return await createRecord(ctx, 'staff', {
      tenant_id: args.tenant_id, // テナントID
      org_id: args.org_id, // 組織ID
      connect_clerk: args.connect_clerk, // Clerk ユーザーID (true = clerk認証ユーザー, false = 未認証スタッフ)
      clerk_user_id: args.clerk_user_id, // 通常作成時はclerk_user_idは設定しない
      name: args.name, // スタッフ名
      description: args.description, // 自己紹介
      images: args.images, // 画像
      is_active: args.is_active, // 有効/無効
    })
  },
})

// スタッフ情報の更新
export const update = mutation({
  args: {
    staff_id: v.id('staff'),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    images: v.optional(v.array(imageType)),
    is_active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    validateRequired(args.name, 'name');
    validateStringLength(args.name, 'name');
    validateStringLength(args.description, 'description', MAX_NOTES_LENGTH);
    // スタッフの存在確認
    const staff = await ctx.db.get(args.staff_id)
    if (!staff || staff.is_archive) {
      throw new ConvexError({
        message: '指定されたスタッフが存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'staff.update',
        details: { ...args },
      })
    }

    await requireStaffManagement(ctx, args.staff_id)
    const updateData = excludeFields(args, ['staff_id'])

    return await updateRecord(ctx, args.staff_id, updateData)
  },
})

// スタッフの削除
export const archive = mutation({
  args: {
    staffId: v.id('staff'),
  },
  handler: async (ctx, args) => {
    await requireStaffManagement(ctx, args.staffId)
    return await archiveRecord(ctx, args.staffId)
  },
})

export const upsert = mutation({
  args: {
    tenant_id: v.id('tenant'), // テナントID
    org_id: v.id('organization'), // 組織ID
    connect_clerk: v.boolean(), // Clerk ユーザーID (true = clerk認証ユーザー, false = 未認証スタッフ)
    clerk_user_id: v.optional(v.string()), // Clerk ユーザーID (null=招待中,undefined=作成時に招待しない, 存在=受諾済み)
    staff_id: v.id('staff'),
    name: v.string(), // スタッフ名
    description: v.optional(v.string()), // 自己紹介
    images: v.array(imageType), // 画像
    is_active: v.boolean(), // 有効/無効
  },
  handler: async (ctx, args) => {
    validateRequired(args.name, 'name');
    validateStringLength(args.name, 'name');
    validateStringLength(args.description, 'description', MAX_NOTES_LENGTH);
    const existingStaff = await ctx.db.get(args.staff_id)

    if (existingStaff) {
      await requireStaffManagement(ctx, existingStaff._id)
      assertSameOrganization(existingStaff, args.tenant_id, args.org_id)
    } else {
      await requireOrganizationAccess(ctx, args.tenant_id, args.org_id, true)
    }
    if (!existingStaff || existingStaff.is_archive) {
      return await createRecord(ctx, 'staff', excludeFields(args, ['staff_id']))
    } else {
      const updateData = excludeFields(args, ['staff_id', 'tenant_id', 'org_id'])
      return await updateRecord(ctx, existingStaff._id, updateData)
    }
  },
})

export const killRelatedTables = mutation({
  args: {
    tenant_id: v.id('tenant'), // テナントID
    org_id: v.id('organization'), // 組織ID
    staff_id: v.id('staff'),
    staff_config_id: v.id('staff_config')
  },
  handler: async (ctx, args) => {

    const staff = await requireStaffManagement(ctx, args.staff_id)
    assertSameOrganization(staff, args.tenant_id, args.org_id)
    const config = await ctx.db.get(args.staff_config_id)
    if (!config || config.staff_id !== staff._id) denyNotificationAccess()
    assertSameOrganization(config, staff.tenant_id, staff.org_id)
    // スタッフ設定の削除
    if (args.staff_config_id) {
      await killRecord(ctx, args.staff_config_id)
    }
    // スタッフの削除
    if (args.staff_id) {
      await killRecord(ctx, args.staff_id)
    }

    // 招待情報の削除
    const staffInvitation = await ctx.db.query('staff_invitation').withIndex('by_tenant_org_staff_archive', (q) => q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('staff_id', args.staff_id)).first()
    if (staffInvitation) {
      await killRecord(ctx, staffInvitation._id)
    }

    // スタッフのスケジュールの削除
    const staffWeekSchedules = await ctx.db
      .query('staff_week_schedule')
      .withIndex('by_tenant_org_staff_archive', (q) => q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('staff_id', args.staff_id))
      .collect()

    await Promise.all(staffWeekSchedules.map((schedule) => killRecord(ctx, schedule._id)))

    // スタッフの例外スケジュールの削除
    const staffSchedules = await ctx.db
      .query('staff_exception_schedule')
      .withIndex('by_tenant_org_staff_date_archive', (q) => q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('staff_id', args.staff_id))
      .collect()
    await Promise.all(staffSchedules.map((schedule) => killRecord(ctx, schedule._id)))

    return {
      deletedStaffConfigId: args.staff_config_id,
      deletedStaffId: args.staff_id,
    }
  },
})

export const removeImages = mutation({
  args: {
    staff_id: v.id('staff'),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staff_id)
    if (!staff) {
      throw new ConvexError({
        message: '指定されたスタッフが存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'staff.removeImages',
        code: 'NOT_FOUND',
        status: ERROR_STATUS_CODE.NOT_FOUND,
        details: { ...args },
      })
    }
    await requireStaffManagement(ctx, args.staff_id)
    const deletedStaffImage = await ctx.db.patch(args.staff_id, {
      images: [],
    })
    return {
      deletedStaffImage,
    }
  },
})

// 招待情報の更新（招待作成・再送時に使用）
export const updateInvitationInfo = mutation({
  args: {
    staff_id: v.id('staff'), // スタッフID
    role: roleType, // ロール
    invitation_id: v.string(), // Clerk招待ID
    invitation_email: v.string(), // 招待メールアドレス
    invitation_status: invitationStatusType, // 招待ステータス
  },
  handler: async (ctx, args) => {
   
    const staff = await ctx.db.get(args.staff_id)
    if (!staff) {
      throw new ConvexError({
        message: '指定されたスタッフが存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'staff.updateInvitationInfo',
        details: { ...args },
      })
    }

    await requireStaffManagement(ctx, args.staff_id)
    // 既存のstaff_invitationレコードを探す
    const existingInvitation = await ctx.db
      .query('staff_invitation')
      .withIndex('by_tenant_org_staff_archive', (q) =>
        q.eq('tenant_id', staff.tenant_id)
         .eq('org_id', staff.org_id)
         .eq('staff_id', args.staff_id)
         .eq('is_archive', false)
      )
      .first()

    if (existingInvitation) {
      // 既存レコードを更新
      await updateRecord(ctx, existingInvitation._id, {
        invitation_id: args.invitation_id,
        invitation_email: args.invitation_email,
        invitation_status: args.invitation_status,
        role: args.role,
      })
    } else {
      // 新規レコードを作成
      await createRecord(ctx, 'staff_invitation', {
        tenant_id: staff.tenant_id,
        org_id: staff.org_id,
        staff_id: args.staff_id,
        role: args.role,
        invitation_id: args.invitation_id,
        invitation_email: args.invitation_email,
        invitation_status: args.invitation_status,
      })
    }

    return { success: true }
  },
})

