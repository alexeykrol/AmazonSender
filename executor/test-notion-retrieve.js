const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

async function testRetrieve() {
  try {
    console.log('Testing databases.retrieve...');
    const dbInfo = await notion.databases.retrieve({
      database_id: process.env.NOTION_DB_MAILOUTS_ID
    });
    console.log('✅ databases.retrieve succeeded');
    console.log('Database title:', dbInfo.title?.[0]?.plain_text || 'No title');
    
    console.log('\nTesting databases.query...');
    const results = await notion.databases.query({
      database_id: process.env.NOTION_DB_MAILOUTS_ID,
      page_size: 1
    });
    console.log('✅ databases.query succeeded');
    console.log('Results count:', results.results.length);
    
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.code, error.message);
    return false;
  }
}

testRetrieve();
