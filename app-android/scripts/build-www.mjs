// Copies the game into www/ for the Android app:
// - the fonts come from app-android/fonts, so the app works without internet;
// - the link to the game menu (games.myosincos.info) is removed, it would leave the app;
// - the service worker is left out, the files are already inside the APK.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(app, '..');
const www = join(app, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const item of ['css', 'js', 'icon.svg']) cpSync(join(repo, item), join(www, item), { recursive: true });
cpSync(join(app, 'fonts'), join(www, 'fonts'), { recursive: true });

let html = readFileSync(join(repo, 'index.html'), 'utf8');
const replace = (pattern, value, what) => {
  const next = html.replace(pattern, value);
  if (next === html) throw new Error(`index.html: ${what} not found, update build-www.mjs`);
  html = next;
};
replace(/\s*<!-- Address of the game menu[^>]*-->\s*<meta name="portal-url"[^>]*>/, '', 'portal-url meta');
replace(/\s*<link rel="manifest"[^>]*>/, '', 'manifest link');
replace(/\s*<link rel="preconnect"[^>]*>\s*<link rel="preconnect"[^>]*>/, '', 'font preconnects');
replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/,
  '<link rel="stylesheet" href="fonts/fonts.css">', 'Google Fonts link');
writeFileSync(join(www, 'index.html'), html);

console.log(`www/ ready: ${www}`);
