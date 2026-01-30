function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRichText(richText = []) {
  let html = '';
  let text = '';
  for (const rt of richText) {
    const plain = rt.plain_text || '';
    text += plain;
    let h = escapeHtml(plain);
    const ann = rt.annotations || {};
    if (ann.code) h = `<code>${h}</code>`;
    if (ann.bold) h = `<strong>${h}</strong>`;
    if (ann.italic) h = `<em>${h}</em>`;
    if (ann.underline) h = `<u>${h}</u>`;
    if (ann.strikethrough) h = `<s>${h}</s>`;
    if (rt.href) h = `<a href="${rt.href}">${h}</a>`;
    html += h;
  }
  return { html, text };
}

function renderBlock(block) {
  const type = block.type;
  const data = block[type];
  if (!data) return { html: null, text: null, unsupported: true };

  switch (type) {
    case 'paragraph': {
      const { html, text } = renderRichText(data.rich_text);
      if (!html && !text) return { html: null, text: null };
      return { html: `<p>${html}</p>`, text };
    }
    case 'heading_1': {
      const { html, text } = renderRichText(data.rich_text);
      return { html: `<h1>${html}</h1>`, text };
    }
    case 'heading_2': {
      const { html, text } = renderRichText(data.rich_text);
      return { html: `<h2>${html}</h2>`, text };
    }
    case 'heading_3': {
      const { html, text } = renderRichText(data.rich_text);
      return { html: `<h3>${html}</h3>`, text };
    }
    case 'quote': {
      const { html, text } = renderRichText(data.rich_text);
      return { html: `<blockquote>${html}</blockquote>`, text };
    }
    case 'divider':
      return { html: '<hr>', text: '' };
    case 'image': {
      const url = data.type === 'external' ? data.external?.url : data.file?.url;
      if (!url) return { html: null, text: null, unsupported: true };
      return { html: `<img src="${url}" alt="image">`, text: url };
    }
    case 'code': {
      const { html, text } = renderRichText(data.rich_text);
      const lang = data.language || '';
      return { html: `<pre><code data-lang="${lang}">${html}</code></pre>`, text };
    }
    case 'callout': {
      const { html, text } = renderRichText(data.rich_text);
      return { html: `<blockquote>${html}</blockquote>`, text };
    }
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do': {
      const { html, text } = renderRichText(data.rich_text);
      return { html, text, listItem: true, listType: type };
    }
    default:
      return { html: null, text: null, unsupported: true };
  }
}

function renderBlocks(blocks) {
  const htmlParts = [];
  const textParts = [];
  const errors = [];

  let listBuffer = null; // { type: 'ul'|'ol', itemsHtml: [], itemsText: [] }

  function flushList() {
    if (!listBuffer) return;
    const tag = listBuffer.type;
    const html = `<${tag}>${listBuffer.itemsHtml.join('')}</${tag}>`;
    htmlParts.push(html);
    textParts.push(listBuffer.itemsText.join('\n'));
    listBuffer = null;
  }

  for (const block of blocks) {
    const rendered = renderBlock(block);

    if (rendered.listItem) {
      const tag = rendered.listType === 'numbered_list_item' ? 'ol' : 'ul';
      if (!listBuffer || listBuffer.type !== tag) {
        flushList();
        listBuffer = { type: tag, itemsHtml: [], itemsText: [] };
      }
      listBuffer.itemsHtml.push(`<li>${rendered.html}</li>`);
      listBuffer.itemsText.push(`- ${rendered.text}`);
      continue;
    }

    flushList();

    if (rendered.unsupported) {
      errors.push({
        type: 'content_block_unsupported',
        blockType: block.type
      });
      if (block[block.type]?.rich_text) {
        const { html, text } = renderRichText(block[block.type].rich_text);
        if (html) htmlParts.push(`<p>${html}</p>`);
        if (text) textParts.push(text);
      }
      continue;
    }

    if (rendered.html) htmlParts.push(rendered.html);
    if (rendered.text) textParts.push(rendered.text);
  }

  flushList();

  return {
    html: htmlParts.join('\n'),
    text: textParts.join('\n'),
    errors
  };
}

module.exports = { renderBlocks };
