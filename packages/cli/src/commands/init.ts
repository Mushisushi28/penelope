import { Command } from 'commander';
import { input, select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync, writeFileSync, existsSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Verticals ─────────────────────────────────────────────────────────────────
const VERTICALS = [
  { value: 'auto-service',       name: 'Auto Service  (detailing, headlight restore, mechanic)' },
  { value: 'home-services',      name: 'Home Services (cleaning, landscaping, handyman)' },
  { value: 'personal-services',  name: 'Personal Services (salon, barber, massage, fitness)' },
  { value: 'food-service',       name: 'Food Service (restaurant, catering, food truck)' },
  { value: 'retail',             name: 'Retail (shop, boutique, e-commerce)' },
  { value: 'generic',            name: 'Generic (other / custom)' },
] as const;

export type Vertical = typeof VERTICALS[number]['value'];

// ── Channels ──────────────────────────────────────────────────────────────────
const CHANNEL_OPTIONS = [
  {
    value: 'telegram-owner',
    name: 'Telegram (owner chat)',
    hint: 'Required. Create a bot at https://t.me/BotFather → set TELEGRAM_BOT_TOKEN',
  },
  {
    value: 'fb-page',
    name: 'Facebook Page Messenger',
    hint: 'Needs FB_PAGE_TOKEN + FB_VERIFY_TOKEN in tenant .env',
  },
  {
    value: 'twilio-sms',
    name: 'Twilio SMS',
    hint: 'Needs TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER',
  },
  {
    value: 'imap-smtp',
    name: 'Email (IMAP/SMTP)',
    hint: 'Needs IMAP_HOST, IMAP_USER, IMAP_PASS, SMTP_HOST, SMTP_PORT',
  },
  {
    value: 'instagram',
    name: 'Instagram DMs',
    hint: 'Needs IG_ACCESS_TOKEN (same Meta app as FB page)',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function scaffoldDir(base: string): void {
  for (const sub of ['agents', 'state', 'dashboard', 'procedures']) {
    mkdirSync(join(base, sub), { recursive: true });
  }
}

interface TenantConfig {
  name: string;
  slug: string;
  vertical: string;
  channels: string[];
  quietHours: { start: string; end: string };
  briefTime: string;
  telegramBotToken?: string;
  createdAt: string;
  version: string;
}

function writeEnvStub(tenantDir: string, channels: string[]): void {
  const lines: string[] = [
    '# Penelope tenant environment — fill in secrets before running `penelope up`',
    '',
  ];

  if (channels.includes('telegram-owner')) {
    lines.push('TELEGRAM_BOT_TOKEN=');
    lines.push('TELEGRAM_OWNER_CHAT_ID=');
    lines.push('');
  }
  if (channels.includes('fb-page')) {
    lines.push('FB_PAGE_TOKEN=');
    lines.push('FB_VERIFY_TOKEN=');
    lines.push('FB_PAGE_ID=');
    lines.push('');
  }
  if (channels.includes('twilio-sms')) {
    lines.push('TWILIO_ACCOUNT_SID=');
    lines.push('TWILIO_AUTH_TOKEN=');
    lines.push('TWILIO_FROM_NUMBER=');
    lines.push('');
  }
  if (channels.includes('imap-smtp')) {
    lines.push('IMAP_HOST=');
    lines.push('IMAP_PORT=993');
    lines.push('IMAP_USER=');
    lines.push('IMAP_PASS=');
    lines.push('SMTP_HOST=');
    lines.push('SMTP_PORT=587');
    lines.push('SMTP_USER=');
    lines.push('SMTP_PASS=');
    lines.push('');
  }
  if (channels.includes('instagram')) {
    lines.push('IG_ACCESS_TOKEN=');
    lines.push('');
  }

  writeFileSync(join(tenantDir, '.env.example'), lines.join('\n'));
}

function copyVerticalTemplates(vertical: string, tenantDir: string): void {
  // Try to copy from examples/<vertical>/procedures/ if it exists
  const repoRoot = resolve(__dirname, '..', '..', '..', '..');
  const templateSrc = join(repoRoot, 'examples', vertical, 'procedures');
  const targetProcedures = join(tenantDir, 'procedures');

  if (existsSync(templateSrc)) {
    try {
      cpSync(templateSrc, targetProcedures, { recursive: true });
    } catch {
      // silently skip — templates are optional at this stage
    }
  } else {
    // Write a placeholder procedure YAML
    const placeholder = [
      `# ${vertical} procedures — customise these for your business`,
      '',
      'greeting:',
      '  tone: friendly',
      '  message: "Hi! Thanks for reaching out. How can I help you today?"',
      '',
      'qualification:',
      '  questions:',
      '    - "What service are you looking for?"',
      '    - "What is your location or service area?"',
      '',
      'closing:',
      '  message: "Thanks! We will get back to you shortly."',
    ].join('\n');

    writeFileSync(join(targetProcedures, 'default.yaml'), placeholder);
  }
}

// ── Command ───────────────────────────────────────────────────────────────────
export function makeInitCommand(): Command {
  const cmd = new Command('init');
  cmd
    .description('Scaffold a new Penelope tenant (5 questions, ~90 seconds)')
    .option('--cwd <path>', 'output directory (default: current dir)', process.cwd())
    .option('--tenants-dir <path>', 'path to tenants directory (overrides <cwd>/tenants)')
    .action(async (opts: { cwd: string; tenantsDir?: string }) => {
      const outDir = resolve(opts.cwd);

      console.log(chalk.cyan('\n  Penelope tenant setup — 5 quick questions\n'));

      // ── Step 1: Business name + slug ─────────────────────────────────────
      const businessName = await input({
        message: 'Business name?',
        validate: (v) => v.trim().length > 0 || 'Name cannot be empty',
      });

      const derivedSlug = toSlug(businessName);
      const useSlug = await confirm({
        message: `Tenant slug: ${chalk.yellow(derivedSlug)} — looks good?`,
        default: true,
      });

      const slug = useSlug
        ? derivedSlug
        : await input({
            message: 'Custom slug (lowercase, hyphens only):',
            validate: (v) =>
              /^[a-z0-9-]+$/.test(v.trim()) || 'Slug must be lowercase letters, digits, hyphens',
          });

      // ── Step 2: Vertical ─────────────────────────────────────────────────
      const vertical = await select({
        message: 'Business vertical?',
        choices: VERTICALS.map((v) => ({ value: v.value, name: v.name })),
      });

      // ── Step 3: Channels ─────────────────────────────────────────────────
      const selectedChannels = await checkbox({
        message: 'Channels to enable? (space to select, enter to confirm)',
        choices: CHANNEL_OPTIONS.map((c) => ({
          value: c.value,
          name: c.name,
          checked: c.value === 'telegram-owner',
        })),
      });

      const channels = selectedChannels.length > 0 ? selectedChannels : ['telegram-owner'];

      // Show installation hints
      console.log();
      for (const ch of channels) {
        const opt = CHANNEL_OPTIONS.find((c) => c.value === ch);
        if (opt) console.log(chalk.dim(`  ${ch}: ${opt.hint}`));
      }
      console.log();

      // ── Step 4: Quiet hours + brief time ─────────────────────────────────
      const quietStart = await input({
        message: 'Quiet hours start (24h, e.g. 22:00):',
        default: '22:00',
      });
      const quietEnd = await input({
        message: 'Quiet hours end (24h, e.g. 07:00):',
        default: '07:00',
      });
      const briefTime = await input({
        message: 'Daily brief time (24h, e.g. 08:00):',
        default: '08:00',
      });

      // ── Step 5: Telegram bot token ───────────────────────────────────────
      console.log(
        chalk.dim(
          '\n  Step 5: Telegram bot token (for owner notifications)\n' +
            '  → Create a bot at https://t.me/BotFather → /newbot\n' +
            '  → You can skip this and set TELEGRAM_BOT_TOKEN in .env later\n'
        )
      );
      const telegramBotToken = await input({
        message: 'Telegram bot token (leave blank to set later):',
        default: '',
      });

      // ── Scaffold ─────────────────────────────────────────────────────────
      const spinner = ora('Scaffolding tenant…').start();

      const tenantsRoot = opts.tenantsDir ? resolve(opts.tenantsDir) : join(outDir, 'tenants');
      const tenantDir = join(tenantsRoot, slug);

      try {
        scaffoldDir(tenantDir);
        copyVerticalTemplates(vertical, tenantDir);

        const config: TenantConfig = {
          name: businessName,
          slug,
          vertical,
          channels,
          quietHours: { start: quietStart, end: quietEnd },
          briefTime,
          createdAt: new Date().toISOString(),
          version: '0.1.0',
          ...(telegramBotToken ? { telegramBotToken } : {}),
        };

        writeFileSync(join(tenantDir, 'tenant.json'), JSON.stringify(config, null, 2));
        writeEnvStub(tenantDir, channels);
        writeFileSync(join(tenantDir, 'state', '.gitkeep'), '');
        writeFileSync(join(tenantDir, 'agents', '.gitkeep'), '');
        writeFileSync(join(tenantDir, 'dashboard', '.gitkeep'), '');

        spinner.succeed('Tenant scaffolded');
      } catch (err) {
        spinner.fail('Scaffold failed');
        throw err;
      }

      // ── Success output ────────────────────────────────────────────────────
      console.log(`
${chalk.green('  ✓ Tenant created:')} ${chalk.bold(businessName)} (${slug})

  ${chalk.cyan('tenants/')}${slug}/
  ├── tenant.json        ← config
  ├── .env.example       ← fill in secrets
  ├── procedures/        ← conversation scripts
  ├── agents/            ← per-agent persona files
  ├── state/             ← runtime DB (SQLite)
  └── dashboard/         ← Odysseus dashboard assets

  ${chalk.bold('Next steps:')}
  1. Fill in ${chalk.yellow(`${slug}/.env.example`)} inside your tenants dir → rename to ${chalk.yellow('.env')}
  2. Run ${chalk.cyan('penelope up')} to start the agents
  3. Chat with your bot on Telegram

  ${chalk.dim('Tip: penelope doctor  checks your setup before going live')}
`);
    });

  return cmd;
}
