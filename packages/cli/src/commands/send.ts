import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';

const SUPPORTED_CHANNELS = ['telegram-owner', 'fb-page', 'twilio-sms', 'imap-smtp', 'instagram'];

function loadEnv(tenantDir: string): Record<string, string> {
  const envPath = join(tenantDir, '.env');
  if (!existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

async function sendViaTelegram(
  recipient: string,
  text: string,
  env: Record<string, string>
): Promise<void> {
  const token = env['TELEGRAM_BOT_TOKEN'] ?? process.env['TELEGRAM_BOT_TOKEN'];
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({ chat_id: recipient, text });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const json = (await resp.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(json.description ?? 'Telegram API error');
}

async function sendViaTwilio(
  recipient: string,
  text: string,
  env: Record<string, string>
): Promise<void> {
  const sid = env['TWILIO_ACCOUNT_SID'] ?? process.env['TWILIO_ACCOUNT_SID'];
  const auth = env['TWILIO_AUTH_TOKEN'] ?? process.env['TWILIO_AUTH_TOKEN'];
  const from = env['TWILIO_FROM_NUMBER'] ?? process.env['TWILIO_FROM_NUMBER'];

  if (!sid || !auth || !from) throw new Error('TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER not set');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ From: from, To: recipient, Body: text });

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
    },
    body: params.toString(),
  });

  const json = (await resp.json()) as { sid?: string; message?: string };
  if (!json.sid) throw new Error(json.message ?? 'Twilio error');
}

export function makeSendCommand(): Command {
  const cmd = new Command('send');
  cmd
    .description('Send a message directly via a channel (admin/testing tool)')
    .argument('<channel>', `channel adapter: ${SUPPORTED_CHANNELS.join(', ')}`)
    .argument('<recipient>', 'recipient identifier (chat_id, phone number, email, etc.)')
    .argument('<text>', 'message text')
    .option('--slug <slug>', 'tenant slug (to load its .env)')
    .option('--cwd <path>', 'workspace root', process.cwd())
    .option('--tenants-dir <path>', 'path to tenants directory (overrides <cwd>/tenants)')
    .action(
      async (
        channel: string,
        recipient: string,
        text: string,
        opts: { slug?: string; cwd: string; tenantsDir?: string }
      ) => {
        const root = resolve(opts.cwd);
        const tenantsDir = opts.tenantsDir ? resolve(opts.tenantsDir) : join(root, 'tenants');

        // Load env from tenant if slug given
        const env: Record<string, string> = opts.slug
          ? loadEnv(join(tenantsDir, opts.slug))
          : {};

        const spinner = ora(`Sending via ${channel}…`).start();

        try {
          switch (channel) {
            case 'telegram-owner':
              await sendViaTelegram(recipient, text, env);
              break;
            case 'twilio-sms':
              await sendViaTwilio(recipient, text, env);
              break;
            case 'fb-page':
            case 'imap-smtp':
            case 'instagram':
              spinner.warn(`Channel "${channel}" send not implemented in v0.1 — use adapter directly`);
              return;
            default:
              spinner.fail(`Unknown channel "${channel}". Supported: ${SUPPORTED_CHANNELS.join(', ')}`);
              process.exit(1);
          }

          spinner.succeed(`Sent to ${recipient} via ${channel}`);
        } catch (err) {
          spinner.fail(`Send failed: ${(err as Error).message}`);
          process.exit(1);
        }
      }
    );

  return cmd;
}
