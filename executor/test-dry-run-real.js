require('dotenv').config();
const { config } = require('./src/config');
const { createNotionClient } = require('./src/notion');

async function testDryRun() {
  const notion = createNotionClient(config.notion.token);
  const mailoutId = '30537ae4-90d5-81de-b4c5-f626fe96ada3';
  
  console.log('=== DRY-RUN TEST ===\n');
  console.log('Mailout ID:', mailoutId);
  console.log('DRY_RUN_SEND:', config.runtime.dryRunSend);
  console.log('');
  
  // Get mailout page before
  console.log('Fetching mailout page before update...');
  const before = await notion.pages.retrieve({ page_id: mailoutId });
  console.log('Before - Name:', before.properties.Name?.title[0]?.plain_text);
  console.log('Before - Status:', before.properties.Status?.status?.name);
  console.log('');
  
  // Simulate update properties
  const buildStatus = (val) => ({ status: { name: val } });
  const buildDate = (val) => ({ date: { start: val } });
  const buildNumber = (val) => ({ number: val });
  
  const props = {};
  props[config.notion.statusProp] = buildStatus(config.notion.statusSentValue);
  props[config.notion.sentAtProp] = buildDate(new Date().toISOString());
  props[config.notion.sentCountProp] = buildNumber(5);
  props[config.notion.deliveredCountProp] = buildNumber(5);
  props[config.notion.bounceRateProp] = buildNumber(0);
  props[config.notion.failedCountProp] = buildNumber(0);
  
  console.log('Updating mailout page properties...');
  console.log('Properties to update:');
  console.log(JSON.stringify(props, null, 2));
  console.log('');
  
  try {
    await notion.pages.update({
      page_id: mailoutId,
      properties: props
    });
    console.log('✅ UPDATE SUCCEEDED\n');
    
    // Get after
    const after = await notion.pages.retrieve({ page_id: mailoutId });
    console.log('After - Name:', after.properties.Name?.title[0]?.plain_text);
    console.log('After - Status:', after.properties.Status?.status?.name);
    console.log('After - Sent At:', after.properties['Sent At']?.date?.start);
    console.log('After - Sent Count:', after.properties['Sent Count']?.number);
    console.log('');
    console.log('✅ Mailout page updated successfully without validation errors!');
  } catch (err) {
    console.error('❌ UPDATE FAILED');
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    if (err.body) console.error('Body:', err.body);
  }
}

testDryRun().catch(console.error);
