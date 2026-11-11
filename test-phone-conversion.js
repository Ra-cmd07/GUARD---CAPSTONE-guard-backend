/**
 * Test phone number conversion logic
 */

function convertToInternational(phone) {
  let internationalPhone = phone.trim().replace(/\s+/g, ''); // Remove spaces
  
  if (internationalPhone.startsWith('0')) {
    // Local format: replace leading 0 with +63
    internationalPhone = '+63' + internationalPhone.substring(1);
  } else if (internationalPhone.startsWith('63') && !internationalPhone.startsWith('+')) {
    // Missing + prefix
    internationalPhone = '+' + internationalPhone;
  } else if (!internationalPhone.startsWith('+63')) {
    // Invalid format, try to fix
    console.warn(`⚠️  Invalid phone format: ${phone}, attempting to fix...`);
    internationalPhone = '+63' + internationalPhone.replace(/^0+/, '');
  }
  
  return internationalPhone;
}

console.log('🧪 Testing Phone Number Conversion\n');

const testCases = [
  { input: '0953 681 2353', expected: '+639536812353' },
  { input: '09536812353', expected: '+639536812353' },
  { input: '639536812353', expected: '+639536812353' },
  { input: '+639536812353', expected: '+639536812353' },
  { input: '0917 123 4567', expected: '+639171234567' },
  { input: '0967 367 3637', expected: '+639673673637' },
];

let passed = 0;
let failed = 0;

testCases.forEach(test => {
  const result = convertToInternational(test.input);
  const success = result === test.expected;
  
  if (success) {
    console.log(`✅ "${test.input}" → "${result}"`);
    passed++;
  } else {
    console.log(`❌ "${test.input}" → "${result}" (expected: "${test.expected}")`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('✅ All tests passed! Phone conversion working correctly.');
} else {
  console.log('❌ Some tests failed. Check conversion logic.');
}
