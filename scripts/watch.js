const dotenv = require("dotenv");
dotenv.config();

const chokidar = require("chokidar");
const { generateSpecs } = require("./generate-specs");
const path = require("path");
const fs = require("fs");

// Dynamic import for @upstash/redis (ESM module)
let redis = null;
const redisImportPromise = process.env.KV_REST_API_URL
  ? import("@upstash/redis").then((module) => {
      redis = new module.Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      console.log("✅ Redis SDK loaded");
    })
  : Promise.resolve();

const NEXT_APP_URL = process.env.DOCS_SITE_URL || "http://localhost:3000";
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || "dev-secret";
const UPLOAD_TO_REDIS = !!process.env.KV_REST_API_URL;

// Auto-detect git branch
const { execSync } = require("child_process");
let CURRENT_BRANCH = "main";
try {
  CURRENT_BRANCH = execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf-8",
  }).trim();
} catch (error) {
  console.warn("⚠️  Could not detect git branch, defaulting to 'main'");
}

// Wait for Redis SDK to load before starting
redisImportPromise.then(() => {
  console.log("👀 Watching for content changes...");
  console.log(`   Target: ${NEXT_APP_URL}`);
  console.log(`   Redis sync: ${UPLOAD_TO_REDIS ? "enabled" : "disabled"}`);
  console.log(`   Branch: ${CURRENT_BRANCH}`);
  console.log("");

// Watch all MDX files, docs.yml, and spec YAML files
const watcher = chokidar.watch(
  ["**/*.mdx", "docs.yml", "**/*.json", "alchemy/specs/**/*.yaml"],
  {
    ignored: [
      /(^|[\/\\])\../, // ignore dotfiles
      /alchemy\/generated\//, // ignore generated specs
    ],
    persistent: true,
    ignoreInitial: true, // don't trigger on startup
    cwd: process.cwd(),
  }
);

// Debounce revalidation calls
let revalidateTimeout = null;
const DEBOUNCE_MS = 500;

async function uploadToRedis(filePath) {
  if (!UPLOAD_TO_REDIS) {
    return;
  }

  // Ensure Redis SDK is loaded
  await redisImportPromise;

  if (!redis) {
    console.error(`❌ Redis SDK not initialized`);
    return;
  }

  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  File deleted, skipping upload: ${filePath}`);
      return;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const key = `content:${CURRENT_BRANCH}:${filePath}`;

    console.log(`☁️  Uploading to Redis: ${key} (${content.length} bytes)`);

    await redis.set(key, content);

    console.log(`✅ Redis updated: ${key}`);
  } catch (error) {
    console.error(`❌ Redis upload failed: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
  }
}

async function triggerRevalidation(changedPath) {
  clearTimeout(revalidateTimeout);

  revalidateTimeout = setTimeout(async () => {
    console.log(`📝 Changed: ${changedPath}`);

    // Check if it's a spec file
    const isSpecFile =
      changedPath.includes("alchemy/specs/") &&
      (changedPath.endsWith(".yaml") || changedPath.endsWith(".yml"));

    if (isSpecFile) {
      console.log(`🔧 Spec file changed, regenerating...`);
      try {
        // Pass the specific file for incremental processing
        await generateSpecs(changedPath);
      } catch (error) {
        console.error(`❌ Spec generation failed:`, error.message);
        console.log("");
        return; // Don't trigger revalidation if spec generation failed
      }
    }

    // Upload to Redis if enabled
    await uploadToRedis(changedPath);

    console.log(`🔄 Triggering revalidation...`);

    try {
      const response = await fetch(`${NEXT_APP_URL}/api/revalidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REVALIDATE_SECRET}`,
        },
        body: JSON.stringify({
          filePath: changedPath,
          branch: CURRENT_BRANCH,
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
      console.error(
        `   Make sure the Next.js dev server is running at ${NEXT_APP_URL}`
      );
    }
    console.log("");
  }, DEBOUNCE_MS);
}

  watcher
    .on("add", (path) => triggerRevalidation(path))
    .on("change", (path) => triggerRevalidation(path))
    .on("unlink", (path) => triggerRevalidation(path))
    .on("error", (error) => console.error(`Watcher error: ${error}`));

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n👋 Stopping file watcher...");
    watcher.close();
    process.exit(0);
  });
});
