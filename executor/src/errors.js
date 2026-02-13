function buildRichText(value) {
  return { rich_text: [{ text: { content: String(value) } }] };
}

function buildTitle(value) {
  return { title: [{ text: { content: String(value) } }] };
}

function buildDate(value) {
  return { date: { start: value } };
}

function buildCheckbox(value) {
  return { checkbox: !!value };
}

function buildNumber(value) {
  return { number: typeof value === 'number' ? value : null };
}

function buildSelect(value) {
  return { select: { name: String(value) } };
}

function buildEmail(value) {
  return { email: String(value) };
}

function buildErrorProperties(cfg, error) {
  const props = {};
  const p = cfg.notion.errorProps;
  const titleText = error.error_message || error.error_code || 'Error';

  props[p.title] = buildTitle(titleText.slice(0, 200));
  if (error.timestamp) props[p.timestamp] = buildDate(error.timestamp);
  if (error.mailout_id) props[p.mailoutId] = buildRichText(error.mailout_id);
  props[p.isTest] = buildCheckbox(!!error.is_test);
  if (error.provider) props[p.provider] = buildSelect(error.provider);
  if (error.stage) props[p.stage] = buildSelect(error.stage);
  if (error.email) props[p.email] = buildEmail(error.email);
  if (error.error_code) props[p.code] = buildRichText(error.error_code);
  if (error.error_message) props[p.message] = buildRichText(error.error_message);
  if (error.retry_count !== undefined) props[p.retry] = buildNumber(error.retry_count);

  return props;
}

module.exports = { buildErrorProperties };
