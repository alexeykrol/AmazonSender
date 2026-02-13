const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

async function findMailout() {
  try {
    // Query all mailouts (no filter)
    const response = await notion.databases.query({
      database_id: process.env.NOTION_DB_MAILOUTS_ID,
      page_size: 5
    });
    
    console.log(`Found ${response.results.length} mailout(s):\n`);
    
    response.results.forEach((page, i) => {
      const props = page.properties;
      const getName = (p) => {
        if (p.type === 'title') return p.title.map(t => t.plain_text).join('') || '(no title)';
        if (p.type === 'status') return p.status?.name || '(no status)';
        if (p.type === 'checkbox') return p.checkbox;
        return null;
      };
      
      console.log(`${i+1}. Page ID: ${page.id}`);
      console.log(`   Name: ${getName(props.Name)}`);
      console.log(`   Status: ${getName(props.Status)}`);
      if (props.Test) console.log(`   Test: ${getName(props.Test)}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.code, error.message);
  }
}

findMailout();
