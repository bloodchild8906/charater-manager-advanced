import { EDITION_OPTIONS } from './constants.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function titleize(value, fallback = 'Unassigned') {
  const normalized = String(value || '')
    .trim()
    .replaceAll(/[-_]+/g, ' ');

  if (!normalized) {
    return fallback;
  }

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function editionLabel(value) {
  return EDITION_OPTIONS.find(([code]) => code === value)?.[1] || titleize(value, 'All Sources');
}

export function renderMetaBits(bits) {
  const filteredBits = bits.filter(Boolean);
  if (filteredBits.length === 0) {
    return '';
  }

  return filteredBits
    .map((bit) => `<span>${escapeHtml(bit)}</span>`)
    .join('<span class="meta-sep">&middot;</span>');
}

export function getAbilityModifierValue(score) {
  return Math.floor((Number(score || 10) - 10) / 2);
}

export function abilityModifier(score) {
  const modifier = getAbilityModifierValue(score);
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

export function clampNumber(value, minimum, maximum, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, numericValue));
}

export function formatSigned(value) {
  const numericValue = Number(value || 0);
  return numericValue >= 0 ? `+${numericValue}` : String(numericValue);
}

export function describeRollFormula(count, sides, modifier = 0) {
  return `${count}d${sides}${Number(modifier) === 0 ? '' : formatSigned(modifier)}`;
}

export function readFormControlValue(target) {
  if (target.type === 'checkbox') {
    return Boolean(target.checked);
  }

  if (target.type === 'number') {
    return Number(target.value || 0);
  }

  return target.value;
}

export function normalizeDiceExpression(expression) {
  const normalized = String(expression || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!normalized) {
    return '';
  }

  return normalized.replace(/^d(\d+)$/i, '1d$1');
}

export function analyzeRollFormula(formula) {
  const normalized = normalizeDiceExpression(formula);
  if (!normalized) {
    return null;
  }

  const terms = normalized.match(/[+-]?[^+-]+/g) || [];
  let modifier = 0;
  let hasDice = false;

  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const raw = term.replace(/^[+-]/, '');
    if (/^\d*d\d+$/i.test(raw)) {
      hasDice = true;
      continue;
    }

    if (/^\d+$/.test(raw)) {
      modifier += sign * Number(raw);
      continue;
    }

    return null;
  }

  return {
    formula: normalized,
    modifier,
    hasDice,
  };
}

export function buildFormulaWithModifier(expression, modifier = 0) {
  const normalizedExpression = normalizeDiceExpression(expression);
  if (!normalizedExpression) {
    return '';
  }

  return `${normalizedExpression}${Number(modifier) === 0 ? '' : formatSigned(modifier)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
