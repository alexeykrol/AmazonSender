#!/usr/bin/env node

/**
 * Test script to verify Notion mailout update properties match workspace schema
 */

require('dotenv').config();
const { config } = require('./src/config');

console.log('Testing Notion Mailout Properties Schema...\n');

// Simulate a page object from Notion with workspace schema
const mockPage = {
  properties: {
    'Name': { type: 'title' },
    'Status': { type: 'status' },
    'Test': { type: 'checkbox' },
    'Sent At': { type: 'date' },
    'Sent Count': { type: 'number' },
    'Delivered Count': { type: 'number' },
    'Failed Count': { type: 'number' },
    'Bounce Rate': { type: 'number' },
    'Unsub Rate': { type: 'number' }
  }
};

// This is the function from server.js
function buildNotionUpdateProps(page, updates) {
  const props = page.properties || {};
  const result = {};
  for (const [propName, value] of Object.entries(updates)) {
    const prop = props[propName];
    if (!prop) continue;
    const type = prop.type;
    if (type === 'status') {
      result[propName] = { status: { name: value } };
    } else if (type === 'select') {
      result[propName] = { select: { name: value } };
    } else if (type === 'checkbox') {
      result[propName] = { checkbox: !!value };
    } else if (type === 'number') {
      result[propName] = { number: value };
    } else if (type === 'date') {
      result[propName] = { date: value ? { start: value } : null };
    } else if (type === 'rich_text') {
      result[propName] = { rich_text: [{ text: { content: String(value) } }] };
    } else {
      // Fallback to rich_text
      result[propName] = { rich_text: [{ text: { content: String(value) } }] };
    }
  }
  return result;
}

// Test updates
const updates = {
  [config.notion.statusProp]: 'Done',
  [config.notion.sentAtProp]: '2026-02-12T10:00:00Z',
  [config.notion.sentCountProp]: 100,
  [config.notion.deliveredCountProp]: 95,
  [config.notion.failedCountProp]: 5,
  [config.notion.bounceRateProp]: 0.05,
  [config.notion.unsubRateProp]: 0.0
};

const props = buildNotionUpdateProps(mockPage, updates);

console.log('Configuration:');
console.log(`  Subject Property: ${config.notion.subjectProp}`);
console.log(`  Status Property: ${config.notion.statusProp}`);
console.log(`  Status Sent Value: ${config.notion.statusSentValue}`);
console.log(`  Status Failed Value: ${config.notion.statusFailedValue}`);
console.log();

console.log('Generated Notion update properties:\n');
console.log(JSON.stringify(props, null, 2));

console.log('\n\nValidating property types:\n');

const validations = [
  {
    name: 'Status',
    key: config.notion.statusProp,
    expected: 'status',
    actual: props[config.notion.statusProp]?.status ? 'status' : 'unknown'
  },
  {
    name: 'Sent At',
    key: config.notion.sentAtProp,
    expected: 'date',
    actual: props[config.notion.sentAtProp]?.date ? 'date' : 'unknown'
  },
  {
    name: 'Sent Count',
    key: config.notion.sentCountProp,
    expected: 'number',
    actual: props[config.notion.sentCountProp]?.number !== undefined ? 'number' : 'unknown'
  },
  {
    name: 'Delivered Count',
    key: config.notion.deliveredCountProp,
    expected: 'number',
    actual: props[config.notion.deliveredCountProp]?.number !== undefined ? 'number' : 'unknown'
  },
  {
    name: 'Failed Count',
    key: config.notion.failedCountProp,
    expected: 'number',
    actual: props[config.notion.failedCountProp]?.number !== undefined ? 'number' : 'unknown'
  },
  {
    name: 'Bounce Rate',
    key: config.notion.bounceRateProp,
    expected: 'number',
    actual: props[config.notion.bounceRateProp]?.number !== undefined ? 'number' : 'unknown'
  },
  {
    name: 'Unsub Rate',
    key: config.notion.unsubRateProp,
    expected: 'number',
    actual: props[config.notion.unsubRateProp]?.number !== undefined ? 'number' : 'unknown'
  }
];

let allValid = true;

validations.forEach(v => {
  const valid = v.expected === v.actual;
  const status = valid ? '✅' : '❌';
  console.log(`${status} ${v.name} (${v.key}): ${v.actual} ${valid ? '' : `(expected: ${v.expected})`}`);
  if (!valid) allValid = false;
});

console.log('\n' + '='.repeat(60));

// Check config matches workspace schema
const configIssues = [];
if (config.notion.subjectProp !== 'Name') {
  configIssues.push(`⚠️  Subject property is "${config.notion.subjectProp}" but workspace uses "Name"`);
}
if (!['Done', 'In progress', 'Not started'].includes(config.notion.statusSentValue)) {
  configIssues.push(`⚠️  Status sent value is "${config.notion.statusSentValue}" but workspace expects: Not started | In progress | Done`);
}

if (configIssues.length > 0) {
  console.log('\nConfiguration Recommendations:');
  configIssues.forEach(issue => console.log(issue));
  console.log();
}

if (allValid) {
  console.log('✅ All property types match expected Notion schema!');
  process.exit(0);
} else {
  console.log('❌ Schema validation failed!');
  process.exit(1);
}
