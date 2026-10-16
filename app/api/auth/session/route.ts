import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { CustomerRepository } from '@/services/supabase/repositories/customer';
import { verifyPassword } from '@/lib/auth/password';
import { emailSchema } from '@/lib/validations/api/common';
import { LOGIN_SESSION_KEY } from '@/services/line/constants';
import { SessionPayload } from '@/lib/types';
import { getEnv } from '@/lib/env-config';
import { Id } from '@/convex/_generated/dataModel';
import { getCustomerSession } from '@/lib/auth/customer';

export const runtime = 'nodejs';

// POSTリクエスト用のスキーマ
const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(100),
  tenantId: z.string().min(1),
  orgId: z.string().min(1),
});

const APP_JWT_SECRET = getEnv('APP_JWT_SECRET');
const JWT_EXPIRES_IN = '30d';

export async function POST(request: NextRequest) {
  try {
    console.log('[API /api/auth/session] Processing login request...');

    // リクエストボディを解析・バリデーション
    const body: unknown = await request.json();
    const validatedData = loginRequestSchema.parse(body);

    console.log(`[API /api/auth/session] Validated login request for email: ${validatedData.email}`);

    // リポジトリを初期化
    const customerRepo = new CustomerRepository();

    // 顧客を検索
    const customer = await customerRepo.findByTenantAndOrgAndCustomerEmail(
      validatedData.tenantId,
      validatedData.orgId,
      validatedData.email
    );

    if (!customer) {
      console.warn(`[API /api/auth/session] Customer not found: ${validatedData.email}`);
      return NextResponse.json(
        { error: 'ユーザーが存在しません' },
        { status: 401 }
      );
    }

    if (!customer.password_hash) {
      console.warn(`[API /api/auth/session] Customer has no password hash: ${validatedData.email}`);
      return NextResponse.json(
        { error: 'パスワードが設定されていません' },
        { status: 401 }
      );
    }

    // パスワードを照合
    const isPasswordValid = await verifyPassword(validatedData.password, customer.password_hash);

    if (!isPasswordValid) {
      console.warn(`[API /api/auth/session] Invalid password for customer: ${validatedData.email}`);
      return NextResponse.json(
        { error: 'パスワードが正しくありません' },
        { status: 401 }
      );
    }

    // 顧客名を優先順位に従って決定
    const customerName = 
      customer.last_name && customer.first_name
        ? `${customer.last_name} ${customer.first_name}` // 姓と名が両方ある場合
        : customer.email ?? // 次にメールアドレス
        customer.line_user_name ?? // 次にLINEユーザー名
        '不明'; // いずれもない場合

    // JWTペイロードを作成
    const payload: SessionPayload = {
      customerUid: customer.uid,
      email: customer.email || '',
      customerName: customerName,
      tenantId: validatedData.tenantId as Id<"tenant">,
      lineUserId: customer.line_id || undefined,
      lineUserName: customer.line_user_name || undefined,
      orgId: validatedData.orgId as Id<"organization">,
      target_type: customer.customer_type as SessionPayload['target_type'],
    };

    // JWTトークンを生成
    const token = jwt.sign(payload, APP_JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // HTTPOnlyクッキーを設定
    const cookieStore = await cookies();
    cookieStore.set(LOGIN_SESSION_KEY, token, {
      httpOnly: true,
      secure: getEnv('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30日
    });

    console.log(`[API /api/auth/session] Successfully created session for customer: ${customer.uid}`);

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('[API /api/auth/session] Error during login:', error);

    // Zodバリデーションエラー
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'バリデーションエラー', details: error.errors },
        { status: 400 }
      );
    }

    // その他のエラー
    return NextResponse.json(
      { error: '内部サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const requestedTenantId = searchParams.get('tenantId')
  const requestedOrgId = searchParams.get('orgId')
  if (!requestedTenantId || !requestedOrgId) {
    return NextResponse.json({ error: 'Missing store information' }, { status: 400 })
  }
  const session = await getCustomerSession()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 401 })
  if (session.tenantId !== requestedTenantId || session.orgId !== requestedOrgId) {
    return NextResponse.json({ error: 'この店舗で再度ログインしてください' }, { status: 401 })
  }
  const legacyName = (session as SessionPayload & { name?: unknown }).name
  const currentSession =
    !session.customerName && typeof legacyName === 'string'
      ? { ...session, customerName: legacyName }
      : session
  return NextResponse.json({ session: currentSession }, { status: 200 })
}
