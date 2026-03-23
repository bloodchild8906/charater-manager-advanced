const { createId, hashPassword, nowIso } = require('../../app/security');
const { createUser, createCharacter, ensureAppStorage } = require('../../app/store');
const {
  createCampaign,
  getCampaignById,
  deleteCampaign,
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

describe('Campaign Routes Integration Tests', () => {
  let gmUser;
  let playerUser;
  let testCampaign;
  let testCharacter;

  beforeAll(async () => {
    process.env.DATABASE_PROVIDER = 'sqlite';
    process.env.SQLITE_PATH = ':memory:';

    await ensureAppStorage();

    // Create GM user with unique email to avoid conflicts
    const gmEmail = `gm-${Date.now()}@test.com`;
    const { salt: gmSalt, hash: gmHash } = hashPassword('password123');
    gmUser = await createUser({
      id: createId(),
      email: gmEmail,
      display_name: 'Test GM',
      password_hash: gmHash,
      password_salt: gmSalt,
      role: 'gm',
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    // Create player user with unique email to avoid conflicts
    const playerEmail = `player-${Date.now()}@test.com`;
    const { salt: playerSalt, hash: playerHash } = hashPassword('password123');
    playerUser = await createUser({
      id: createId(),
      email: playerEmail,
      display_name: 'Test Player',
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
      name: 'Test Character',
      edition: 'all',
      ancestry_slug: 'human',
      class_slug: 'fighter',
      background_slug: 'soldier',
      level: 1,
      data_json: JSON.stringify({ name: 'Test Character', level: 1 }),
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });

  beforeEach(async () => {
    // Clean up any existing test campaigns
    if (testCampaign) {
      try {
        await deleteCampaign(testCampaign.id);
      } catch (error) {
        // Ignore errors
      }
      testCampaign = null;
    }
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

  describe('POST /api/campaigns', () => {
    it('should create a campaign as GM', async () => {
      const req = createMockRequest(gmUser, {}, {
        name: 'Test Campaign',
        description: 'A test campaign',
        visibility: 'invite-only',
        maxPlayers: 6,
      });
      const res = createMockResponse();

      await campaignRoutes.handleCreateCampaign(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.data.campaign).toBeDefined();
      expect(res.data.campaign.name).toBe('Test Campaign');
      expect(res.data.campaign.dmUserId).toBe(gmUser.id);

      testCampaign = res.data.campaign;
    });

    it('should reject campaign creation by player', async () => {
      const req = createMockRequest(playerUser, {}, {
        name: 'Test Campaign',
        description: 'A test campaign',
      });
      const res = createMockResponse();

      await campaignRoutes.handleCreateCampaign(req, res);

      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated campaign creation', async () => {
      const req = createMockRequest(null, {}, {
        name: 'Test Campaign',
      });
      const res = createMockResponse();

      await campaignRoutes.handleCreateCampaign(req, res);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/campaigns', () => {
    beforeEach(async () => {
      testCampaign = await createCampaign({
        name: 'Test Campaign',
        description: 'A test campaign',
        dmUserId: gmUser.id,
        visibility: 'invite-only',
        maxPlayers: 6,
      });
    });

    it('should list campaigns for GM', async () => {
      const req = createMockRequest(gmUser);
      const res = createMockResponse();

      await campaignRoutes.handleListCampaigns(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.campaigns).toBeDefined();
      expect(res.data.campaigns.dm).toBeDefined();
      expect(res.data.campaigns.dm.length).toBeGreaterThan(0);
      expect(res.data.campaigns.dm[0].id).toBe(testCampaign.id);
    });

    it('should require authentication', async () => {
      const req = createMockRequest(null);
      const res = createMockResponse();

      await campaignRoutes.handleListCampaigns(req, res);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/campaigns/public', () => {
    beforeEach(async () => {
      testCampaign = await createCampaign({
        name: 'Public Campaign',
        description: 'A public campaign',
        dmUserId: gmUser.id,
        visibility: 'public',
        maxPlayers: 6,
      });
    });

    it('should list public campaigns', async () => {
      const req = createMockRequest(playerUser);
      const res = createMockResponse();

      await campaignRoutes.handleGetPublicCampaigns(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.campaigns).toBeDefined();
      expect(res.data.campaigns.length).toBeGreaterThan(0);
      expect(res.data.campaigns.some(c => c.id === testCampaign.id)).toBe(true);
    });
  });

  describe('GET /api/campaigns/:id', () => {
    beforeEach(async () => {
      testCampaign = await createCampaign({
        name: 'Test Campaign',
        description: 'A test campaign',
        dmUserId: gmUser.id,
        visibility: 'invite-only',
        maxPlayers: 6,
      });
    });

    it('should get campaign details as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id });
      const res = createMockResponse();

      await campaignRoutes.handleGetCampaign(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.campaign).toBeDefined();
      expect(res.data.campaign.id).toBe(testCampaign.id);
      expect(res.data.campaign.name).toBe('Test Campaign');
    });

    it('should reject access to private campaign by non-member', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id });
      const res = createMockResponse();

      await campaignRoutes.handleGetCampaign(req, res);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/campaigns/:id', () => {
    beforeEach(async () => {
      testCampaign = await createCampaign({
        name: 'Test Campaign',
        description: 'A test campaign',
        dmUserId: gmUser.id,
        visibility: 'invite-only',
        maxPlayers: 6,
      });
    });

    it('should update campaign as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id }, {
        name: 'Updated Campaign',
        description: 'Updated description',
      });
      const res = createMockResponse();

      await campaignRoutes.handleUpdateCampaign(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.campaign.name).toBe('Updated Campaign');
      expect(res.data.campaign.description).toBe('Updated description');
    });

    it('should reject update by non-DM', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id }, {
        name: 'Updated Campaign',
      });
      const res = createMockResponse();

      // Need to call requireDM middleware first
      await campaignRoutes.requireDM(req, res, async () => {
        await campaignRoutes.handleUpdateCampaign(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/campaigns/:id', () => {
    beforeEach(async () => {
      testCampaign = await createCampaign({
        name: 'Test Campaign',
        description: 'A test campaign',
        dmUserId: gmUser.id,
        visibility: 'invite-only',
        maxPlayers: 6,
      });
    });

    it('should delete campaign as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id });
      const res = createMockResponse();

      await campaignRoutes.handleDeleteCampaign(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.deleted).toBe(true);

      // Verify deletion
      const campaign = await getCampaignById(testCampaign.id);
      expect(campaign).toBeNull();

      testCampaign = null;
    });

    it('should reject deletion by non-DM', async () => {
      const req = createMockRequest(playerUser, { id: testCampaign.id });
      const res = createMockResponse();

      await campaignRoutes.requireDM(req, res, async () => {
        await campaignRoutes.handleDeleteCampaign(req, res);
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/campaigns/:id/archive', () => {
    beforeEach(async () => {
      testCampaign = await createCampaign({
        name: 'Test Campaign',
        description: 'A test campaign',
        dmUserId: gmUser.id,
        visibility: 'invite-only',
        maxPlayers: 6,
      });
    });

    it('should archive campaign as DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id });
      const res = createMockResponse();

      await campaignRoutes.handleArchiveCampaign(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.campaign.status).toBe('archived');
    });
  });

  describe('POST /api/campaigns/:id/transfer', () => {
    beforeEach(async () => {
      testCampaign = await createCampaign({
        name: 'Test Campaign',
        description: 'A test campaign',
        dmUserId: gmUser.id,
        visibility: 'invite-only',
        maxPlayers: 6,
      });
    });

    it('should transfer campaign to new DM', async () => {
      const req = createMockRequest(gmUser, { id: testCampaign.id }, {
        newDmUserId: playerUser.id,
      });
      const res = createMockResponse();

      await campaignRoutes.handleTransferCampaign(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.data.campaign.dmUserId).toBe(playerUser.id);
    });
  });
});
