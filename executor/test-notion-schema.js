#!/usr/bin/env node

/**
 * Test script to verify Notion property builders generate correct schema
 */

require('dotenv').config();
const { buildErrorProperties } = require('./src/errors');
const { config } = require('./src/config');

console.log('Testing Notion Error Properties Schema...\n');

const testError = {
  timestamp: '2026-02-12T10:00:00Z',
  mailout_id: '2fb37ae490d5-test-mailout',
  is_test: true,
  provider: 'SES',
  stage: 'send',
  email: 'test@example.com',
  error_code: 'MessageRejected',
  error_message: 'Email address is not verified',
  retry_count: 0
};

const props = buildErrorProperties(config, testError);

console.log('Generated Notion properties:\n');
console.log(JSON.stringify(props, null, 2));

console.log('\n\nValidating property types:\n');

const validations = [
  {
    name: 'Title (Name)',
    key: config.notion.errorProps.title,
    expected: 'title',
    actual: props[config.notion.errorProps.title]?.title ? 'title' : 'unknown'
  },
  {
    name: 'Timestamp',
    key: config.notion.errorProps.timestamp,
    expected: 'date',
    actual: props[config.notion.errorProps.timestamp]?.date ? 'date' : 'unknown'
  },
  {
    name: 'Mailout ID',
    key: config.notion.errorProps.mailoutId,
    expected: 'rich_text',
    actual: props[config.notion.errorProps.mailoutId]?.rich_text ? 'rich_text' : 'unknown'
  },
  {
    name: 'Is Test',
    key: config.notion.errorProps.isTest,
    expected: 'checkbox',
    actual: props[config.notion.errorProps.isTest]?.checkbox !== undefined ? 'checkbox' : 'unknown'
  },
  {
    name: 'Provider',
    key: config.notion.errorProps.provider,
    expected: 'select',
    actual: props[config.notion.errorProps.provider]?.select ? 'select' : 'unknown'
  },
  {
    name: 'Stage',
    key: config.notion.errorProps.stage,
    expected: 'select',
    actual: props[config.notion.errorProps.stage]?.select ? 'select' : 'unknown'
  },
  {
    name: 'Email',
    key: config.notion.errorProps.email,
    expected: 'email',
    actual: props[config.notion.errorProps.email]?.email !== undefined ? 'email' : 'unknown'
  },
  {
    name: 'Error Code',
    key: config.notion.errorProps.code,
    expected: 'rich_text',
    actual: props[config.notion.errorProps.code]?.rich_text ? 'rich_text' : 'unknown'
  },
  {
    name: 'Error Message',
    key: config.notion.errorProps.message,
    expected: 'rich_text',
    actual: props[config.notion.errorProps.message]?.rich_text ? 'rich_text' : 'unknown'
  },
  {
    name: 'Retry Count',
    key: config.notion.errorProps.retry,
    expected: 'number',
    actual: props[config.notion.errorProps.retry]?.number !== undefined ? 'number' : 'unknown'
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
if (allValid) {
  console.log('✅ All property types match expected Notion schema!');
  process.exit(0);
} else {
  console.log('❌ Schema validation failed!');
  process.exit(1);
}
