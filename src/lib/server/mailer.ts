import nodemailer from 'nodemailer';

import { readOptionalEnv } from '@/lib/server/env';

interface PasswordResetMailInput {
  requestEmail: string;
  requestPhone: string;
  requestedAtIso: string;
  deviceId?: string | null;
  sourceIp?: string | null;
}

function parsePort(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port number.');
  }
  return Math.floor(parsed);
}

function parseBoolean(raw: string, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function readMailConfig() {
  const host = readOptionalEnv('SMTP_HOST');
  const portRaw = readOptionalEnv('SMTP_PORT');
  const user = readOptionalEnv('SMTP_USER');
  const pass = readOptionalEnv('SMTP_PASS');
  const from = readOptionalEnv('SMTP_FROM');
  const secureRaw = readOptionalEnv('SMTP_SECURE');
  const notifyTo = readOptionalEnv('PASSWORD_RESET_NOTIFY_TO', 'takundanyamandi@gmail.com');

  if (!host || !portRaw || !user || !pass || !from) {
    throw new Error(
      'SMTP mailer is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.'
    );
  }

  const port = parsePort(portRaw);
  const secure = parseBoolean(secureRaw, port === 465);

  return { host, port, user, pass, from, secure, notifyTo };
}

export async function sendPasswordResetRequestMail(input: PasswordResetMailInput): Promise<void> {
  const config = readMailConfig();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const bodyLines = [
    'A password reset request was submitted from the mobile app.',
    '',
    `Registered email: ${input.requestEmail}`,
    `Phone number: ${input.requestPhone}`,
    `Requested at (UTC): ${input.requestedAtIso}`,
    `Device ID: ${input.deviceId ?? 'unknown'}`,
    `Source IP: ${input.sourceIp ?? 'unknown'}`,
    '',
    'This request must be completed by IT Admin in the secure web IT admin page.',
  ];

  await transporter.sendMail({
    from: config.from,
    to: config.notifyTo,
    subject: `StockMind password reset request: ${input.requestEmail}`,
    text: bodyLines.join('\n'),
  });
}

