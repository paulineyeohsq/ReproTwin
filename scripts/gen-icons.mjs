// One-off script to generate PWA app icons from a hand-authored SVG.
// Run with: node scripts/gen-icons.mjs
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#0e6e63"/>
  <path d="M256 96c-70 0-126 56-126 126 0 94 126 194 126 194s126-100 126-194c0-70-56-126-126-126z" fill="#ffffff"/>
  <circle cx="256" cy="222" r="52" fill="#0e6e63"/>
  <path d="M210 222c0-8 4-15 10-19" stroke="#5fcbb8" stroke-width="10" stroke-linecap="round" fill="none"/>
</svg>`;

const outDir = path.resolve("public", "icons");
mkdirSync(outDir, { recursive: true });

const sizes = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "maskable-512.png", size: 512, padding: true },
];

for (const { file, size, padding } of sizes) {
  const buf = Buffer.from(svg);
  let pipeline = sharp(buf).resize(size, size);
  if (padding) {
    // Maskable icons need safe-zone padding (~10%) so OS masks don't clip content.
    const inner = Math.round(size * 0.8);
    pipeline = sharp(buf)
      .resize(inner, inner)
      .extend({
        top: Math.round((size - inner) / 2),
        bottom: Math.round((size - inner) / 2),
        left: Math.round((size - inner) / 2),
        right: Math.round((size - inner) / 2),
        background: "#0e6e63",
      });
  }
  await pipeline.png().toFile(path.join(outDir, file));
  console.log("wrote", file);
}

writeFileSync(path.join("public", "icon.svg"), svg.trim());
console.log("wrote icon.svg");
