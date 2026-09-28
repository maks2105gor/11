// Assembles the "Игры" Android app in www/: the game menu at the root and both games
// in their own folders, all working without internet.
//
//   www/index.html            game menu (portal/)
//   www/amazing-table/        Amazing Table
//   www/cards/index.html      card table (Fifth card, Blackjack)
//   www/fonts/                Oswald, PT Sans, PT Serif (instead of Google Fonts)
//
// Links that lead to the websites (games / amazin-table / play.myosincos.info) are
// pointed at the pages inside the app, and the service worker is left out because
// the files already ship inside the APK.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(app, '..');
const www = join(app, 'www');

// Replaces text in a page and fails loudly if the page changed and the text is gone,
// so a silent miss can never ship a link that leaves the app.
function edit(html, file, rules) {
  for (const [pattern, value, what] of rules) {
    const next = html.replace(pattern, value);
    if (next === html) throw new Error(`${file}: ${what} not found, update build-www.mjs`);
    html = next;
  }
  return html;
}
const googleFonts = (fontsPath) => [
  [/\s*<link rel="preconnect"[^>]*>\s*<link rel="preconnect"[^>]*>/, '', 'font preconnects'],
  [/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/,
    `<link rel="stylesheet" href="${fontsPath}">`, 'Google Fonts link'],
];
const noManifest = [/\s*<link rel="manifest"[^>]*>/, '', 'manifest link'];

rmSync(www, { recursive: true, force: true });
mkdirSync(join(www, 'amazing-table'), { recursive: true });
mkdirSync(join(www, 'cards'), { recursive: true });
cpSync(join(app, 'fonts'), join(www, 'fonts'), { recursive: true });

// Game menu
cpSync(join(repo, 'portal', 'icons'), join(www, 'icons'), { recursive: true });
cpSync(join(repo, 'portal', 'icon.svg'), join(www, 'icon.svg'));
writeFileSync(join(www, 'index.html'), edit(readFileSync(join(repo, 'portal', 'index.html'), 'utf8'), 'portal/index.html', [
  ...googleFonts('fonts/fonts.css'),
  noManifest,
  [/href="https:\/\/play\.myosincos\.info\/"/, 'href="cards/index.html"', 'card table link'],
  [/href="https:\/\/amazin-table\.myosincos\.info\/"/, 'href="amazing-table/index.html"', 'Amazing Table link'],
]));

// Amazing Table
for (const item of ['css', 'js', 'icon.svg']) {
  cpSync(join(repo, item), join(www, 'amazing-table', item), { recursive: true });
}
writeFileSync(join(www, 'amazing-table', 'index.html'), edit(readFileSync(join(repo, 'index.html'), 'utf8'), 'index.html', [
  ...googleFonts('../fonts/fonts.css'),
  noManifest,
  [/<meta name="portal-url" content="[^"]*">/, '<meta name="portal-url" content="../index.html">', 'portal-url meta'],
]));

// Card table
writeFileSync(join(www, 'cards', 'index.html'), edit(readFileSync(join(repo, 'cards', 'index.html'), 'utf8'), 'cards/index.html', [
  [/href="https:\/\/games\.myosincos\.info\/"/, 'href="../index.html"', '"all games" link'],
]));

// Nothing in the app may point at the websites any more.
for (const page of ['index.html', 'amazing-table/index.html', 'cards/index.html']) {
  const html = readFileSync(join(www, page), 'utf8');
  const leak = html.match(/https:\/\/(games|play|amazin-table)\.myosincos\.info[^"']*/);
  if (leak) throw new Error(`${page} still links to ${leak[0]}`);
}
console.log(`www/ ready: ${www}`);
