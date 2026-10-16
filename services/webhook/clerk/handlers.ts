import type { UserJSON } from '@clerk/nextjs/server';
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import * as Sentry from '@sentry/nextjs';
import type { 
  WebhookDependencies, 
  EventProcessingResult, 
  LogContext 
} from '../types';
import { executeInParallel, createTask } from '../parallel';
import { WebhookMetricsCollector } from '../metrics';
import { clerkClient } from '@clerk/nextjs/server';
import { Id } from '@/convex/_generated/dataModel';
import { createServerCapability, organizationResource } from '@/lib/auth/server-capability';

/**
 * `user.created` Webhookイベントを処理するハンドラー関数。
 * 新規ユーザーの情報をStripeおよびConvexに登録する。
 * 既存ユーザーの場合はメールアドレスを更新する。
 * @param data UserJSON - Clerkから送信されたユーザーデータ
 * @param eventId string - Webhookイベントの一意なID
 * @param deps WebhookDependencies - 外部サービスへの依存関係
 * @param metrics WebhookMetricsCollector - メトリクス収集用インスタンス
 * @returns Promise<EventProcessingResult> - 処理結果
 */
export async function handleUserCreated(
  data: UserJSON,
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
  const { id, email_addresses = [], unsafe_metadata, public_metadata } = data;
  const referral_code = unsafe_metadata?.referralCode as string | null;
  const org_name = unsafe_metadata?.orgName as string | undefined;
  const email = email_addresses[0]?.email_address || 'no-email';


  const context: LogContext = {
    eventId,
    eventType: 'user.created',
    userId: id,
  };

  console.log(`👤 [${eventId}] User Created処理開始: user_id=${id}, email=${email}`, context);

  // スタッフ招待の受諾チェック('staff_id'が存在する場合はスタッフアカウントとして処理)
  // スタッフ招待の条件を確認
  // 1. public_metadataが存在するか
  // 2. staff_idまたはstaffIdが存在するか
  // 3. ロールがadminでないか
  const isStaffInvitation = public_metadata && 
    ('staff_id' in public_metadata || 'staffId' in public_metadata) &&
    public_metadata.role !== 'admin';

  if (isStaffInvitation) {
    const staffId = public_metadata.staff_id || public_metadata.staffId;
    console.log(`🎫 [${eventId}] スタッフ招待の受諾を検出: staff_id=${staffId}`, context);
    return handleStaffInvitationAccepted(data, eventId, deps, metrics);
  } else {
    try {
      // 1. 既存テナントの確認
      const existingTenant = await deps.retry(() =>
        fetchQuery(deps.convex.tenant.query.findByUserId, { user_id: id })
      ).catch((error) => {
        console.warn(`⚠️ [${eventId}] 既存テナントの確認中にエラー（無視して続行）: user_id=${id}`, { ...context, error });
        return null;
      });
  
      if (existingTenant) {
        console.log(`👤 [${eventId}] 既存テナント (${existingTenant._id}) が見つかりました: user_id=${id}。メールアドレスを ${email} に更新します。`, { ...context, tenantId: existingTenant._id });
        
        // メールアドレスのみ更新
        await deps.retry(() =>
          fetchMutation(deps.convex.tenant.mutation.upsert, {
            user_id: id,
            user_email: email
          })
        );
        
        metrics.incrementApiCall('convex');
        
        console.log(`✅ [${eventId}] 既存テナント (${existingTenant._id}) のメールアドレス更新成功。`, { ...context, tenantId: existingTenant._id });
        
        return {
          result: 'success',
          metadata: { action: 'email_updated', existingTenantId: existingTenant._id, newEmail: email }
        };
      }
  
      // 2. Stripe顧客作成
      console.log(`💳 [${eventId}] Stripe顧客作成: email=${email}, user_id=${id}`, context);
      metrics.incrementApiCall('stripe');
      
      const stripeCustomer = await deps.retry(() =>
        deps.stripe.customers.create({
          email: email || undefined,
          metadata: { 
            user_id: id,
            referral_code: referral_code
          },
        }, {
          idempotencyKey: `clerk_user_${id}_${eventId}`,
        })
      );
  
      console.log(`💳 [${eventId}] Stripe顧客作成成功: customerId=${stripeCustomer.id}`, { ...context, stripeCustomerId: stripeCustomer.id });
  
      // 3. テナント作成
      console.log(`🏢 [${eventId}] テナント作成開始: user_id=${id}, stripeCustomerId=${stripeCustomer.id}`, { ...context, stripeCustomerId: stripeCustomer.id });
      metrics.incrementApiCall('convex');
      const tenantId = await deps.retry(() =>
        fetchMutation(deps.convex.tenant.mutation.create, {
          user_id: id,
          user_email: email,
          stripe_customer_id: stripeCustomer.id,
        })
      );
      console.log(`🏢 [${eventId}] テナント作成成功: tenant_id=${tenantId}`, { ...context, tenantId });
      
      // 4. Referral作成（非クリティカル）
      try {
        console.log(`🎁 [${eventId}] Referral作成開始: tenant_id=${tenantId}`, { ...context, tenantId });
        metrics.incrementApiCall('convex');
        await deps.retry(() =>
          fetchMutation(deps.convex.tenant.referral.mutation.create, {
            tenant_id: tenantId,
          })
        );
        console.log(`🎁 [${eventId}] Referral作成成功。`, { ...context, tenantId });
      } catch (referralError) {
        console.warn(`⚠️ [${eventId}] Referral作成失敗（非クリティカル）: tenant_id=${tenantId}`, { ...context, tenantId, error: referralError });
        Sentry.captureException(referralError, {
          level: 'warning',
          tags: { ...context, operation: 'create_referral', tenant_id: tenantId },
          extra: { tenantId }
        });
      }
  
      // 5. 店舗の作成
      console.log(`🏢 [${eventId}] 店舗作成開始: user_id=${id}, stripeCustomerId=${stripeCustomer.id}`, { ...context, stripeCustomerId: stripeCustomer.id });
      metrics.incrementApiCall('convex');
      const orgId = await deps.retry(() =>
        fetchMutation(deps.convex.organization.mutation.create, {
          tenant_id: tenantId,
          org_name: org_name ? org_name : '',
          org_email: email
        })
      );
      console.log(`🏢 [${eventId}] 店舗作成成功: org_id=${orgId}`, { ...context, orgId });
  
        // 6. Stripe顧客のメタデータ更新
        try{
          await deps.stripe.customers.update(stripeCustomer.id, {
            metadata: {
              tenant_id: tenantId,
              org_id: orgId,
            },
          });
          metrics.incrementApiCall('stripe');
        }catch(error){
          console.warn(`⚠️ [${eventId}] Stripe顧客メタデータ更新失敗（非クリティカル）: customerId=${stripeCustomer.id}`, { ...context, stripeCustomerId: stripeCustomer.id, error });
          Sentry.captureException(error, {
            level: 'warning',
            tags: { ...context, operation: 'update_stripe_customer_metadata', stripeCustomerId: stripeCustomer.id },
          });
        }
        // クラークユーザーのメタデータ更新
        try {
          const clerk = await clerkClient();
          await clerk.users.updateUserMetadata(id, {
            publicMetadata: {
              org_id: orgId,
              role: 'admin',
              tenant_id: tenantId,
            },
          })
          metrics.incrementApiCall('clerk');
        } catch (error) {
          console.warn(`⚠️ [${eventId}] ユーザーメタデータ更新失敗（非クリティカル）: user_id=${id}`, { ...context, error });
          Sentry.captureException(error, {
            level: 'warning',
            tags: { ...context, operation: 'update_user_metadata', userId: id },
          });
          return {
            result: 'error',
            errorMessage: 'ユーザーメタデータ更新失敗（クリティカル）ログイン認証できない状態になっている可能性があります。'
          }
        }
  
        // 7. サロン設定の作成
        console.log(`🏢 [${eventId}] サロン設定作成開始: org_id=${orgId}`, { ...context, orgId });
       try{
        metrics.incrementApiCall('convex');
        await deps.retry(() =>
          fetchMutation(deps.convex.organization.config.mutation.create, {
            org_id: orgId,
            tenant_id: tenantId,
            images: [],
          })
        );
       }catch(error){
        console.warn(`⚠️ [${eventId}] サロン設定作成失敗（非クリティカル）: org_id=${orgId}`, { ...context, orgId, error });
        Sentry.captureException(error, {
          level: 'warning',
          tags: { ...context, operation: 'create_organization_config', orgId },
        });
       }
  
        // 8. サロンAPI設定を作成
        try{
          console.log(`🏢 [${eventId}] サロンAPI設定の画像を作成開始: org_id=${orgId}`, { ...context, orgId });
        metrics.incrementApiCall('convex');
        await deps.retry(() =>
          fetchMutation(deps.convex.organization.api_config.mutation.create, {
            org_id: orgId,
            tenant_id: tenantId,
            server_token: createServerCapability('api-config:write', organizationResource(tenantId, orgId)),
          })
        );
        }catch(error){
          console.warn(`⚠️ [${eventId}] サロンAPI設定作成失敗（非クリティカル）: org_id=${orgId}`, { ...context, orgId, error });
          Sentry.captureException(error, {
            level: 'warning',
            tags: { ...context, operation: 'create_organization_api_config', orgId },
          });
        }
  
        // 9. サロン予約設定を作成
       try{
        console.log(`🏢 [${eventId}] サロン予約設定作成開始: org_id=${orgId}`, { ...context, orgId });
        metrics.incrementApiCall('convex');
        await deps.retry(() =>
          fetchMutation(deps.convex.organization.reservation_config.mutation.create, {
            org_id: orgId,
            tenant_id: tenantId,
            reservation_interval_minutes: 30,
            available_sheet: 2,
            reservation_limit_days: 30,
            available_cancel_days: 3,
            today_first_later_minutes: 30,
            is_multiple_select_category: true,
          })
        );
       }catch(error){
        console.warn(`⚠️ [${eventId}] サロン予約設定作成失敗（非クリティカル）: org_id=${orgId}`, { ...context, orgId, error });
        Sentry.captureException(error, {
          level: 'warning',
          tags: { ...context, operation: 'create_organization_reservation_config', orgId },
        });
       }
      console.log(`✅ [${eventId}] User Created処理完了。`, { ...context, tenantId, stripeCustomerId: stripeCustomer.id });
      return {
        result: 'success',
        metadata: { 
          action: 'user_created', 
          tenantId: tenantId,
          stripeCustomerId: stripeCustomer.id 
        }
      };
  
    } catch (error) {
      console.error(`❌ [${eventId}] User Created処理中に致命的なエラーが発生: user_id=${id}`, { ...context, error });
      
      Sentry.captureException(error, {
        level: 'error',
        tags: { ...context, operation: 'handleUserCreated_main_catch' },
      });
  
      return {
        result: 'error',
        errorMessage: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }
}

/**
 * `user.updated` Webhookイベントを処理するハンドラー関数。
 * ユーザーのメールアドレス変更などをStripeおよびConvexに同期する。
 * テナントが存在しない場合は、復旧処理として新規作成を試みる。
 * @param data UserJSON - Clerkから送信されたユーザーデータ
 * @param eventId string - Webhookイベントの一意なID
 * @param deps WebhookDependencies - 外部サービスへの依存関係
 * @param metrics WebhookMetricsCollector - メトリクス収集用インスタンス
 * @returns Promise<EventProcessingResult> - 処理結果
 */
export async function handleUserUpdated(
  data: UserJSON,
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
  const { id, email_addresses = [], primary_email_address_id } = data;

  // プライマリーメールアドレスを取得
  let email = 'no-email';
  if (primary_email_address_id && email_addresses.length > 0) {
    const primaryEmail = email_addresses.find((e) => e.id === primary_email_address_id);
    email = primaryEmail?.email_address || email_addresses[0]?.email_address || 'no-email';
  } else {
    email = email_addresses[0]?.email_address || 'no-email';
  }
  const context: LogContext = {
    eventId,
    eventType: 'user.updated',
    userId: id,
  };

  console.log(`🔄 [${eventId}] User Updated処理開始: user_id=${id}, new_email=${email}`, context);

  try {
    // 既存テナントの確認
    const existingTenant = await deps.retry(() =>
      fetchQuery(deps.convex.tenant.query.findByUserId, { user_id: id })
    ).catch(() => null);

    metrics.incrementApiCall('convex');

    if (existingTenant) {
      // 並列でStripeとConvexを更新
      const updateTasks = [
        createTask(
          'stripe_customer_update',
          async () => {
            if (existingTenant.stripe_customer_id && typeof existingTenant.stripe_customer_id === 'string') {
              console.log(`💳 [${eventId}] Stripe顧客更新開始: customerId=${existingTenant.stripe_customer_id}, new_email=${email}`, { ...context, stripeCustomerId: existingTenant.stripe_customer_id });
              metrics.incrementApiCall('stripe');
              
              return deps.retry(() =>
                deps.stripe.customers.update(existingTenant.stripe_customer_id!, {
                  email: email || undefined,
                  metadata: { user_id: id, updated_at: new Date().toISOString() },
                }, {
                  idempotencyKey: `clerk_update_user_${id}_${eventId}`,
                })
              );
            }
            console.log(`ℹ️ [${eventId}] Stripe顧客IDが存在しないため、Stripe顧客更新をスキップ。user_id=${id}`, { ...context, tenantId: existingTenant._id });
            return null;
          },
          false // Stripe更新は失敗してもConvex更新は試みるため非クリティカル
        ),
        createTask(
          'convex_tenant_update',
          async () => {
            console.log(`🏢 [${eventId}] テナント更新開始: tenant_id=${existingTenant._id}, new_email=${email}`, { ...context, tenantId: existingTenant._id });
            metrics.incrementApiCall('convex');
            
            return deps.retry(() =>
              fetchMutation(deps.convex.tenant.mutation.upsert, {
                user_id: id,
                user_email: email,
                stripe_customer_id: existingTenant.stripe_customer_id,
              })
            );
          },
          true // クリティカル
        )
      ];

      await executeInParallel(updateTasks, context);


      console.log(`✅ [${eventId}] User Updated処理完了。user_id=${id}`, { ...context, tenantId: existingTenant._id });
      return {
        result: 'success',
        metadata: { action: 'user_updated', tenantId: existingTenant._id, newEmail: email }
      };

    }else{
      return {
        result: 'skipped',
        metadata: { action: "not found tenant." }
      };
    }
  } catch (error) {
    console.error(`❌ [${eventId}] User Updated処理中に致命的なエラーが発生: user_id=${id}`, { ...context, error });
    
    Sentry.captureException(error, {
      level: 'error',
      tags: { ...context, operation: 'handleUserUpdated_main_catch' },
    });

    return {
      result: 'error',
      errorMessage: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

/**
 * `user.deleted` Webhookイベントを処理するハンドラー関数。
 * Stripe顧客データ（オプション）とConvexテナントデータを削除（アーカイブ）する。
 * @param data UserJSON - Clerkから送信されたユーザーデータ
 * @param eventId string - Webhookイベントの一意なID
 * @param deps WebhookDependencies - 外部サービスへの依存関係
 * @param metrics WebhookMetricsCollector - メトリクス収集用インスタンス
 * @returns Promise<EventProcessingResult> - 処理結果
 */
export async function handleUserDeleted(
  data: UserJSON,
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
  const { id } = data;
  const context: LogContext = {
    eventId,
    eventType: 'user.deleted',
    userId: id,
  };

  console.log(`🗑️ [${eventId}] User Deleted処理開始: user_id=${id}`, context);
  try {
    // テナント情報の取得
    const tenantRecord = await deps.retry(() =>
      fetchQuery(deps.convex.tenant.query.findByUserId, { user_id: id })
    ).catch(() => null);

    metrics.incrementApiCall('convex');

    if (!tenantRecord) {
      console.warn(`⚠️ [${eventId}] 削除対象のテナントが見つかりません: user_id=${id}`);
      return {
        result: 'success',
        metadata: { action: 'no_tenant_found' }
      };
    }

    try{
      // 並列でStripeとConvexから削除
      const deleteTasks = [
        createTask(
          'stripe_customer_deletion',
          async () => {
            if (tenantRecord.stripe_customer_id && typeof tenantRecord.stripe_customer_id === 'string') {
              console.log(`💳 [${eventId}] Stripe顧客削除開始: customerId=${tenantRecord.stripe_customer_id}`, { ...context, stripeCustomerId: tenantRecord.stripe_customer_id });
              metrics.incrementApiCall('stripe');
              
              return deps.retry(() => 
                deps.stripe.customers.del(tenantRecord.stripe_customer_id!)
              );
            }
            console.log(`ℹ️ [${eventId}] Stripe顧客IDが存在しないため、Stripe顧客削除をスキップ。user_id=${id}`, { ...context, tenantId: tenantRecord._id });
            return null;
          },
          false // 非クリティカル
        ),
        createTask(
          'convex_tenant_archive',
          async () => {
            console.log(`🏢 [${eventId}] テナントアーカイブ開始: tenant_id=${tenantRecord._id}`, { ...context, tenantId: tenantRecord._id });
            metrics.incrementApiCall('convex');
            return deps.retry(() =>
              fetchMutation(deps.convex.tenant.mutation.archive, {
                tenant_id: tenantRecord._id,
              })
            );
          },
          true // クリティカル
        )
      ];
      await executeInParallel(deleteTasks, context);

    }catch(error){
      console.warn(`⚠️ [${eventId}] テナント削除失敗（クリティカル）: user_id=${id}`, { ...context, error });
      Sentry.captureException(error, {
        level: 'error',
        tags: { ...context, operation: 'delete_tenant', userId: id },
      });
    }
    return {
      result: 'success',
      metadata: { action: 'user_deleted', tenantId: tenantRecord._id }
    };

  } catch (error) {
    console.error(`❌ [${eventId}] User Deleted処理中に致命的なエラーが発生: user_id=${id}`, { ...context, error });
    
    Sentry.captureException(error, {
      level: 'error',
      tags: { ...context, operation: 'handleUserDeleted_main_catch' },
    });

    return {
      result: 'error',
      errorMessage: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

/**
 * スタッフ招待受諾時の処理を行うハンドラー関数
 * @param data UserJSON - Clerkから送信されたユーザーデータ
 * @param eventId string - Webhookイベントの一意なID
 * @param deps WebhookDependencies - 外部サービスへの依存関係
 * @param metrics WebhookMetricsCollector - メトリクス収集用インスタンス
 * @returns Promise<EventProcessingResult> - 処理結果
 */
async function handleStaffInvitationAccepted(
  data: UserJSON,
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
  const { id: clerk_user_id, public_metadata } = data;
  
  // publicMetadataから必要な情報を取得（フォールバック機能付き）
  const staff_id = public_metadata?.staff_id as string | undefined;
  const tenant_id = public_metadata?.tenant_id as string | undefined;
  const org_id = public_metadata?.org_id as string | undefined;
  const role = (public_metadata?.role as 'staff' | 'admin') || 'staff';
 
  console.log(`📋 [${eventId}] publicMetadataから取得した情報:`, {
    staff_id,
    tenant_id,
    org_id,
    role
  });

  const context: LogContext = {
    eventId,
    eventType: 'user.created',
    userId: clerk_user_id,
  };

  console.log(`🎫 [${eventId}] スタッフ招待受諾処理開始: staff_id=${staff_id}, clerk_user_id=${clerk_user_id}`, context);

  if (!staff_id || !tenant_id || !org_id) {
    console.error(`❌ [${eventId}] 必要なメタデータが不足しています: staff_id=${staff_id}, tenant_id=${tenant_id}, org_id=${org_id}`, context);
    return {
      result: 'error',
      errorMessage: 'スタッフ招待のメタデータが不足しています'
    };
  }

  try {

    // Convexでスタッフレコードを更新
    console.log(`📝 [${eventId}] Convexスタッフレコード更新開始: staff_id=${staff_id}`, context);
    metrics.incrementApiCall('convex');
    
    await deps.retry(() =>
      fetchMutation(deps.convex.staff.invitation.mutation.acceptInvitation, {
        staff_id: staff_id as Id<"staff">,
        clerk_user_id,
        role,
        server_token: createServerCapability(
          'staff:accept-invitation',
          JSON.stringify(['staff-invitation', staff_id, clerk_user_id])
        ),
      })
    );

    console.log(`✅ [${eventId}] スタッフ招待受諾処理完了: staff_id=${staff_id}, clerk_user_id=${clerk_user_id}`, context);

    // Clerkユーザーのpublicメタデータを更新（staff_id以外の情報を保持）
    try {
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(clerk_user_id, {
        publicMetadata: {
          tenant_id,
          org_id,
          role,
          staff_id,
        },
      });
      metrics.incrementApiCall('clerk');
      console.log(`✅ [${eventId}] Clerkメタデータ更新完了`, context);
    } catch (clerkError) {
      console.warn(`⚠️ [${eventId}] Clerkメタデータ更新失敗（非クリティカル）`, { ...context, error: clerkError });
      Sentry.captureException(clerkError, {
        level: 'warning',
        tags: { ...context, operation: 'update_clerk_metadata_after_invitation' },
      });
    }

    return {
      result: 'success',
      metadata: { 
        action: 'staff_invitation_accepted',
        staff_id,
        tenant_id,
        org_id,
        role
      }
    };

  } catch (error) {
    console.error(`❌ [${eventId}] スタッフ招待受諾処理中にエラーが発生: staff_id=${staff_id}`, { ...context, error });
    
    Sentry.captureException(error, {
      level: 'error',
      tags: { ...context, operation: 'handleStaffInvitationAccepted' },
      extra: { staff_id, tenant_id, org_id }
    });

    return {
      result: 'error',
      errorMessage: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}
