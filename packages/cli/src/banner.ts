import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INLINE_BANNER = `
 ██████╗ ███████╗███╗   ██╗███████╗██╗      ██████╗ ██████╗ ███████╗
 ██╔══██╗██╔════╝████╗  ██║██╔════╝██║     ██╔═══██╗██╔══██╗██╔════╝
 ██████╔╝█████╗  ██╔██╗ ██║█████╗  ██║     ██║   ██║██████╔╝█████╗
 ██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══╝  ██║     ██║   ██║██╔═══╝ ██╔══╝
 ██║     ███████╗██║ ╚████║███████╗███████╗╚██████╔╝██║     ███████╗
 ╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝ ╚═════╝ ╚═╝     ╚══════╝
`;

const TAGLINE = 'She runs the home while Odysseus is away.';

export function printBanner(version?: string): void {
  // Try brand/banner-ascii.txt from repo root first
  const brandBannerPath = join(__dirname, '..', '..', '..', '..', 'brand', 'banner-ascii.txt');
  let bannerText = INLINE_BANNER;

  if (existsSync(brandBannerPath)) {
    try {
      bannerText = readFileSync(brandBannerPath, 'utf8');
    } catch {
      // fall through to inline
    }
  }

  console.log(chalk.cyan(bannerText));
  console.log(chalk.dim(`  ${TAGLINE}`));
  if (version) {
    console.log(chalk.dim(`  v${version}`));
  }
  console.log();
}
