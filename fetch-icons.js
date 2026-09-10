const fs = require('fs');
const path = require('path');

const LIST_FILE = path.join(__dirname, 'icon-list.txt');
const OUTPUT_DIR = path.join(__dirname, 'icons');
const LOGS_DIR = path.join(__dirname, 'logs');
const THESVG_DIR = process.env.THESVG_DIR || '/tmp/thesvg';
const THESVG_ICONS = path.join(THESVG_DIR, 'public', 'icons');

const VARIANT_PRIORITY = ['default', 'color', 'original', 'mono'];

// ---------- Utilities ----------

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Find the best SVG file for an icon, trying variants in priority order.
 * Returns { path, variant } or null.
 */
function findIconFile(name) {
  const iconDir = path.join(THESVG_ICONS, name);
  
  if (fs.existsSync(iconDir) && fs.statSync(iconDir).isDirectory()) {
    for (const variant of VARIANT_PRIORITY) {
      const filePath = path.join(iconDir, `${variant}.svg`);
      if (fs.existsSync(filePath)) {
        return { path: filePath, variant };
      }
    }
  }
  
  const singleFile = path.join(THESVG_ICONS, `${name}.svg`);
  if (fs.existsSync(singleFile)) {
    return { path: singleFile, variant: 'single' };
  }
  
  return null;
}

/**
 * Ensure every visible element has an explicit fill attribute.
 * If the root <svg> has fill/color, move it to inner elements.
 * This makes the icon safe to reuse inside another wrapper SVG.
 */
function normalizeFill(svgContent) {
  const rootFillMatch = svgContent.match(/<svg[^>]*\s(fill|color)="([^"]+)"/i);
  if (!rootFillMatch) return svgContent;
  
  const color = rootFillMatch[2];
  
  // Remove the root-level fill/color attribute
  let cleaned = svgContent.replace(
    new RegExp(`\\s${rootFillMatch[1]}="${color}"`, 'i'),
    ''
  );
  
  // Add fill to inner elements that don't already have one
  cleaned = cleaned.replace(
    /<(path|circle|rect|polygon|polyline|line|ellipse)([^>]*?)(\/?)>/gi,
    (match, tag, attrs, selfClose) => {
      if (/\sfill=/i.test(attrs) || /\sstyle=/i.test(attrs)) return match;
      return `<${tag}${attrs} fill="${color}"${selfClose}>`;
    }
  );
  
  return cleaned;
}

/**
 * Insert metadata as an XML comment inside the SVG.
 * The comment is invisible when rendered but travels with the file.
 */
function addMetadataComment(svgContent, metadata) {
  const lines = [
    '<!--',
    `  name: ${metadata.name}`,
    `  source: ${metadata.source}`,
    `  source_url: ${metadata.source_url}`,
    `  license: ${metadata.license}`,
    `  variant: ${metadata.variant}`,
    `  fetched: ${metadata.fetched}`,
    '-->',
  ];
  
  // Insert right after the opening <svg ...> tag
  return svgContent.replace(
    /(<svg[^>]*>)/i,
    `$1\n${lines.join('\n')}`
  );
}

// ---------- Logging ----------

function initLog() {
  ensureDir(LOGS_DIR);
  const lines = [
    '========================================',
    '  Icon Fetcher Log',
    `  Started: ${new Date().toISOString()}`,
    '========================================',
    '',
  ];
  fs.writeFileSync(path.join(LOGS_DIR, 'fetch-log.txt'), lines.join('\n'));
}

function appendLog(message) {
  fs.appendFileSync(path.join(LOGS_DIR, 'fetch-log.txt'), message + '\n');
}

function writeFailedLog(failures) {
  const lines = [
    '# Failed Icons',
    `# Generated: ${new Date().toISOString()}`,
    `# Total: ${failures.length}`,
    '',
  ];
  
  for (const f of failures) {
    lines.push(`[${f.name}]`);
    lines.push(`  reason: ${f.reason}`);
    if (f.tried_variants && f.tried_variants.length > 0) {
      lines.push(`  tried_variants: ${f.tried_variants.join(', ')}`);
    }
    lines.push('');
  }
  
  fs.writeFileSync(path.join(LOGS_DIR, 'failed.txt'), lines.join('\n'));
}

// ---------- Main ----------

function main() {
  initLog();
  
  if (!fs.existsSync(LIST_FILE)) {
    appendLog('❌ icon-list.txt not found');
    console.error('❌ icon-list.txt not found');
    process.exit(1);
  }
  
  if (!fs.existsSync(THESVG_ICONS)) {
    appendLog(`❌ theSVG icons not found at ${THESVG_ICONS}`);
    console.error(`❌ theSVG icons not found at ${THESVG_ICONS}`);
    process.exit(1);
  }
  
  const names = fs
    .readFileSync(LIST_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  
  appendLog(`📋 Total icons requested: ${names.length}`);
  appendLog('');
  
  ensureDir(OUTPUT_DIR);
  
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let normalized = 0;
  const failures = [];
  
  for (const rawName of names) {
    const id = normalizeName(rawName);
    const dest = path.join(OUTPUT_DIR, `${id}.svg`);
    
    const found = findIconFile(id);
    
    if (!found) {
      failures.push({
        name: rawName,
        reason: 'Not found in theSVG (no matching variant)',
        tried_variants: VARIANT_PRIORITY,
      });
      appendLog(`❌ [${id}] Not found`);
      continue;
    }
    
    const rawSvg = fs.readFileSync(found.path, 'utf8');
    const filled = normalizeFill(rawSvg);
    
    if (filled !== rawSvg) {
      normalized++;
      appendLog(`🎨 [${id}] Fill normalized (variant: ${found.variant})`);
    }
    
    const withMeta = addMetadataComment(filled, {
      name: id,
      source: 'theSVG',
      source_url: `https://thesvg.org/${id}`,
      license: 'See NOTICE.md',
      variant: found.variant,
      fetched: new Date().toISOString().split('T')[0],
    });
    
    // Skip if identical
    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, 'utf8');
      if (existing === withMeta) {
        skipped++;
        appendLog(`⏭️  [${id}] Skipped (no changes)`);
        continue;
      }
      fs.writeFileSync(dest, withMeta);
      updated++;
      appendLog(`🔄 [${id}] Updated`);
    } else {
      fs.writeFileSync(dest, withMeta);
      added++;
      appendLog(`✅ [${id}] Added (variant: ${found.variant})`);
    }
  }
  
  // ---------- Summary ----------
  const summaryLines = [
    '',
    '========================================',
    '  Summary',
    '========================================',
    `  Added:      ${added}`,
    `  Updated:    ${updated}`,
    `  Skipped:    ${skipped}`,
    `  Normalized: ${normalized}`,
    `  Failed:     ${failures.length}`,
    `  Total:      ${added + updated + skipped}`,
    `  Finished:   ${new Date().toISOString()}`,
    '========================================',
  ];
  
  for (const line of summaryLines) appendLog(line);
  console.log(summaryLines.join('\n'));
  
  if (failures.length > 0) {
    writeFailedLog(failures);
    console.log(`\n⚠️  Failed icons written to logs/failed.txt`);
  } else {
    // Clear previous failed.txt if no failures
    const failedPath = path.join(LOGS_DIR, 'failed.txt');
    if (fs.existsSync(failedPath)) fs.unlinkSync(failedPath);
  }
}

main();