// debug-test.js
console.log('Debugging ContentScale imports...\n');

// Test 1: Check if file exists
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'claude-validator-HYBRID.js');
console.log('1. Checking file existence:');
console.log(`   File: ${filePath}`);
console.log(`   Exists: ${fs.existsSync(filePath) ? '✅ Yes' : '❌ No'}`);

// Test 2: Try to require it
console.log('\n2. Trying to require module:');
try {
  const validator = require('./src/claude-validator-HYBRID');
  console.log('   ✅ Module loaded successfully');
  console.log('   Exports:', Object.keys(validator));
} catch (error) {
  console.log('   ❌ Failed to load module:', error.message);
  console.log('   Error code:', error.code);
  
  if (error.code === 'MODULE_NOT_FOUND') {
    // Check what Node.js is looking for
    const match = error.message.match(/Cannot find module '([^']+)'/);
    if (match) {
      console.log(`   Node.js is looking for: ${match[1]}`);
    }
  }
}

// Test 3: Check all modules
console.log('\n3. Testing all module imports:');
const modules = [
  { name: 'server.js', path: './src/server' },
  { name: 'puppeteer-fetcher.js', path: './src/puppeteer-fetcher' },
  { name: 'content-parser-HYBRID.js', path: './src/content-parser-HYBRID' },
  { name: 'claude-validator-HYBRID.js', path: './src/claude-validator-HYBRID' },
  { name: 'deterministic-scoring-HYBRID.js', path: './src/deterministic-scoring-HYBRID' }
];

modules.forEach(mod => {
  try {
    const module = require(mod.path);
    console.log(`   ✅ ${mod.name}`);
    console.log(`      Exports: ${Object.keys(module).join(', ')}`);
  } catch (error) {
    console.log(`   ❌ ${mod.name}: ${error.message}`);
  }
});

console.log('\nDebug test completed.');