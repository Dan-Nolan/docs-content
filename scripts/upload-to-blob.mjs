#!/usr/bin/env node

/**
 * Upload all content to Vercel Blob
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=xxx node scripts/upload-to-blob.js [branch-name]
 *
 * Default branch: main
 */

import dotenv from "dotenv";
dotenv.config();

import { put } from "@vercel/blob";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, "..");
const branch = process.argv[2] || "main";

// Files and directories to skip
const SKIP_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.DS_Store/,
  /^\.env$/, // Skip .env file (but allow .env.example)
  // Note: We DO upload alchemy/generated/ specs - they're needed for the site
  /scripts/, // Skip scripts directory
  /package.*\.json/, // Skip package files
  /\.gitignore/,
];

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

async function uploadFile(localPath, blobPath) {
  const content = fs.readFileSync(localPath);

  try {
    const blob = await put(blobPath, content, {
      access: "public",
      allowOverwrite: true,
      addRandomSuffix: false, // Keep exact paths
      cacheControlMaxAge: 0, // No CDN caching for frequently updated content
    });

    return { success: true, url: blob.url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldSkip(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath, baseDir)));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("❌ BLOB_READ_WRITE_TOKEN environment variable is required");
    process.exit(1);
  }

  console.log(`📦 Uploading content to Vercel Blob...`);
  console.log(`   Branch: ${branch}`);
  console.log("");

  const startTime = Date.now();
  const files = await getAllFiles(CONTENT_DIR);

  console.log(`📁 Found ${files.length} files to upload\n`);

  let uploaded = 0;
  let failed = 0;
  const errors = [];

  for (const file of files) {
    const localPath = path.join(CONTENT_DIR, file);
    const blobPath = `content/${branch}/${file}`;

    process.stdout.write(`   Uploading ${file}...`);

    const result = await uploadFile(localPath, blobPath);

    if (result.success) {
      uploaded++;
      process.stdout.write(" ✅\n");
    } else {
      failed++;
      process.stdout.write(` ❌ ${result.error}\n`);
      errors.push({ file, error: result.error });
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("");
  console.log(`✅ Upload complete!`);
  console.log(`   Uploaded: ${uploaded} files`);
  console.log(`   Failed: ${failed} files`);
  console.log(`   Duration: ${duration}s`);
  console.log(`   Branch: content/${branch}/`);

  if (errors.length > 0) {
    console.log("\n❌ Errors:");
    errors.forEach(({ file, error }) => {
      console.log(`   ${file}: ${error}`);
    });
    process.exit(1);
  }

  // Trigger revalidation if configured
  await triggerRevalidation(branch);
}

async function triggerRevalidation(branch) {
  const docsUrl = process.env.DOCS_SITE_URL;
  const secret = process.env.REVALIDATE_SECRET;

  if (!docsUrl || !secret) {
    console.log("\n⚠️  Skipping revalidation (DOCS_SITE_URL or REVALIDATE_SECRET not set)");
    return;
  }

  console.log(`\n🔄 Triggering revalidation on ${docsUrl}...`);

  try {
    const response = await fetch(`${docsUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        branch,
        revalidateAll: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`   ❌ Revalidation failed: ${response.status} - ${error}`);
      return;
    }

    const result = await response.json();
    console.log(`   ✅ Revalidated ${result.revalidated} pages`);
  } catch (error) {
    console.log(`   ❌ Revalidation failed: ${error.message}`);
  }
}

main().catch((error) => {
  console.error("❌ Upload failed:", error);
  process.exit(1);
});
