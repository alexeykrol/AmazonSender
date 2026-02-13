#!/usr/bin/env node
/**
 * Reset a mailout to "Not started" status for HTTP testing
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { createNotionClient, updatePageProperties } = require('./src/notion');

const MAILOUT_ID = '30537ae4-90d5-81de-b4c5-f626fe96ada3';

async function resetMailout() {
  const notion = createNotionClient(process.env.NOTION_API_TOKEN);

  console.log(`Resetting mailout ${MAILOUT_ID} to "Not started" status...\n`);

  const updates = {
    'Status': {
      status: {
        name: 'Not started'
      }
    },
    'Sent At': {
      date: null
    },
    'Sent Count': {
      number: null
    },
    'Delivered Count': {
      number: null
    },
    'Failed Count': {
      number: null
    },
    'Bounce Rate': {
      number: null
    }
  };

  await updatePageProperties(notion, MAILOUT_ID, updates);

  console.log('✅ Mailout reset successfully\n');
  console.log('Ready for HTTP test execution');
}

resetMailout().catch(console.error);
