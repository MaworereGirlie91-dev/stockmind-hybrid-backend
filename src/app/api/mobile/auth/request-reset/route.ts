import { NextRequest, NextResponse } from 'next/server';

import {
  createPasswordResetRequest,
  findAccountByEmail,
  markPasswordResetNotification,
  normalizeEmail,
} from '@/lib/server/accounts';
import { readClientIp, readDeviceId } from '@/lib/server/auth';
import { sendPasswordResetRequestMail } from '@/lib/server/mailer';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { normalizeRequiredText } from '@/lib/server/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      phone?: string;
      device_id?: string;
    };

    const email = normalizeEmail(body.email);
    const phone = normalizeRequiredText(body.phone, 48);
    const ip = readClientIp(req);
    const rateKey = `mobile-reset:${ip}:${(email ?? 'unknown').toLowerCase()}`;
    const rate = consumeRateLimit({
      key: rateKey,
      maxAttempts: 8,
      windowMs: 15 * 60 * 1000,
    });

    if (!rate.allowed) {
      const response = NextResponse.json(
        {
          error: 'Too many reset requests. Try again later.',
          retry_after_seconds: rate.retryAfterSeconds,
        },
        { status: 429 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    if (!email || !phone) {
      const response = NextResponse.json(
        { error: 'Registered email and phone number are required.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const account = await findAccountByEmail(email);
    if (!account || account.deleted_at || !account.is_active) {
      const response = NextResponse.json(
        { error: 'No active account found for this email.' },
        { status: 404 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const deviceId = body.device_id?.trim() || readDeviceId(req);
    const record = await createPasswordResetRequest({
      email,
      phone,
      deviceId,
      ip,
    });

    try {
      await sendPasswordResetRequestMail({
        requestEmail: record.email,
        requestPhone: record.phone,
        requestedAtIso: record.requested_at,
        deviceId: record.requested_device_id,
        sourceIp: record.requested_from_ip,
      });
      await markPasswordResetNotification({
        requestId: record.id,
        sent: true,
      });
    } catch (notifyError) {
      const message =
        notifyError instanceof Error
          ? notifyError.message
          : 'Notification delivery failed.';
      await markPasswordResetNotification({
        requestId: record.id,
        sent: false,
        errorMessage: message,
      });

      const response = NextResponse.json(
        {
          error:
            'Password reset request was stored, but email notification failed. Check SMTP configuration.',
        },
        { status: 500 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const response = NextResponse.json({
      ok: true,
      message: 'Password reset request submitted for IT admin review.',
      request_id: record.id,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to submit reset request.';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

