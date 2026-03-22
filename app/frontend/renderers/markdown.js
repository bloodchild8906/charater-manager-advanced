import { escapeHtml } from '../utils.js';

function sanitizeMarkdownUrl(url) {
  const value = String(url || '').trim();
  if (!value) {
    return '';
  }

  return /^(https?:|mailto:|\/|#)/i.test(value) ? value : '';
}

function applyInlineMarkdown(text) {
  const codeSnippets = [];
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE_${codeSnippets.length}@@`;
    codeSnippets.push(`<code>${code}</code>`);
    return token;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = sanitizeMarkdownUrl(url);
    if (!safeUrl) {
      return label;
    }

    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${label}</a>`;
  });

  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');

  html = html.replace(/\n/g, '<br />');

  for (const [index, snippet] of codeSnippets.entries()) {
    html = html.replace(`@@CODE_${index}@@`, snippet);
  }

  return html;
}

function isUnorderedListLine(line) {
  return /^[-*+]\s+/.test(line);
}

function isOrderedListLine(line) {
  return /^\d+\.\s+/.test(line);
}

function isBlockBoundary(line) {
  return /^#{1,6}\s+/.test(line) || isUnorderedListLine(line) || isOrderedListLine(line);
}

export function renderMarkdown(markdown, emptyCopy = 'No details available.') {
  const normalized = String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!normalized) {
    return `<p class="markdown-content__empty">${escapeHtml(emptyCopy)}</p>`;
  }

  const lines = normalized.split('\n');
  const blocks = [];

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${applyInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (isUnorderedListLine(line)) {
      const items = [];
      while (index < lines.length && isUnorderedListLine(lines[index])) {
        items.push(`<li>${applyInlineMarkdown(lines[index].replace(/^[-*+]\s+/, '').trim())}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (isOrderedListLine(line)) {
      const items = [];
      while (index < lines.length && isOrderedListLine(lines[index])) {
        items.push(`<li>${applyInlineMarkdown(lines[index].replace(/^\d+\.\s+/, '').trim())}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !isBlockBoundary(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${applyInlineMarkdown(paragraphLines.join('\n'))}</p>`);
  }

  return blocks.join('');
}
