#!/usr/bin/env node

/**
 * Generate realistic test content for docs-prototype
 * Creates ~500 MDX pages + mock API specs similar to real docs
 */

const fs = require('fs');
const path = require('path');

const NUM_PAGES = 500;
const CONTENT_DIR = path.join(__dirname, '..');

// Define sections similar to real docs
const SECTIONS = [
  { name: 'getting-started', count: 10 },
  { name: 'tutorials', count: 50 },
  { name: 'api-reference', count: 200 },
  { name: 'guides', count: 100 },
  { name: 'sdk', count: 80 },
  { name: 'webhooks', count: 30 },
  { name: 'wallets', count: 30 },
];

/**
 * Generate a realistic MDX page
 */
function generateMDXContent(section, index) {
  const title = `${section} Guide ${index}`;

  return `# ${title}

This is a test page for **${section}** section.

## Overview

This guide covers important concepts about ${section}. Here's what you'll learn:

- Key concept 1
- Key concept 2
- Key concept 3

## Prerequisites

Before you begin, make sure you have:

1. Basic understanding of web development
2. Node.js installed (version 16+)
3. An API key from the dashboard

## Getting Started

Let's walk through a simple example:

\`\`\`javascript
// Example code snippet
import { AlchemyProvider } from '@alchemy/sdk';

const provider = new AlchemyProvider({
  apiKey: 'your-api-key',
  network: 'eth-mainnet'
});

async function getBlockNumber() {
  const blockNumber = await provider.getBlockNumber();
  console.log('Current block:', blockNumber);
}

getBlockNumber();
\`\`\`

### Step 1: Configuration

First, configure your environment:

\`\`\`bash
npm install @alchemy/sdk
\`\`\`

### Step 2: Initialize

Create a new instance:

\`\`\`typescript
const config = {
  apiKey: process.env.ALCHEMY_API_KEY,
  network: 'eth-mainnet'
};
\`\`\`

### Step 3: Make Requests

Now you can start making requests:

\`\`\`javascript
const balance = await provider.getBalance('0x...');
console.log(\`Balance: \${balance}\`);
\`\`\`

## Advanced Usage

For more advanced scenarios, you can:

- Use batch requests for better performance
- Handle errors with try/catch blocks
- Implement retry logic for failed requests

## Code Example

Here's a complete example:

\`\`\`typescript
import { Alchemy, Network } from 'alchemy-sdk';

const settings = {
  apiKey: process.env.ALCHEMY_API_KEY,
  network: Network.ETH_MAINNET,
};

const alchemy = new Alchemy(settings);

async function main() {
  try {
    const blockNumber = await alchemy.core.getBlockNumber();
    console.log('Latest block number:', blockNumber);

    const block = await alchemy.core.getBlock(blockNumber);
    console.log('Block details:', block);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
\`\`\`

## Best Practices

1. **Rate Limiting**: Implement exponential backoff
2. **Error Handling**: Always wrap calls in try/catch
3. **Caching**: Cache responses when appropriate
4. **Monitoring**: Track API usage and errors

## Common Issues

### Issue: Rate limit exceeded

If you see rate limit errors, try:
- Implementing request queuing
- Using batch requests
- Upgrading your plan

### Issue: Invalid API key

Make sure your API key is correctly set in your environment variables.

## Next Steps

- [Read about ${section} advanced features](#)
- [Check out related guides](#)
- [View API reference](#)

## Related Resources

- [Official Documentation](#)
- [GitHub Examples](#)
- [Community Forum](#)
`;
}

/**
 * Generate a mock OpenRPC spec
 */
function generateOpenRPCSpec(name) {
  return {
    openrpc: '1.2.6',
    info: {
      title: `${name} API`,
      version: '1.0.0',
      description: `Mock ${name} API specification for testing`
    },
    methods: [
      {
        name: `${name}_getInfo`,
        summary: `Get ${name} information`,
        params: [
          {
            name: 'address',
            required: true,
            schema: { type: 'string' }
          }
        ],
        result: {
          name: 'result',
          schema: { type: 'object' }
        }
      },
      {
        name: `${name}_getBalance`,
        summary: `Get ${name} balance`,
        params: [
          {
            name: 'address',
            required: true,
            schema: { type: 'string' }
          }
        ],
        result: {
          name: 'balance',
          schema: { type: 'string' }
        }
      }
    ]
  };
}

/**
 * Generate docs.yml navigation structure
 */
function generateDocsYml(pages) {
  const navigation = [];

  // Group pages by section
  const pagesBySection = {};
  pages.forEach(page => {
    if (!pagesBySection[page.section]) {
      pagesBySection[page.section] = [];
    }
    pagesBySection[page.section].push(page);
  });

  // Build navigation structure
  for (const [section, sectionPages] of Object.entries(pagesBySection)) {
    const sectionTitle = section
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    navigation.push({
      section: sectionTitle,
      contents: sectionPages.map(page => ({
        page: page.title,
        path: page.path
      }))
    });
  }

  return {
    title: 'Test Documentation',
    navigation
  };
}

/**
 * Main generation function
 */
function generateContent() {
  console.log('🚀 Generating test content...\n');

  const pages = [];
  let totalGenerated = 0;

  // Generate MDX pages for each section
  for (const section of SECTIONS) {
    const sectionDir = path.join(CONTENT_DIR, section.name);

    // Create section directory
    if (!fs.existsSync(sectionDir)) {
      fs.mkdirSync(sectionDir, { recursive: true });
    }

    console.log(`📁 Generating ${section.count} pages for ${section.name}...`);

    for (let i = 1; i <= section.count; i++) {
      const filename = `page-${i}.mdx`;
      const filepath = path.join(sectionDir, filename);
      const content = generateMDXContent(section.name, i);

      fs.writeFileSync(filepath, content);

      pages.push({
        section: section.name,
        title: `${section.name} Guide ${i}`,
        path: `${section.name}/${filename}`
      });

      totalGenerated++;
    }
  }

  console.log(`\n✅ Generated ${totalGenerated} MDX pages\n`);

  // Generate mock API specs
  console.log('📋 Generating mock API specs...');
  const specsDir = path.join(CONTENT_DIR, 'api-specs');
  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
  }

  const specNames = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
  specNames.forEach(name => {
    const spec = generateOpenRPCSpec(name);
    const specPath = path.join(specsDir, `${name}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  });

  console.log(`✅ Generated ${specNames.length} API specs\n`);

  // Generate docs.yml
  console.log('📝 Generating docs.yml...');
  const docsYml = generateDocsYml(pages);
  const yaml = require('js-yaml');
  const docsYmlPath = path.join(CONTENT_DIR, 'docs.yml');
  fs.writeFileSync(docsYmlPath, yaml.dump(docsYml));

  console.log('✅ Generated docs.yml\n');

  // Generate redirects.yml
  console.log('🔀 Generating redirects.yml...');
  const redirects = {
    redirects: [
      {
        from: '/docs/old-getting-started',
        to: '/docs/getting-started/page-1',
        permanent: true
      },
      {
        from: '/docs/legacy-api',
        to: '/docs/api-reference/page-1',
        permanent: true
      }
    ]
  };
  const redirectsPath = path.join(CONTENT_DIR, 'redirects.yml');
  fs.writeFileSync(redirectsPath, yaml.dump(redirects));
  console.log('✅ Generated redirects.yml\n');

  // Summary
  console.log('📊 Summary:');
  console.log(`   • Total MDX pages: ${totalGenerated}`);
  console.log(`   • Total API specs: ${specNames.length}`);
  console.log(`   • Sections: ${SECTIONS.length}`);
  console.log(`   • docs.yml entries: ${pages.length}`);
  console.log('\n✨ Content generation complete!');
  console.log(`\n📂 Content location: ${CONTENT_DIR}\n`);
}

// Run the generator
try {
  // Check if js-yaml is available
  try {
    require('js-yaml');
  } catch (e) {
    console.error('❌ Error: js-yaml is required');
    console.log('\nPlease run: npm install js-yaml');
    process.exit(1);
  }

  generateContent();
} catch (error) {
  console.error('❌ Error generating content:', error);
  process.exit(1);
}
