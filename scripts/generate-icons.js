// One-off script to regenerate the app's icon set (NavBar logo, PWA
// manifest icons, apple-touch-icon, favicon) from the new logo.jpg source
// image dropped at the project root. Run with: node scripts/generate-icons.js
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "logo.jpg");
const ICONS_DIR = path.join(__dirname, "..", "public", "icons");

async function findContentBounds(src) {
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  const THRESH = 230;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (data[idx] < THRESH || data[idx + 1] < THRESH || data[idx + 2] < THRESH) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, width, height };
}

async function main() {
  const bounds = await findContentBounds(SRC);
  const pad = 20;
  const cropLeft = Math.max(0, bounds.minX - pad);
  const cropTop = Math.max(0, bounds.minY - pad);
  const cropWidth = Math.min(bounds.width - cropLeft, bounds.maxX - bounds.minX + pad * 2);
  const cropHeight = Math.min(bounds.height - cropTop, bounds.maxY - bounds.minY + pad * 2);
  const crop = { left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight };
  console.log("content crop:", crop);

  const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

  async function squareIcon(size, outPath) {
    await sharp(SRC)
      .extract(crop)
      .resize(size, size, { fit: "contain", background: WHITE })
      .png()
      .toFile(outPath);
  }

  // Maskable icons need real safe-zone padding — OS launchers may crop to
  // a circle/rounded-square, so content must sit within the inner ~80%.
  async function maskableIcon(size, outPath) {
    const inner = Math.round(size * 0.65);
    const iconBuf = await sharp(SRC)
      .extract(crop)
      .resize(inner, inner, { fit: "contain", background: WHITE })
      .png()
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
      .composite([{ input: iconBuf, gravity: "center" }])
      .png()
      .toFile(outPath);
  }

  await squareIcon(192, path.join(ICONS_DIR, "icon-192.png"));
  await squareIcon(512, path.join(ICONS_DIR, "icon-512.png"));
  await squareIcon(180, path.join(ICONS_DIR, "apple-touch-icon.png"));
  await maskableIcon(512, path.join(ICONS_DIR, "maskable-512.png"));

  // NavBar logo — a modest-resolution PNG for the small in-app badge.
  await squareIcon(128, path.join(__dirname, "..", "public", "logo.png"));

  // Site icon/favicon — Next's App Router serves app/icon.png directly via
  // its file-based metadata convention (no need to hand-roll an .ico
  // container, which Turbopack's dev-mode decoder turned out to be picky
  // about). This replaces app/favicon.ico, which is removed below so the
  // two conventions don't conflict.
  await squareIcon(256, path.join(__dirname, "..", "app", "icon.png"));
  const oldFavicon = path.join(__dirname, "..", "app", "favicon.ico");
  if (fs.existsSync(oldFavicon)) fs.unlinkSync(oldFavicon);

  console.log("Icons regenerated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
