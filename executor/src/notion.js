const { Client } = require('@notionhq/client');

function createNotionClient(token) {
  if (!token) return null;
  return new Client({ auth: token });
}

function extractTextFromProperty(prop) {
  if (!prop) return null;
  if (prop.type === 'title') {
    return prop.title.map((t) => t.plain_text).join('').trim();
  }
  if (prop.type === 'rich_text') {
    return prop.rich_text.map((t) => t.plain_text).join('').trim();
  }
  if (prop.type === 'select') {
    return prop.select?.name ?? null;
  }
  if (prop.type === 'status') {
    return prop.status?.name ?? null;
  }
  if (prop.type === 'checkbox') {
    return !!prop.checkbox;
  }
  if (prop.type === 'number') {
    return prop.number ?? null;
  }
  if (prop.type === 'date') {
    return prop.date?.start ?? null;
  }
  return null;
}

async function getPage(client, pageId) {
  return client.pages.retrieve({ page_id: pageId });
}

async function listAllBlocks(client, blockId) {
  const blocks = [];
  let cursor = undefined;
  do {
    const resp = await client.blocks.children.list({ block_id: blockId, start_cursor: cursor });
    blocks.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function getPageContent(client, pageId) {
  const blocks = await listAllBlocks(client, pageId);
  return blocks;
}

function getPageMeta(page, props) {
  const properties = page.properties || {};
  const findProp = (name) => properties[name];

  const subjectProp = findProp(props.subjectProp) ||
    Object.values(properties).find((p) => p.type === 'title');

  const statusProp = findProp(props.statusProp);
  const testProp = findProp(props.testProp);
  const sentAtProp = findProp(props.sentAtProp);

  const subject = extractTextFromProperty(subjectProp) || '';
  const status = extractTextFromProperty(statusProp) || null;
  const isTest = !!extractTextFromProperty(testProp);
  const sentAt = extractTextFromProperty(sentAtProp);

  return { subject, status, isTest, sentAt };
}

async function updatePageProperties(client, pageId, properties) {
  return client.pages.update({ page_id: pageId, properties });
}

function buildNumberProp(value) {
  return { number: value };
}

function buildStatusProp(value) {
  return { status: { name: value } };
}

function buildDateProp(value) {
  if (!value) return { date: null };
  return { date: { start: value } };
}

async function createErrorRow(client, dbId, props) {
  if (!client || !dbId) return null;
  return client.pages.create({
    parent: { database_id: dbId },
    properties: props
  });
}

module.exports = {
  createNotionClient,
  getPage,
  getPageContent,
  getPageMeta,
  updatePageProperties,
  buildNumberProp,
  buildStatusProp,
  buildDateProp,
  createErrorRow,
  extractTextFromProperty
};
