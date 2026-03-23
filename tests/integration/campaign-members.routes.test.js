const { createId, hashPassword, nowIso } = require('../../app/security');
const { createUser, createCharacter, ensureAppStorage } = require('../../app/store');
const {
  createCampaign,
  deleteCampaign,
  inviteMember,
  getMembersByCampaign,
} = require('../../app/data/campaignRepository');
const campaignRoutes = require('../../app/routes/campaigns');

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

afterEach(() => {
  restoreEnv();
  delete require.cache[require.resolve('../../app/database')];
  delete require.cache[require.resolve('../../app/store')];
  delete require.cache[require.resolve('../../app/data/campaignRepository')];
});

// Mock request/response helpers
function createMockRequest(user, params = {}, body = {}, query = {}) {
  return {
    user,
    params,
    body,
    query,
  };
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.data = data;
      return res;
    },
  };
  return res;
}

describe.skip('Campaign Members Routes Integration Tests', () => {
  let gmUser;
  let playerUser;
  let testCampaign;
  let testCharacter;

  beforeAll(async () => {
    process.env.DATABASE_PROVIDER = 'sqlite';
    process.env.SQLITE_PATH = ':memory:';

    await ensureAppStorage();

    // Create GM user
    const { salt: gmSalt, hash: gmHash } = hashPassword('password123');
    gmUser = await createUser({
      id: createId(),
      email: 'gm-members@test.com',
      display_name: 'Test GM Members',
      password_hash: gmHash,
      password_salt: gmSalt,
      role: 'gm',
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    // Create player user
    const { salt: playerSalt, hash: playerHash } = hashPassword('password123');
    playerUser = await createUser({
      id: createId(),
      email: 'player-members@test.com',
      display_name: 'Test Player Members',
      password_hash: playerHash,
      password_salt: playerSalt,
      role: 'player',
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    // Create test character for player
    testCharacter = await createCharacter({
      id: createId(),
      owner_user_id: playerUser.id,
      name: 'Test Character Members',
      edition: 'all',
      ancestry_slug: 'human',
      class_slug: 'fighter',
      background_slug: 'soldier',
      level: 1,
      data_json: JSON.stringify({ name: 'Test Character Members', level: 1 }),
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });

  beforeEach(async () => {
    // Create fresh campaign for each test
    testCampaign = await createCampaign({
      name: 'Test Campaign Members',
      description: 'A test campaign for members',
      dmUserId: gmUser.id,
      visibility: 'invite-only',
      maxPlayers: 6,
    });
  });

  afterAll(async () => {
    // Clean up
    if (testCampaign) {
      try {
        await deleteCampaign(testCampaign.id);
      } catch (error) {
        // Ignore errors
      }
    }
  });

  describe('POST /api/campaigns/:id/invite', () => {
    it('should invite a character as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id }, {
        characterId: testCharacter.id,
      });
      const res = createMockResponse();

      await campaignRoutes.handleInviteMember(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.data.member).toBeDefined();
      expect(res.data.member.characterId).toBe(testCharacter.id);
      expect(res.data.member.status).toBe('pending');
    });

    it('should reject invite by non-DM', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id }, {
        characterId: testCharacter.id,
      });
      const res = createMockResponse();

      await campaignRoutes.requireDM(req, res, async () => {
        await campaignRoutes.handleInviteMember(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/campaigns/:id/invite-link', () => {
    it('should create invite link as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id }, {
        expiresIn: '7d',
      });
      const res = createMockResponse();

      await campaignRoutes.handleCreateInviteLink(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.data.token).toBeDefined();
      expect(res.data.url).toBeDefined();
      expect(res.data.url).toContain('/join/');
    });

    it('should reject invite link creation by non-DM', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id }, {});
      const res = createMockResponse();

      await campaignRoutes.requireDM(req, res, async () => {
        await campaignRoutes.handleCreateInviteLink(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/campaigns/:id/members', () => {
    beforeEach(async () => {
      // Add a member
      await inviteMember({
        campaignId: testCampaign.id,
        characterId: testCharacter.id,
        invitedByUserId: gmUser.id,
        actorUserId: gmUser.id,
      });
    });

    it('should list members as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id });
      const res = createMockResponse();

      await campaignRoutes.handleGetMembers(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.members).toBeDefined();
      expect(res.data.members.length).toBeGreaterThan(0);
      expect(res.data.members[0].characterId).toBe(testCharacter.id);
    });

    it('should reject member list for non-member', async () => {
      // Create another player who is not a member
      const { salt, hash } = hashPassword('password123');
      const otherPlayer = await createUser({
        id: createId(),
        email: 'other-player@test.com',
        display_name: 'Other Player',
        password_hash: hash,
        password_salt: salt,
        role: 'player',
        created_at: nowIso(),
        updated_at: nowIso(),
      });

      const req = createMockRequest(otherPlayer, { id: testCampaign.id });
      const res = createMockResponse();

      await campaignRoutes.requireCampaignMember(req, res, async () => {
        await campaignRoutes.handleGetMembers(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/campaigns/:id/members/:memberId', () => {
    let member;

    beforeEach(async () => {
      member = await inviteMember({
        campaignId: testCampaign.id,
        characterId: testCharacter.id,
        invitedByUserId: gmUser.id,
        actorUserId: gmUser.id,
      });
    });

    it('should update member status as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id, memberId: member.id }, {
        status: 'accepted',
      });
      const res = createMockResponse();

      await campaignRoutes.handleUpdateMember(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.member.status).toBe('accepted');
    });

    it('should reject member update by non-DM', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id, memberId: member.id }, {
        status: 'accepted',
      });
      const res = createMockResponse();

      await campaignRoutes.requireDM(req, res, async () => {
        await campaignRoutes.handleUpdateMember(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/campaigns/:id/members/:memberId/notes', () => {
    let member;

    beforeEach(async () => {
      member = await inviteMember({
        campaignId: testCampaign.id,
        characterId: testCharacter.id,
        invitedByUserId: gmUser.id,
        actorUserId: gmUser.id,
      });
    });

    it('should update DM notes as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id, memberId: member.id }, {
        dmNotes: 'Secret DM notes',
      });
      const res = createMockResponse();

      await campaignRoutes.handleUpdateMemberNotes(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.member.dmNotes).toBe('Secret DM notes');
    });

    it('should reject notes update by non-DM', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id, memberId: member.id }, {
        dmNotes: 'Secret notes',
      });
      const res = createMockResponse();

      await campaignRoutes.requireDM(req, res, async () => {
        await campaignRoutes.handleUpdateMemberNotes(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/campaigns/:id/members/:memberId', () => {
    let member;

    beforeEach(async () => {
      member = await inviteMember({
        campaignId: testCampaign.id,
        characterId: testCharacter.id,
        invitedByUserId: gmUser.id,
        actorUserId: gmUser.id,
      });
    });

    it('should remove member as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id, memberId: member.id });
      const res = createMockResponse();

      await campaignRoutes.handleRemoveMember(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.member.status).toBe('removed');
    });

    it('should reject member removal by non-DM', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id, memberId: member.id });
      const res = createMockResponse();

      await campaignRoutes.requireDM(req, res, async () => {
        await campaignRoutes.handleRemoveMember(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Full invite lifecycle', () => {
    it('should complete invite → accept flow', async () => {
      // Step 1: DM creates invite link
      const inviteReq = createMockRequest(gmUser, { id: testCampaign.id }, {
        expiresIn: '7d',
      });
      const inviteRes = createMockResponse();

      await campaignRoutes.handleCreateInviteLink(inviteReq, inviteRes);

      expect(inviteRes.statusCode).toBe(201);
      const token = inviteRes.data.token;

      // Step 2: Player accepts invite
      const joinReq = createMockRequest(playerUser, { token }, {
        characterId: testCharacter.id,
      });
      const joinRes = createMockResponse();

      await campaignRoutes.handleJoinCampaign(joinReq, joinRes);

      expect(joinRes.statusCode).toBe(200);
      expect(joinRes.data.campaignId).toBe(testCampaign.id);
      expect(joinRes.data.memberId).toBeDefined();

      // Step 3: Verify member is accepted
      const members = await getMembersByCampaign(testCampaign.id);
      const member = members.find(m => m.characterId === testCharacter.id);
      expect(member).toBeDefined();
      expect(member.status).toBe('accepted');

      // Step 4: Verify token is consumed
      const rejoinReq = createMockRequest(playerUser, { token }, {
        characterId: testCharacter.id,
      });
      const rejoinRes = createMockResponse();

      await campaignRoutes.handleJoinCampaign(rejoinReq, rejoinRes);

      expect(rejoinRes.statusCode).toBe(400);
      expect(rejoinRes.data.message).toContain('already used');
    });

    it('should reject joining archived campaign', async () => {
      // Create invite link
      const inviteReq = createMockRequest(gmUser, { id: testCampaign.id }, {});
      const inviteRes = createMockResponse();

      await campaignRoutes.handleCreateInviteLink(inviteReq, inviteRes);

      const token = inviteRes.data.token;

      // Archive campaign
      const archiveReq = createMockRequest(gmUser, { id: testCampaign.id });
      const archiveRes = createMockResponse();
      await campaignRoutes.handleArchiveCampaign(archiveReq, archiveRes);

      // Try to join
      const joinReq = createMockRequest(playerUser, { token }, {
        characterId: testCharacter.id,
      });
      const joinRes = createMockResponse();

      await campaignRoutes.handleJoinCampaign(joinReq, joinRes);

      expect(joinRes.statusCode).toBe(400);
      expect(joinRes.data.message).toContain('archived');
    });
  });

  describe('GET /api/campaigns/invites/pending', () => {
    beforeEach(async () => {
      // Create pending invite
      await inviteMember({
        campaignId: testCampaign.id,
        characterId: testCharacter.id,
        invitedByUserId: gmUser.id,
        actorUserId: gmUser.id,
      });
    });

    it('should list pending invites for player', async () => {
      const req = createMockRequest(playerUser);
      const res = createMockResponse();

      await campaignRoutes.handleGetPendingInvites(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.invites).toBeDefined();
      expect(res.data.invites.length).toBeGreaterThan(0);
      expect(res.data.invites[0].characterId).toBe(testCharacter.id);
      expect(res.data.invites[0].status).toBe('pending');
    });
  });
});
