const fs = require('fs');
const path = require('path');
const $RefParser = require('@apidevtools/json-schema-ref-parser');
const mergeAllOf = require('json-schema-merge-allof');

const SPECS_DIR = path.join(__dirname, '..', 'alchemy', 'specs');
const OUTPUT_DIR = path.join(__dirname, '..', 'alchemy', 'generated');

/**
 * Dereference a spec file (resolve all $ref pointers)
 */
async function dereferenceSpec(filePath) {
  const startTime = Date.now();
  const fileName = path.basename(filePath, path.extname(filePath));

  console.log(`🔄 Processing ${fileName}...`);

  try {
    // Dereference all $ref pointers
    const dereferenced = await $RefParser.dereference(filePath, {
      dereference: {
        circular: false, // Don't allow circular refs
      },
    });

    // Merge allOf schemas for cleaner output
    const merged = mergeAllOfSchemas(dereferenced);

    // Remove components section (no longer needed after dereferencing)
    if (merged.components) {
      delete merged.components;
    }

    // Sort methods alphabetically
    if (merged.methods && Array.isArray(merged.methods)) {
      merged.methods.sort((a, b) => a.name.localeCompare(b.name));
    }

    const duration = Date.now() - startTime;
    console.log(`  ✅ Dereferenced in ${duration}ms`);
    console.log(`  📊 Methods: ${merged.methods?.length || 0}`);

    return {
      spec: merged,
      fileName,
      duration,
    };
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Recursively merge allOf schemas in an object
 */
function mergeAllOfSchemas(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => mergeAllOfSchemas(item));
  }

  // If this object has allOf, merge it
  if (obj.allOf) {
    try {
      const merged = mergeAllOf(obj);
      // Recursively process the merged result
      return mergeAllOfSchemas(merged);
    } catch (error) {
      console.warn(`  ⚠️  Could not merge allOf: ${error.message}`);
      return obj;
    }
  }

  // Recursively process all properties
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = mergeAllOfSchemas(value);
  }
  return result;
}

/**
 * Write spec to output directory
 */
function writeSpec(fileName, spec) {
  const outputPath = path.join(OUTPUT_DIR, `${fileName}.json`);

  // Add warning header
  const output = {
    'x-generated-warning': '⚠️ This file is auto-generated from alchemy/specs/. Do not edit manually.',
    ...spec,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(2);
  console.log(`  💾 Written to ${fileName}.json (${sizeKB} KB)\n`);
}

/**
 * Main generation function
 * @param {string} [specificFile] - Optional: path to specific file to regenerate
 */
async function generateSpecs(specificFile = null) {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let specFiles;
  let isIncrementalBuild = false;

  if (specificFile) {
    // Incremental: Only process the specific file
    const fileName = path.basename(specificFile);

    // Check if it's a shared component file
    if (fileName.startsWith('_') || specificFile.includes('_components')) {
      console.log('🔄 Shared component changed, regenerating all specs...\n');
      // Fall through to full build
    } else {
      const fullPath = path.isAbsolute(specificFile)
        ? specificFile
        : path.join(SPECS_DIR, fileName);

      if (!fs.existsSync(fullPath)) {
        console.error(`❌ File not found: ${fullPath}\n`);
        return;
      }

      specFiles = [fullPath];
      isIncrementalBuild = true;
      console.log(`🔧 Regenerating ${fileName}...\n`);
    }
  }

  if (!isIncrementalBuild) {
    // Full build: Process all specs
    console.log('🚀 Generating OpenRPC specs...\n');

    specFiles = fs.readdirSync(SPECS_DIR)
      .filter(file => (file.endsWith('.yaml') || file.endsWith('.yml')) && !file.startsWith('_'))
      .map(file => path.join(SPECS_DIR, file));

    if (specFiles.length === 0) {
      console.log('⚠️  No spec files found in alchemy/specs/\n');
      return;
    }

    console.log(`📋 Found ${specFiles.length} spec file(s)\n`);
  }

  const totalStart = Date.now();
  const results = [];

  // Process specs in parallel
  const promises = specFiles.map(async (file) => {
    try {
      const result = await dereferenceSpec(file);
      results.push(result);
      writeSpec(result.fileName, result.spec);
      return result;
    } catch (error) {
      console.error(`Failed to process ${path.basename(file)}: ${error.message}\n`);
      return null;
    }
  });

  await Promise.all(promises);

  const totalDuration = Date.now() - totalStart;
  const successful = results.filter(r => r !== null).length;
  const totalMethods = results.reduce((sum, r) => sum + (r?.spec?.methods?.length || 0), 0);

  console.log('═══════════════════════════════════════════');
  console.log(`✨ Generation complete in ${totalDuration}ms`);
  console.log(`   Processed: ${successful}/${specFiles.length} specs`);
  console.log(`   Total methods: ${totalMethods}`);
  if (successful > 1) {
    console.log(`   Average time: ${(totalDuration / successful).toFixed(0)}ms per spec`);
  }
  console.log('═══════════════════════════════════════════\n');
}

// Run if called directly
if (require.main === module) {
  // Get optional file path from command line args
  const specificFile = process.argv[2];

  generateSpecs(specificFile).catch((error) => {
    console.error('Generation failed:', error);
    process.exit(1);
  });
}

module.exports = { generateSpecs };
