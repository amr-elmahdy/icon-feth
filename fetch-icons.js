const fs = require('fs');
const path = require('path');

const LIST_FILE = path.join(__dirname, 'icon-list.txt');
const OUTPUT_DIR = path.join(__dirname, 'icons');
const THESVG_DIR = process.env.THESVG_DIR || '/tmp/thesvg';
const THESVG_ICONS = path.join(THESVG_DIR, 'public', 'icons');

// Variant priority: try most colorful variants first
const VARIANT_PRIORITY = [
  'default',
  'color',
  'original',
  'mono',
];

/**
 * Find the best SVG file for the given icon name.
 * Tries variants in priority order, then falls back to single-file layout.
 */
function findIconFile(name) {
  // Variant-based layout: icons/{name}/{variant}.svg
  if (fs.existsSync(path.join(THESVG_ICONS, name))) {
    for (const variant of VARIANT_PRIORITY) {
      const filePath = path.join(THESVG_ICONS, name, `${variant}.svg`);
      if (fs.existsSync(filePath)) {
        return { path: filePath, variant };
      }
    }
  }
  
  // Single-file layout: icons/{name}.svg
  const singleFile = path.join(THESVG_ICONS, `${name}.svg`);
  if (fs.existsSync(singleFile)) {
    return { path: singleFile, variant: 'single' };
  }
  
  return null;
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function main() {
  if (!fs.existsSync(LIST_FILE)) {
    console.error('❌ icon-list.txt not found');
    process.exit(1);
  }
  
  if (!fs.existsSync(THESVG_ICONS)) {
    console.error(`❌ theSVG icons not found at ${THESVG_ICONS}`);
    console.error('   Make sure the repository is cloned first.');
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
  const missing = [];
  
  for (const rawName of names) {
    const id = normalizeName(rawName);
    const dest = path.join(OUTPUT_DIR, `${id}.svg`);
    
    const found = findIconFile(id);
    if (!found) {
      missing.push(rawName);
      continue;
    }
    
    const svgContent = fs.readFileSync(found.path, 'utf8');
    
    // Skip if identical content exists
    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, 'utf8');
      if (existing === svgContent) {
        skipped++;
        continue;
      }
      fs.writeFileSync(dest, svgContent);
      updated++;
    } else {
      fs.writeFileSync(dest, svgContent);
      added++;
    }
  }
  
  console.log('');
  console.log('📊 Fetch Summary');
  console.log('─'.repeat(40));
  console.log(`✅ Added:    ${added}`);
  console.log(`🔄 Updated:  ${updated}`);
  console.log(`⏭️  Skipped:  ${skipped}`);
  console.log(`📦 Total:    ${added + updated + skipped}`);
  console.log('─'.repeat(40));
  
  if (missing.length > 0) {
    console.warn(`⚠️  Missing ${missing.length} icon(s):`);
    missing.forEach(name => console.warn(`   - ${name}`));
  }
}

main();