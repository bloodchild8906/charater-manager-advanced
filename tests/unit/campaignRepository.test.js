const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

function loadModules(overrides = {}) {
  restoreEnv();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }

  delete require.cache[require.resolve('../../app/database')];
  delete require.cache[require.resolve('../../app/store')];
  delete require.cache[require.resolve('../../app/data/campaignRepository')];

  return {
    store: require('../../app/store'),
    campaignRepository: require('../../app/data/campaignRepository'),
  };
}

afterEach(() => {
  restoreEnv();
  delete require.cache[require.resolve('../../app/database')];
  delete require.cache[require.resolve('../../app/store')];
  delete require.cache[require.resolve('../../app/data/campaignRepository')];
});

describe('campaignRepository (SQLite)', () => {
  let tempDir;
  let sqlitePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'camp-repo-'));
    sqlitePath = path.join(tempDir, 'test.sqlite');
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function seedUserAndCharacter(store, { userId = 'user-1', characterId = 'char-1' } = {}) {
    const ts = new Date().toISOString();
    await store.createUser({
      id: userId,
      email: `${userId}@example.com`,
      display_name: 'Tester',
      password_hash: 'h',
      password_salt: 's',
      role: 'gm',
      created_at: ts,
      updated_at: ts,
    });

    await store.createCharacter({
      id: characterId,
      owner_user_id: userId,
      name: 'Hero',
      edition: '2014',
      ancestry_slug: null,
      class_slug: 'fighter',
      background_slug: null,
      level: 1,
      data_json: JSON.stringify({
        hp: { max: 20, current: 20, temp: 0 },
        experience: 0,
        inventory: [],
      }),
      created_at: ts,
      updated_at: ts,
    });

    return { ts, userId, characterId };
  }

  it('creates, reads, updates, archives, and deletes campaigns', async () => {
    const { store, campaignRepository } = loadModules({
      DATABASE_PROVIDER: 'sqlite',
      SQLITE_DB_PATH: sqlitePath,
    });

    const { userId } = await seedUserAndCharacter(store);

    const created = await campaignRepository.createCampaign({
      name: 'Test',
      dmUserId: userId,
      visibility: 'public',
      maxPlayers: 8,
    });
    expect(created.id).toBeTruthy();
    expect(created.dmUserId).toBe(userId);

    const byId = await campaignRepository.getCampaignById(created.id);
    expect(byId.name).toBe('Test');

    const byDm = await campaignRepository.getCampaignsByDm(userId);
    expect(byDm.some((c) => c.id === created.id)).toBe(true);

    const publicList = await campaignRepository.getPublicCampaigns();
    expect(publicList.some((c) => c.id === created.id)).toBe(true);

    const updated = await campaignRepository.updateCampaign(created.id, { name: 'Renamed', sessionCount: 2 });
    expect(updated.name).toBe('Renamed');
    expect(updated.sessionCount).toBe(2);

    const archived = await campaignRepository.archiveCampaign(created.id);
    expect(archived.status).toBe('archived');

    await campaignRepository.deleteCampaign(created.id);
    expect(await campaignRepository.getCampaignById(created.id)).toBeNull();
  });

  it('manages members, invites, audit log, sessions, events, and compendium', async () => {
    const { store, campaignRepository } = loadModules({
      DATABASE_PROVIDER: 'sqlite',
      SQLITE_DB_PATH: sqlitePath,
    });

    const { userId, characterId } = await seedUserAndCharacter(store);

    const campaign = await campaignRepository.createCampaign({
      name: 'C',
      dmUserId: userId,
    });

    const member = await campaignRepository.inviteMember({
      campaignId: campaign.id,
      characterId,
      invitedByUserId: userId,
      actorUserId: userId,
    });
    expect(member.status).toBe('pending');

    const { total: auditTotal } = await campaignRepository.getAuditLog(campaign.id);
    expect(auditTotal).toBeGreaterThan(0);

    await campaignRepository.updateMemberStatus(campaign.id, member.id, 'accepted', userId);
    const accepted = await campaignRepository.getMemberByCharacter(campaign.id, characterId);
    expect(accepted.status).toBe('accepted');

    await campaignRepository.updateMemberNotes(campaign.id, member.id, 'secret', userId);
    const withNotes = await campaignRepository.getMemberById(member.id);
    expect(withNotes.dmNotes).toBe('secret');

    const invite = await campaignRepository.createInviteToken({
      campaignId: campaign.id,
      createdByUserId: userId,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(invite.token.length).toBe(64);

    const byTok = await campaignRepository.getInviteByToken(invite.token);
    expect(byTok.id).toBe(invite.id);

    const listed = await campaignRepository.listInvitesByCampaign(campaign.id);
    expect(listed.length).toBe(1);

    await campaignRepository.consumeInviteToken(invite.token, userId);
    await expect(campaignRepository.consumeInviteToken(invite.token, userId)).rejects.toThrow(/already used/);

    const session = await campaignRepository.createSession({
      campaignId: campaign.id,
      sessionNumber: 1,
      title: 'S1',
      attendance: [characterId],
      createdByUserId: userId,
    });
    expect(session.attendance).toEqual([characterId]);

    const updatedSession = await campaignRepository.updateSession(campaign.id, session.id, {
      attendance: [],
      summary: 'done',
    });
    expect(updatedSession.attendance).toEqual([]);
    expect(updatedSession.summary).toBe('done');

    const sessions = await campaignRepository.getSessionsByCampaign(campaign.id);
    expect(sessions.length).toBe(1);

    const entry = await campaignRepository.createCompendiumEntry({
      campaignId: campaign.id,
      contentType: 'items',
      name: 'Blade',
      data: { foo: 1 },
      tags: ['rare'],
      isPlayerVisible: false,
      createdByUserId: userId,
    });
    expect(entry.isPlayerVisible).toBe(false);

    const searchDm = await campaignRepository.searchCompendium(campaign.id, {
      search: 'Bla',
      includeHidden: true,
    });
    expect(searchDm.length).toBe(1);

    const searchPlayer = await campaignRepository.searchCompendium(campaign.id, {
      search: 'Bla',
      includeHidden: false,
    });
    expect(searchPlayer.length).toBe(0);

    await campaignRepository.updateCompendiumEntry(campaign.id, entry.id, { isPlayerVisible: true });
    const visible = await campaignRepository.getCompendiumEntry(campaign.id, entry.id);
    expect(visible.isPlayerVisible).toBe(true);

    await campaignRepository.deleteCompendiumEntry(campaign.id, entry.id);
    expect(await campaignRepository.getCompendiumEntry(campaign.id, entry.id)).toBeNull();

    await campaignRepository.removeMember(campaign.id, member.id, userId);
    const removed = await campaignRepository.getMemberById(member.id);
    expect(removed.status).toBe('removed');

    const byChar = await campaignRepository.getCampaignsByCharacter(characterId);
    expect(byChar.some((c) => c.id === campaign.id)).toBe(true);
  });

  it('applies xp_award, damage, healing, condition_applied, item_granted, loot, and world_event', async () => {
    const { store, campaignRepository } = loadModules({
      DATABASE_PROVIDER: 'sqlite',
      SQLITE_DB_PATH: sqlitePath,
    });

    const { userId, characterId } = await seedUserAndCharacter(store);
    const campaign = await campaignRepository.createCampaign({ name: 'E', dmUserId: userId });

    const m = await campaignRepository.inviteMember({
      campaignId: campaign.id,
      characterId,
      invitedByUserId: userId,
      actorUserId: userId,
    });
    await campaignRepository.updateMemberStatus(campaign.id, m.id, 'accepted', userId);

    const xpEvent = await campaignRepository.createEvent({
      campaignId: campaign.id,
      eventType: 'xp_award',
      payload: { amount: 400 },
      appliesTo: JSON.stringify([characterId]),
      createdByUserId: userId,
    });

    const xpOnly = await campaignRepository.getEventsByCampaign(campaign.id, { type: 'xp_award' });
    expect(xpOnly.every((e) => e.eventType === 'xp_award')).toBe(true);

    const xpResult = await campaignRepository.applyEvent(campaign.id, xpEvent.id, { actorUserId: userId });
    expect(xpResult.applied).toBe(true);
    expect(xpResult.levelUpAvailable).toBe(true);

    const charAfterXp = await store.getCharacterById(characterId);
    expect(charAfterXp.data.experience).toBe(400);

    const dmg = await campaignRepository.createEvent({
      campaignId: campaign.id,
      eventType: 'damage',
      payload: { amount: 5 },
      appliesTo: JSON.stringify([characterId]),
      createdByUserId: userId,
    });
    await campaignRepository.applyEvent(campaign.id, dmg.id, { actorUserId: userId });
    expect((await store.getCharacterById(characterId)).data.hp.current).toBe(15);

    const heal = await campaignRepository.createEvent({
      campaignId: campaign.id,
      eventType: 'healing',
      payload: { amount: 3 },
      appliesTo: JSON.stringify([characterId]),
      createdByUserId: userId,
    });
    await campaignRepository.applyEvent(campaign.id, heal.id, { actorUserId: userId });
    expect((await store.getCharacterById(characterId)).data.hp.current).toBe(18);

    const cond = await campaignRepository.createEvent({
      campaignId: campaign.id,
      eventType: 'condition_applied',
      payload: { conditionName: 'Poisoned', source: 'trap' },
      appliesTo: JSON.stringify([characterId]),
      createdByUserId: userId,
    });
    await campaignRepository.applyEvent(campaign.id, cond.id, { actorUserId: userId });

    const itemEv = await campaignRepository.createEvent({
      campaignId: campaign.id,
      eventType: 'item_granted',
      payload: { name: 'Potion', quantity: 1 },
      appliesTo: JSON.stringify([characterId]),
      createdByUserId: userId,
    });
    await campaignRepository.applyEvent(campaign.id, itemEv.id, { actorUserId: userId });
    expect((await store.getCharacterById(characterId)).data.inventory.length).toBe(1);

    const loot = await campaignRepository.createEvent({
      campaignId: campaign.id,
      eventType: 'loot',
      payload: { name: 'Gem', quantity: 1 },
      createdByUserId: userId,
    });
    await campaignRepository.applyEvent(campaign.id, loot.id, {
      actorUserId: userId,
      distributeToCharacterId: characterId,
    });
    const lootRow = await campaignRepository.getEventById(campaign.id, loot.id);
    expect(lootRow.distributedTo).toBe(characterId);
    expect(lootRow.appliedAt).toBeTruthy();

    const world = await campaignRepository.createEvent({
      campaignId: campaign.id,
      eventType: 'world_event',
      payload: {},
      createdByUserId: userId,
    });
    await campaignRepository.applyEvent(campaign.id, world.id, { actorUserId: userId });
    expect((await campaignRepository.getEventById(campaign.id, world.id)).appliedAt).toBeTruthy();

    await expect(campaignRepository.applyEvent(campaign.id, xpEvent.id, { actorUserId: userId })).rejects.toThrow(
      /already applied/,
    );
  });

  it('exports XP_THRESHOLDS aligned with xpToLevel behaviour', async () => {
    const { campaignRepository } = loadModules({
      DATABASE_PROVIDER: 'sqlite',
      SQLITE_DB_PATH: sqlitePath,
    });
    expect(campaignRepository.XP_THRESHOLDS.length).toBe(20);
    expect(campaignRepository.XP_THRESHOLDS[0]).toBe(0);
    expect(campaignRepository.XP_THRESHOLDS[1]).toBe(300);
  });
});
