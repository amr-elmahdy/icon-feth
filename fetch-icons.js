const fs = require('fs');
const path = require('path');

const LIST_FILE = path.join(__dirname, 'icon-list.txt');
const OUTPUT_DIR = path.join(__dirname, 'icons');
const LOGS_DIR = path.join(__dirname, 'logs');
const THESVG_DIR = process.env.THESVG_DIR || '/tmp/thesvg';
const THESVG_ICONS = path.join(THESVG_DIR, 'public', 'icons');

const VARIANT_PRIORITY = ['default', 'color', 'original', 'mono'];

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// دالة للبحث عن الأيقونة في المصدر
function findIconFile(name) {
  const iconDir = path.join(THESVG_ICONS, name);
  if (fs.existsSync(iconDir) && fs.statSync(iconDir).isDirectory()) {
    for (const variant of VARIANT_PRIORITY) {
      const filePath = path.join(iconDir, `${variant}.svg`);
      if (fs.existsSync(filePath)) return { path: filePath, variant };
    }
  }
  const singleFile = path.join(THESVG_ICONS, `${name}.svg`);
  if (fs.existsSync(singleFile)) return { path: singleFile, variant: 'single' };
  return null;
}

// دالة لضمان وجود fill على العناصر الداخلية
function normalizeFill(svgContent) {
  const rootFillMatch = svgContent.match(/<svg[^>]*\s(fill|color)="([^"]+)"/i);
  if (!rootFillMatch) return svgContent;
  const color = rootFillMatch[2];
  let cleaned = svgContent.replace(new RegExp(`\\s${rootFillMatch[1]}="${color}"`, 'i'), '');
  cleaned = cleaned.replace(
    /<(path|circle|rect|polygon|polyline|line|ellipse)([^>]*?)(\/?)>/gi,
    (match, tag, attrs, selfClose) => {
      if (/\sfill=/i.test(attrs) || /\sstyle=/i.test(attrs)) return match;
      return `<${tag}${attrs} fill="${color}"${selfClose}>`;
    }
  );
  return cleaned;
}

// دالة جديدة لإضافة تعليق مختصر جداً
function addSimpleComment(svgContent, name) {
  const comment = `\n<!-- Source: theSVG (https://thesvg.org/${name}) -->\n`;
  return svgContent.replace(/(<svg[^>]*>)/i, `$1${comment}`);
}

function main() {
  // ... (كود التهيئة والتحقق من الملفات)
  
  // ... (قراءة قائمة الأسماء)
  
  let added = 0;
  let skipped = 0;
  const failures = [];
  
  for (const rawName of names) {
    const id = normalizeName(rawName);
    const dest = path.join(OUTPUT_DIR, `${id}.svg`);
    
    // التحقق من وجود الملف أولاً
    if (fs.existsSync(dest)) {
      skipped++;
      // ... (تسجيل أنه تم تخطيه)
      continue;
    }
    
    const found = findIconFile(id);
    if (!found) {
      failures.push({ name: rawName, reason: 'Not found in theSVG' });
      continue;
    }
    
    // ... (قراءة الملف من المصدر)
    const rawSvg = fs.readFileSync(found.path, 'utf8');
    const filled = normalizeFill(rawSvg);
    const finalSvg = addSimpleComment(filled, id); // استخدام الدالة الجديدة
    
    fs.writeFileSync(dest, finalSvg);
    added++;
    // ... (تسجيل أنه تمت إضافته)
  }
  
  // ... (كود كتابة الملخص)
}

main();