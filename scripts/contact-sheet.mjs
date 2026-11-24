// node scripts/contact-sheet.mjs out sheet.png [cols] [width]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const [dir, outFile, colsArg, wArg] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const cols = Number(colsArg || 3), w = Number(wArg || 400), h = Math.round(w * 1.25), gap = 12;
const rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(files.map((f) => sharp(path.join(dir, f)).resize(w, h).png().toBuffer()));
await sharp({ create: { width: cols * (w + gap) + gap, height: rows * (h + gap) + gap, channels: 3, background: '#555' } })
  .composite(tiles.map((input, i) => ({ input, left: gap + (i % cols) * (w + gap), top: gap + Math.floor(i / cols) * (h + gap) })))
  .png().toFile(outFile);
console.log(outFile);
