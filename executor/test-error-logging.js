require('dotenv').config();
const { config } = require('./src/config');
const { createNotionClient } = require('./src/notion');
const { buildErrorProperties } = require('./src/errors');

async function testErrorLogging() {
  const notion = createNotionClient(config.notion.token);
  
  console.log('=== ERROR LOGGING TEST ===\n');
  
  // Simulate an error during send
  const testError = {
    mailout_id: '30537ae4-90d5-81de-b4c5-f626fe96ada3',
    is_test: false,
    provider: 'SES',
    stage: 'send',
    email: 'test@example.com',
    error_code: 'MessageRejected',
    error_message: 'Email address is not verified',
    retry_count: 0,
    timestamp: new Date().toISOString()
  };
  
  console.log('Test error object:');
  console.log(JSON.stringify(testError, null, 2));
  console.log('');
  
  // Build properties using the actual function from errors.js
  const props = buildErrorProperties(config, testError);
  
  console.log('Built properties for Notion:');
  console.log(JSON.stringify(props, null, 2));
  console.log('');
  
  try {
    console.log('Creating error row in Notion Errors DB...');
    const response = await notion.pages.create({
      parent: { database_id: config.notion.dbErrorsId },
      properties: props
    });
    
    console.log('✅ ERROR ROW CREATED SUCCESSFULLY\n');
    console.log('Created page ID:', response.id);
    console.log('');
    
    // Retrieve the created page to verify
    console.log('Retrieving created error page...');
    const page = await notion.pages.retrieve({ page_id: response.id });
    
    console.log('Verified properties:');
    console.log('- Name:', page.properties.Name?.title[0]?.plain_text);
    console.log('- Provider:', page.properties.Provider?.select?.name);
    console.log('- Stage:', page.properties.Stage?.select?.name);
    console.log('- Email:', page.properties.Email?.email);
    console.log('- Error Code:', page.properties['Error Code']?.rich_text[0]?.plain_text);
    console.log('- Mailout ID:', page.properties['Mailout ID']?.rich_text[0]?.plain_text);
    console.log('');
    console.log('✅ Error row uses correct property types (select for Provider/Stage, email for Email)!');
    
  } catch (err) {
    console.error('❌ ERROR ROW CREATION FAILED');
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    if (err.body) console.error('Body:', err.body);
  }
}

testErrorLogging().catch(console.error);
