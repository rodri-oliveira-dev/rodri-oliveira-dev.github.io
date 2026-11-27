#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p coverage
rm -f coverage/lcov.info
node --test --experimental-test-coverage \
  --test-coverage-include='assets/js/**' \
  --test-coverage-include='sw.js' \
  --test-reporter=spec --test-reporter-destination=stdout \
  --test-reporter=lcov --test-reporter-destination=coverage/lcov.info \
  .github/scripts/test-site-i18n.cjs \
  .github/scripts/test-pwa.cjs \
  .github/scripts/test-pwa-web-push.mjs \
  .github/scripts/test-services.cjs \
  .github/scripts/test-webmcp.mjs \
  .github/scripts/test-webmcp-services.mjs \
  .github/scripts/test-browser-product.cjs

node --input-type=commonjs - <<'NODE'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const records = fs.readFileSync('coverage/lcov.info', 'utf8').split('end_of_record');
const covered = new Map();
for (const record of records) {
  const source = record.match(/^SF:(.+)$/m)?.[1];
  if (!source) continue;
  const relative = path.relative(process.cwd(), path.resolve(source.trim())).split(path.sep).join('/');
  assert.ok(relative === 'sw.js' || relative.startsWith('assets/js/'), 'Unexpected coverage source: ' + relative);
  assert.ok(fs.existsSync(relative), 'Missing source: ' + relative);
  covered.set(relative, (covered.get(relative) || 0) + Number(record.match(/^LH:(\d+)$/m)?.[1] || 0));
}
for (const required of [
  'sw.js', 'assets/js/site.js', 'assets/js/home-screen-install.js', 'assets/js/contrast.js',
  'assets/js/pwa-register.js', 'assets/js/web-push-lifecycle.mjs', 'assets/js/web-push-platform.mjs',
  'assets/js/web-push-view.mjs', 'assets/js/webmcp-tools.mjs', 'assets/js/webmcp-services.mjs',
]) {
  assert.ok(covered.get(required) > 0, 'No executed source lines in LCOV: ' + required);
}
console.log('LCOV validated for ' + covered.size + ' product source files.');
NODE
