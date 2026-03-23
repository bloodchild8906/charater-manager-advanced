/**
 * Campaign Conditions Module
 * Shared logic for adding and removing conditions
 */

/**
 * API helpers
 */
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const bodyText = await response.text();
  let body = {};

  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { message: bodyText };
    }
  }

  if (!response.ok) {
    throw new Error(body.message || `Request failed (${response.status})`);
  }

  return body;
}

/**
 * Add a condition to a character
 */
export async function addCondition(campaignId, characterId, condition, source = 'DM') {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/characters/${characterId}/apply-condition`, {
      method: 'POST',
      body: JSON.stringify({ condition, source }),
    });

    return payload;
  } catch (error) {
    console.error('addCondition error:', error);
    throw error;
  }
}

/**
 * Remove a condition from a character
 */
export async function removeCondition(campaignId, characterId, condition) {
  try {
    const payload = await api(`/api/campaigns/${campaignId}/characters/${characterId}/conditions/${condition}`, {
      method: 'DELETE',
    });

    return payload;
  } catch (error) {
    console.error('removeCondition error:', error);
    throw error;
  }
}

/**
 * Get all available conditions
 */
export function getAvailableConditions() {
  return [
    'Blinded',
    'Charmed',
    'Deafened',
    'Frightened',
    'Grappled',
    'Incapacitated',
    'Invisible',
    'Paralyzed',
    'Petrified',
    'Poisoned',
    'Prone',
    'Restrained',
    'Stunned',
    'Unconscious',
    'Exhaustion',
  ];
}
