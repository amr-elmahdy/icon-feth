const fs = require('fs');
const path = require('path');

const LIST_FILE = path.join(__dirname, 'icon-list.txt');
const OUTPUT_DIR = path.join(__dirname, 'icons');
const SOURCE_DIR = path.join(__dirname, 'node_modules', 'simple-icons', 'icons');

/**
 * Moves fill/color from the root <svg> tag to inner elements.
 * This ensures colors survive when the SVG content is later extracted
 * and reused inside another wrapper SVG.
 */
function cleanIconSvg(rawSvg) {
  const rootFillMatch = rawSvg.match(/<svg[^>]*\s(fill|color)="([^"]+)"/i);
  if (!rootFillMatch) return rawSvg;
  
  const attrName = rootFillMatch[1];
  const colorValue = rootFillMatch[2];
  
  let cleaned = rawSvg.replace(
    new RegExp(`\\s${attrName}="${colorValue}"`, 'i'),
    ''
  );
  
  cleaned = cleaned.replace(
    /<(path|circle|rect|polygon|polyline|line|ellipse)([^>]*?)(\/?)>/gi,
    (match, tag, attrs, selfClose) => {
      if (/\sfill=/i.test(attrs) || /\scolor=/i.test(attrs)) return match;
      return `<${tag}${attrs} fill="${colorValue}"${selfClose}>`;
    }
  );
  
  return cleaned;
}

/**
 * Normalizes an icon name to a safe lowercase id.
 */
function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Main function.
 */
function main() {
  if (!fs.existsSync(LIST_FILE)) {
    console.error('❌ icon-list.txt not found');
    process.exit(1);
  }
  
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error('❌ simple-icons not installed. Run "npm install" first.');
    process.exit(1);
  }
  
  const names = fs
    .readFileSync(LIST_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  
  if (names.length === 0) {
    console.error('❌ icon-list.txt is empty');
    process.exit(1);
  }
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let cleanedCount = 0;
  const missing = [];
  
  for (const rawName of names) {
    const id = normalizeName(rawName);
    const src = path.join(SOURCE_DIR, `${id}.svg`);
    const dest = path.join(OUTPUT_DIR, `${id}.svg`);
    
    if (!fs.existsSync(src)) {
      missing.push(rawName);
      continue;
    }
    
    const rawSvg = fs.readFileSync(src, 'utf8');
    const cleanedSvg = cleanIconSvg(rawSvg);
    
    if (cleanedSvg !== rawSvg) cleanedCount++;
    
    // Skip if identical content already exists
    if (fs.existsSync(dest)) {
      const existingSvg = fs.readFileSync(dest, 'utf8');
      if (existingSvg === cleanedSvg) {
        skipped++;
        continue;
      }
      fs.writeFileSync(dest, cleanedSvg);
      updated++;
    } else {
      fs.writeFileSync(dest, cleanedSvg);
      added++;
    }
  }
  
  console.log(`✅ Added: ${added}`);
  console.log(`🔄 Updated: ${updated}`);
  console.log(`⏭️  Skipped (no changes): ${skipped}`);
  console.log(`🎨 Cleaned (root fill moved): ${cleanedCount}`);
  
  if (missing.length > 0) {
    console.warn(`⚠️  Missing ${missing.length} icon(s):`);
    missing.forEach(name => console.warn(`   - ${name}`));
  }
}

main();