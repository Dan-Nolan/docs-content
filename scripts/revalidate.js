#!/usr/bin/env node

/**
 * Trigger revalidation for all content
 * Usage: node scripts/revalidate.js [branch]
 */

const NEXT_APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'dev-secret';
const branch = process.argv[2] || 'main';

console.log(`🔄 Triggering revalidation...`);
console.log(`   Target: ${NEXT_APP_URL}`);
console.log(`   Branch: ${branch}`);
console.log();

fetch(`${NEXT_APP_URL}/api/revalidate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${REVALIDATE_SECRET}`
  },
  body: JSON.stringify({
    branch: branch,
    revalidateAll: true
  })
})
  .then(async (response) => {
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return response.json();
  })
  .then((data) => {
    console.log('✅ Revalidation complete!');
    console.log(`   Pages revalidated: ${data.revalidated}`);
    console.log(`   Message: ${data.message}`);
    console.log();
  })
  .catch((error) => {
    console.error('❌ Revalidation failed:', error.message);
    console.log();
    console.log('Make sure:');
    console.log('  - The Next.js app is running');
    console.log('  - NEXT_APP_URL is correct');
    console.log('  - REVALIDATE_SECRET matches');
    process.exit(1);
  });
