const fs = require('fs');
const path = require('path');

const LIST_FILE = path.join(__dirname, 'icons.txt');
const ALIASES_FILE = path.join(__dirname, 'icon-aliases.json');
const OUTPUT_DIR = path.join(__dirname, 'icons');
const LOGS_DIR = path.join(__dirname, 'logs');

const THESVG_DIR = process.env.THESVG_DIR || '/tmp/thesvg';
const THESVG_ICONS = path.join(THESVG_DIR, 'public', 'icons');

const DEVICON_ICONS = path.join(__dirname, 'node_modules', 'devicon', 'icons');
const SIMPLE_ICONS_DIR = path.join(
  __dirname,
  'node_modules',
  'simple-icons',
  'icons'
);

// ---------- Utilities ----------

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAliases() {
  if (!fs.existsSync(ALIASES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(ALIASES_FILE, 'utf8'));
  } catch (err) {
    return {};
  }
}

/**
 * Returns true if a color is black or near-black.
 * Accepts hex (3 or 6 digits, with or without #) and "black".
 */
function isNearBlack(color) {
  if (!color) return false;

  const clean = color.trim().toLowerCase();
  if (clean === 'black') return true;
  if (clean === 'none' || clean === 'transparent') return false;

  const hex = clean.replace(/^#/, '');
  let r, g, b;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return false;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;

  return r < 50 && g < 50 && b < 50;
}

/**
 * Parse icons.txt into a flat list of icon names.
 * - Lines starting with '#' are category headers → ignored
 * - Lines starting with '//' are comments → ignored
 * - Empty lines are ignored
 */
function parseIconsFile() {
  if (!fs.existsSync(LIST_FILE)) return null;

  const lines = fs.readFileSync(LIST_FILE, 'utf8').split('\n');
  const names = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('//')) continue;
    names.push(trimmed);
  }

  return names;
}

// ---------- Source Resolvers ----------

function resolveTheSVG(name, aliases) {
  const candidates = [name, ...(aliases[name] || [])];
  const variants = ['default', 'color', 'original', 'mono'];

  for (const candidate of candidates) {
    const iconDir = path.join(THESVG_ICONS, candidate);
    if (fs.existsSync(iconDir) && fs.statSync(iconDir).isDirectory()) {
      for (const variant of variants) {
        const filePath = path.join(iconDir, `${variant}.svg`);
        if (fs.existsSync(filePath)) {
          return { path: filePath, variant, source: 'theSVG', matched: candidate };
        }
      }
    }
    const singleFile = path.join(THESVG_ICONS, `${candidate}.svg`);
    if (fs.existsSync(singleFile)) {
      return { path: singleFile, variant: 'single', source: 'theSVG', matched: candidate };
    }
  }
  return null;
}

function resolveDevicon(name, aliases) {
  const candidates = [name, ...(aliases[name] || [])];
  const variants = ['original', 'plain', 'line'];

  for (const candidate of candidates) {
    const iconDir = path.join(DEVICON_ICONS, candidate);
    if (fs.existsSync(iconDir) && fs.statSync(iconDir).isDirectory()) {
      for (const variant of variants) {
        const filePath = path.join(iconDir, `${candidate}-${variant}.svg`);
        if (fs.existsSync(filePath)) {
          return {
            path: filePath,
            variant,
            source: 'Devicon',
            matched: candidate,
          };
        }
      }
    }
  }
  return null;
}

function resolveSimpleIcons(name, aliases) {
  const candidates = [name, ...(aliases[name] || [])];

  for (const candidate of candidates) {
    const filePath = path.join(SIMPLE_ICONS_DIR, `${candidate}.svg`);
    if (fs.existsSync(filePath)) {
      return {
        path: filePath,
        variant: 'mono',
        source: 'Simple Icons',
        matched: candidate,
      };
    }
  }
  return null;
}

const SOURCES = [
  { name: 'theSVG', resolve: resolveTheSVG },
  { name: 'Devicon', resolve: resolveDevicon },
  { name: 'Simple Icons', resolve: resolveSimpleIcons },
];

// ---------- SVG Processing ----------

function normalizeFill(svgContent) {
  // --- Case 1: Root <svg> has fill/color ---
  const rootFillMatch = svgContent.match(/<svg[^>]*\s(fill|color)="([^"]+)"/i);

  if (rootFillMatch) {
    const color = rootFillMatch[2];
    let cleaned = svgContent.replace(
      new RegExp(`\\s${rootFillMatch[1]}="${color}"`, 'i'),
      ''
    );
    cleaned = cleaned.replace(
      /<(path|circle|rect|polygon|polyline|line|ellipse)([^>]*?)(\/?)>/gi,
      (match, tag, attrs, selfClose) => {
        if (/\sfill=/i.test(attrs) || /\sstyle=/i.test(attrs)) return match;
        return `<${tag}${attrs} fill="${color}"${selfClose}>`;
      }
    );
    return { content: cleaned, action: 'moved-root-fill' };
  }

  // --- Analyze current fills ---
  const fillMatches = [...svgContent.matchAll(/\bfill=["']([^"']+)["']/gi)];
  const fills = fillMatches.map((m) => m[1]);

  const shapeCount = (
    svgContent.match(/<(path|circle|rect|polygon|polyline|line|ellipse)\b/gi) || []
  ).length;

  // --- Case 2: No fill anywhere + has shape elements ---
  if (fills.length === 0 && shapeCount > 0) {
    const cleaned = svgContent.replace(
      /<(path|circle|rect|polygon|polyline|line|ellipse)([^>]*?)(\/?)>/gi,
      (match, tag, attrs, selfClose) => {
        if (/\sfill=/i.test(attrs) || /\sstyle=/i.test(attrs)) return match;
        return `<${tag}${attrs} fill="#ffffff"${selfClose}>`;
      }
    );
    return { content: cleaned, action: 'added-white-fill' };
  }

  // --- Case 3: Single shape with a near-black color ---
// Convert to white so it's visible on dark backgrounds.
if (shapeCount === 1 && fills.length === 1 && isNearBlack(fills[0])) {
  const cleaned = svgContent.replace(
    /\bfill=["'][^"']+["']/gi,
    'fill="#ffffff"'
  );
  return { content: cleaned, action: 'normalized-white' };
}

  // --- Case 4: Everything else stays as-is ---
  return { content: svgContent, action: 'unchanged' };
}

function addSourceComment(svgContent, source, sourceUrl) {
  const comment = `\n<!-- Source: ${source} (${sourceUrl}) -->\n`;
  return svgContent.replace(/(<svg[^>]*>)/i, `$1${comment}`);
}

// ---------- Report Helpers ----------

const COLOR_ACTION_LABELS = {
  'moved-root-fill': '🔀 Moved root fill',
  'added-white-fill': '⚪ Added white fill',
  'normalized-black': '⚫ Normalized to black',
  'unchanged': '➖ Unchanged',
};

// ---------- Main ----------

function main() {
  ensureDir(LOGS_DIR);
  ensureDir(OUTPUT_DIR);

  const startedAt = new Date().toISOString();

  const names = parseIconsFile();

  if (names === null) {
    console.error('❌ icons.txt not found');
    process.exit(1);
  }

  if (names.length === 0) {
    console.error('❌ icons.txt is empty');
    process.exit(1);
  }

  const aliases = loadAliases();

  const results = [];
  let added = 0;
  let skipped = 0;
  let normalized = 0;

  for (const rawName of names) {
    const id = normalizeName(rawName);
    const dest = path.join(OUTPUT_DIR, `${id}.svg`);

    // Skip if already exists
    if (fs.existsSync(dest)) {
      skipped++;
      results.push({
        id,
        source: 'cached',
        variant: '-',
        status: '⏭️ Skipped',
        note: 'Already exists',
        colorAction: '-',
      });
      continue;
    }

    // Try each source in order
    let resolved = null;
    for (const source of SOURCES) {
      resolved = source.resolve(id, aliases);
      if (resolved) break;
    }

    if (!resolved) {
      results.push({
        id,
        source: '-',
        variant: '-',
        status: '❌ Failed',
        note: 'Not found in any source',
        colorAction: '-',
      });
      continue;
    }

    // Process SVG
    const rawSvg = fs.readFileSync(resolved.path, 'utf8');
    const result = normalizeFill(rawSvg);
    const filled = result.content;

    if (result.action !== 'unchanged') normalized++;

    const sourceUrl =
      resolved.source === 'theSVG'
        ? `https://thesvg.org/${resolved.matched}`
        : resolved.source === 'Devicon'
        ? `https://devicon.dev/?search=${resolved.matched}`
        : `https://simpleicons.org/?q=${resolved.matched}`;

    const finalSvg = addSourceComment(filled, resolved.source, sourceUrl);

    fs.writeFileSync(dest, finalSvg);
    added++;

    const note =
      resolved.matched !== id ? `aliased from ${resolved.matched}` : '';

    results.push({
      id,
      source: resolved.source,
      variant: resolved.variant,
      status: '✅ Added',
      note,
      colorAction: result.action,
    });
  }

  const finishedAt = new Date().toISOString();

  // --- Build summary ---
  const bySource = {};
  for (const r of results) {
    if (r.status.includes('Added')) {
      bySource[r.source] = (bySource[r.source] || 0) + 1;
    }
  }

  const failed = results.filter((r) => r.status.includes('Failed'));

  // --- Color actions summary ---
  const colorActions = {};
  for (const r of results) {
    if (r.colorAction && r.colorAction !== '-') {
      colorActions[r.colorAction] = (colorActions[r.colorAction] || 0) + 1;
    }
  }

  // ---------- Write Markdown Report ----------
  const md = [];

  md.push('# Icon Fetch Report');
  md.push('');
  md.push(`**Started:** ${startedAt}`);
  md.push(`**Finished:** ${finishedAt}`);
  md.push('');
  md.push('---');
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push('| Metric | Count |');
  md.push('|--------|-------|');
  md.push(`| ✅ Added | ${added} |`);
  md.push(`| ⏭️ Skipped | ${skipped} |`);
  md.push(`| ❌ Failed | ${failed.length} |`);
  md.push(`| 🎨 Fill Normalized | ${normalized} |`);
  md.push(`| **Total** | **${results.length}** |`);
  md.push('');

  // Icons by source
  md.push('## Icons by Source');
  md.push('');
  md.push('| Source | Count |');
  md.push('|--------|-------|');
  for (const [source, count] of Object.entries(bySource)) {
    md.push(`| ${source} | ${count} |`);
  }
  md.push('');

  // Color normalization
  md.push('## Color Normalization');
  md.push('');
  md.push('| Action | Count |');
  md.push('|--------|-------|');
  for (const [action, count] of Object.entries(colorActions)) {
    const label = COLOR_ACTION_LABELS[action] || action;
    md.push(`| ${label} | ${count} |`);
  }
  md.push('');

  md.push('---');
  md.push('');
  md.push('## Detailed Results');
  md.push('');
  md.push('| Icon | Source | Variant | Status | Color Action | Note |');
  md.push('|------|--------|---------|--------|--------------|------|');

  for (const r of results) {
    const colorLabel = r.colorAction && r.colorAction !== '-'
      ? (COLOR_ACTION_LABELS[r.colorAction] || r.colorAction)
      : '-';
    md.push(
      `| \`${r.id}\` | ${r.source} | ${r.variant} | ${r.status} | ${colorLabel} | ${r.note} |`
    );
  }

  md.push('');
  md.push('---');
  md.push('');
  md.push('_Report generated by icon-fetcher_');

  fs.writeFileSync(path.join(LOGS_DIR, 'fetch-report.md'), md.join('\n'));

  // Also write failures only for quick review
  if (failed.length > 0) {
    const failedMd = [
      '# Failed Icons',
      '',
      `Generated: ${finishedAt}`,
      '',
      '| Icon | Reason |',
      '|------|--------|',
    ];
    for (const f of failed) {
      failedMd.push(`| \`${f.id}\` | ${f.note} |`);
    }
    fs.writeFileSync(path.join(LOGS_DIR, 'failed.md'), failedMd.join('\n'));
  } else {
    const failedPath = path.join(LOGS_DIR, 'failed.md');
    if (fs.existsSync(failedPath)) fs.unlinkSync(failedPath);
  }

  // Console summary
  console.log('');
  console.log('========================================');
  console.log('  Summary');
  console.log('========================================');
  console.log(`  Added:      ${added}`);
  console.log(`  Skipped:    ${skipped}`);
  console.log(`  Failed:     ${failed.length}`);
  console.log(`  Normalized: ${normalized}`);
  console.log(`  Total:      ${results.length}`);
  console.log('========================================');
  console.log('');
  console.log('📄 Full report: logs/fetch-report.md');
  if (failed.length > 0) {
    console.log('⚠️  Failures: logs/failed.md');
  }
}

main();