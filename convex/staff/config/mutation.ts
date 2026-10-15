import { mutation } from '@/convex/_generated/server';
import { v } from 'convex/values';
import { createRecord, updateRecord, excludeFields, archiveRecord, killRecord } from '@/convex/utils/helpers';
import { assertSameOrganization, denyNotificationAccess, requireStaffManagement, requireStaffConfigManagement } from '@/convex/utils/notificationAccess'
import { ConvexError } from 'convex/values';
import { ERROR_SEVERITY, ERROR_STATUS_CODE } from '@/lib/errors/constants';
import { validateNumberLength } from '@/convex/utils/validations';
import { roleType, genderType, imageType } from '@/convex/types';

// スタッフ詳細設定の追加
export const create = mutation({
  args: {
    tenant_id: v.id('tenant'), // テナントID
    org_id: v.id('organization'), // 店舗ID
    staff_id: v.id('staff'), // スタッフID
    age: v.optional(v.number()), // 年齢
    gender: genderType, // 性別
    instagram_link: v.optional(v.string()), // インスタグラムリンク
    tags: v.array(v.string()), // タグ
    role: roleType, // ロール
    featured_hair_images: v.optional(v.array(imageType)), // フィーチャー画像
    extra_charge: v.optional(v.number()), // 追加料金
    priority: v.optional(v.number()), // 優先度
  },
  handler: async (ctx, args) => {

    validateNumberLength(args.extra_charge, 'extra_charge');
    validateNumberLength(args.priority, 'priority');
    const managedStaff = await requireStaffManagement(ctx, args.staff_id)
    assertSameOrganization(managedStaff, args.tenant_id, args.org_id)
    // スタッフの存在確認
    const staff = await ctx.db.get(args.staff_id);
    if (!staff) {
      throw new ConvexError({
        message: '指定されたスタッフが存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'staff.config.create',
        details: { ...args },
      });
    }

    // 組織の存在確認
    const org = await ctx.db.get(args.org_id);
    if (!org) {
      throw new ConvexError({
        message: '指定された組織が存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'staff.config.create',
        details: { ...args },
      });
    }

    return await createRecord(ctx, 'staff_config', args);
  },
});

// スタッフ設定情報の更新
export const update = mutation({
  args: {
    tenant_id: v.id('tenant'), // テナントID
    org_id: v.id('organization'), // 店舗ID
    staff_id: v.id('staff'), // スタッフID
    staff_config_id: v.id('staff_config'), // スタッフ設定ID
    age: v.optional(v.number()), // 年齢
    gender: genderType, // 性別
    instagram_link: v.optional(v.string()), // インスタグラムリンク
    tags: v.array(v.string()), // タグ
    role: roleType, // ロール
    featured_hair_images: v.optional(v.array(imageType)), // フィーチャー画像
    extra_charge: v.optional(v.number()), // 追加料金
    priority: v.optional(v.number()), // 優先度
  },
  handler: async (ctx, args) => {

    validateNumberLength(args.extra_charge, 'extra_charge');
    validateNumberLength(args.priority, 'priority');
    // スタッフ設定の存在確認
    const staffConfig = await ctx.db.get(args.staff_config_id);
    if (!staffConfig || staffConfig.is_archive) {
      throw new ConvexError({
        message: '指定されたスタッフ設定が存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'staff.config.update',
        details: { ...args },
      });
    }

    const managed = await requireStaffConfigManagement(ctx, args.staff_config_id)
    assertSameOrganization(managed.config, args.tenant_id, args.org_id)
    if (managed.config.staff_id !== args.staff_id) denyNotificationAccess()
    const updateData = excludeFields(args, ['staff_config_id', 'staff_id', 'tenant_id', 'org_id']);

    return await updateRecord(ctx, args.staff_config_id, updateData);
  },
});

export const updateRole = mutation({
  args: {
    staff_id: v.id('staff'),
    clerk_user_id: v.string(),
    staff_config_id: v.id('staff_config'),
    role: roleType,
  },
  handler: async (ctx, args) => {
    const { config, staff } = await requireStaffConfigManagement(ctx, args.staff_config_id)
    if (config.staff_id !== args.staff_id || staff.clerk_user_id !== args.clerk_user_id) denyNotificationAccess()
    await updateRecord(ctx, args.staff_config_id, {
      role: args.role,
    })
    return {
      staff_id: args.staff_id,
      clerk_user_id: args.clerk_user_id,
      new_role: args.role,
    }
  },
});

// スタッフ設定の削除
export const archive = mutation({
  args: {
    staff_config_id: v.id('staff_config'),
  },
  handler: async (ctx, args) => {

    await requireStaffConfigManagement(ctx, args.staff_config_id)
    return await archiveRecord(ctx, args.staff_config_id);
  },
});

export const upsert = mutation({
  args: {
    tenant_id: v.id('tenant'), // テナントID
    org_id: v.id('organization'), // 店舗ID
    staff_id: v.id('staff'), // スタッフID
    staff_config_id: v.id('staff_config'), // スタッフ設定ID
    age: v.optional(v.number()), // 年齢
    gender: genderType, // 性別
    instagram_link: v.optional(v.string()), // インスタグラムリンク
    tags: v.array(v.string()), // タグ
    role: roleType, // ロール
    featured_hair_images: v.optional(v.array(imageType)), // フィーチャー画像
    extra_charge: v.optional(v.number()), // 追加料金
    priority: v.optional(v.number()), // 優先度
  },
  handler: async (ctx, args) => {

    validateNumberLength(args.extra_charge, 'extra_charge');
    validateNumberLength(args.priority, 'priority');
    const existingStaffConfig = await ctx.db.get(args.staff_config_id);
    const staff = await requireStaffManagement(ctx, args.staff_id)
    assertSameOrganization(staff, args.tenant_id, args.org_id)
    if (existingStaffConfig) {
      assertSameOrganization(existingStaffConfig, staff.tenant_id, staff.org_id)
      if (existingStaffConfig.staff_id !== args.staff_id) denyNotificationAccess()
    }
    if (!existingStaffConfig || existingStaffConfig.is_archive) {
      return await createRecord(ctx, 'staff_config', excludeFields(args, ['staff_config_id']));
    } else {
      const updateData = excludeFields(args, ['staff_config_id', 'staff_id', 'tenant_id', 'org_id']);
      return await updateRecord(ctx, existingStaffConfig._id, updateData);
    }
  },
});

export const kill = mutation({
  args: {
    staff_config_id: v.id('staff_config'),
  },
  handler: async (ctx, args) => {

    await requireStaffConfigManagement(ctx, args.staff_config_id)
    return await killRecord(ctx, args.staff_config_id);
  },
});
