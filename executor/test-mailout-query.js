const { Client } = require('@notionhq/client');
const { config } = require('./src/config');

async function testMailout() {
  const notion = new Client({ auth: config.notion.token });
  const dbId = config.notion.dbMailoutsId;
  
  // Query mailouts database for test pages
  const response = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: config.notion.testProp,
      checkbox: {
        equals: true
      }
    },
    page_size: 1
  });
  
  if (response.results.length === 0) {
    console.log('No test mailouts found.');
    process.exit(1);
  }
  
  const page = response.results[0];
  console.log('Test mailout ID:', page.id);
  
  // Show current properties
  const props = page.properties;
  const getName = (p) => {
    if (p.type === 'title') return p.title.map(t => t.plain_text).join('');
    if (p.type === 'status') return p.status?.name;
    if (p.type === 'checkbox') return p.checkbox;
    return null;
  };
  
  console.log('Name:', getName(props[config.notion.subjectProp]));
  console.log('Status:', getName(props[config.notion.statusProp]));
  console.log('Test:', getName(props[config.notion.testProp]));
}

testMailout().catch(console.error);
