const chokidar = require('chokidar');
const { generateSpecs } = require('./generate-specs');
const path = require('path');

const NEXT_APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'dev-secret';

console.log('👀 Watching for content changes...');
console.log(`   Target: ${NEXT_APP_URL}`);
console.log('');

// Watch all MDX files, docs.yml, and spec YAML files
const watcher = chokidar.watch(['**/*.mdx', 'docs.yml', '**/*.json', 'alchemy/specs/**/*.yaml'], {
  ignored: [
    /(^|[\/\\])\../, // ignore dotfiles
    /alchemy\/generated\//, // ignore generated specs
  ],
  persistent: true,
  ignoreInitial: true, // don't trigger on startup
  cwd: process.cwd(),
});

// Debounce revalidation calls
let revalidateTimeout = null;
const DEBOUNCE_MS = 500;

async function triggerRevalidation(changedPath) {
  clearTimeout(revalidateTimeout);

  revalidateTimeout = setTimeout(async () => {
    console.log(`📝 Changed: ${changedPath}`);

    // Check if it's a spec file
    const isSpecFile = changedPath.includes('alchemy/specs/') &&
                      (changedPath.endsWith('.yaml') || changedPath.endsWith('.yml'));

    if (isSpecFile) {
      console.log(`🔧 Spec file changed, regenerating...`);
      try {
        // Pass the specific file for incremental processing
        await generateSpecs(changedPath);
      } catch (error) {
        console.error(`❌ Spec generation failed:`, error.message);
        console.log('');
        return; // Don't trigger revalidation if spec generation failed
      }
    }

    console.log(`🔄 Triggering revalidation...`);

    try {
      const response = await fetch(`${NEXT_APP_URL}/api/revalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${REVALIDATE_SECRET}`,
        },
        body: JSON.stringify({
          branch: 'main',
          revalidateAll: true, // For simplicity, revalidate everything
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${data.message}`);
      } else {
        const error = await response.json();
        console.error(`❌ Revalidation failed: ${error.error}`);
      }
    } catch (error) {
      console.error(`❌ Failed to reach dev server:`, error.message);
      console.error(`   Make sure the Next.js dev server is running at ${NEXT_APP_URL}`);
    }
    console.log('');
  }, DEBOUNCE_MS);
}

watcher
  .on('add', path => triggerRevalidation(path))
  .on('change', path => triggerRevalidation(path))
  .on('unlink', path => triggerRevalidation(path))
  .on('error', error => console.error(`Watcher error: ${error}`));

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Stopping file watcher...');
  watcher.close();
  process.exit(0);
});
