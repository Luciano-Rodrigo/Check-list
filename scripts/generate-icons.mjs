import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const source = "assets/luma-logo.svg";
const targets = [
  ["assets/icon-192.png", 192],
  ["assets/icon-512.png", 512],
  ["assets/apple-touch-icon.png", 180],
  ["assets/favicon-32.png", 32],
  ["assets/favicon-16.png", 16]
];

await mkdir("assets", { recursive: true });

for (const [file, size] of targets) {
  await sharp(source).resize(size, size).png().toFile(file);
}

console.log("PWA icons generated.");
