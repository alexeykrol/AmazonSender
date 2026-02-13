#!/usr/bin/env node
/**
 * Find an unsent non-test mailout for validation
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { createNotionClient } = require('./src/notion');
const { Client } = require('@notionhq/client');

async function findUnsentMailout() {
  const notion = createNotionClient(process.env.NOTION_API_TOKEN);
  const dbId = process.env.NOTION_DB_MAILOUTS_ID;

  console.log('Searching for unsent non-test mailouts...\n');

  const response = await notion.databases.query({
    database_id: dbId,
    filter: {
      and: [
        {
          property: 'Test',
          checkbox: {
            equals: false
          }
        },
        {
          or: [
            {
              property: 'Status',
              status: {
                equals: 'Not started'
              }
            },
            {
              property: 'Status',
              status: {
                equals: 'In progress'
              }
            }
          ]
        }
      ]
    },
    page_size: 5
  });

  console.log(`Found ${response.results.length} unsent mailouts:\n`);

  for (const page of response.results) {
    const props = page.properties;
    const name = props.Name?.title?.[0]?.text?.content || 'Untitled';
    const status = props.Status?.status?.name || 'N/A';
    const sentAt = props['Sent At']?.date?.start || null;
    const isTest = props.Test?.checkbox || false;

    console.log(`ID: ${page.id}`);
    console.log(`  Name: ${name}`);
    console.log(`  Status: ${status}`);
    console.log(`  Sent At: ${sentAt || 'Not sent'}`);
    console.log(`  Is Test: ${isTest}`);
    console.log();
  }

  if (response.results.length > 0) {
    const firstUnsent = response.results[0];
    console.log('✅ Use this mailout ID for HTTP test:');
    console.log(firstUnsent.id);
    return firstUnsent.id;
  } else {
    console.log('❌ No unsent non-test mailouts found');
    console.log('\nCreate a new mailout or reset an existing one to "Not started" status');
    return null;
  }
}

findUnsentMailout().catch(console.error);
