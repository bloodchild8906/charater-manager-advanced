import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireDM, requireCampaignMember, requireCampaignCharacterAccess } from '../../app/middleware/campaignAccess.js';

// Mock the modules
vi.mock('../../app/data/campaignRepository', () => ({
  getCampaignById: vi.fn(),
  getMemberByCharacter: vi.fn(),
  getMembersByCampaign: vi.fn(),
}));

vi.mock('../../app/store', () => ({
  getCharacterById: vi.fn(),
}));

// Import the mocked modules to get the mock functions
import * as campaignRepository from '../../app/data/campaignRepository';
import * as store from '../../app/store';

const mockGetCampaignById = campaignRepository.getCampaignById;
const mockGetMemberByCharacter = campaignRepository.getMemberByCharacter;
const mockGetMembersByCampaign = campaignRepository.getMembersByCampaign;
const mockGetCharacterById = store.getCharacterById;

describe('campaignAccess middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      params: {},
      body: {},
      user: null,
      campaign: null,
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('requireDM', () => {
    it('should return 400 if campaign ID is missing', async () => {
      await requireDM(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Campaign ID required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 404 if campaign not found', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockGetCampaignById.mockResolvedValue(null);

      await requireDM(mockReq, mockRes, mockNext);

      expect(mockGetCampaignById).toHaveBeenCalledWith('camp-123');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Campaign not found' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if user not authenticated', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockGetCampaignById.mockResolvedValue({
        id: 'camp-123',
        dmUserId: 'dm-123',
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      await requireDM(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 if user is not DM or admin', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.user = { id: 'user-456', role: 'player' };
      mockGetCampaignById.mockResolvedValue({
        id: 'camp-123',
        dmUserId: 'dm-123', // Different user
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      await requireDM(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'DM or admin access required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow DM user', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.user = { id: 'dm-123', role: 'gm' };
      const campaign = {
        id: 'camp-123',
        dmUserId: 'dm-123',
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockGetCampaignById.mockResolvedValue(campaign);

      await requireDM(mockReq, mockRes, mockNext);

      expect(mockReq.campaign).toEqual(campaign);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow admin user even if not DM', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.user = { id: 'admin-999', role: 'admin' };
      const campaign = {
        id: 'camp-123',
        dmUserId: 'dm-123', // Different user
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockGetCampaignById.mockResolvedValue(campaign);

      await requireDM(mockReq, mockRes, mockNext);

      expect(mockReq.campaign).toEqual(campaign);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireCampaignMember', () => {
    it('should allow DM without member record', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.user = { id: 'dm-123', role: 'gm' };
      const campaign = {
        id: 'camp-123',
        dmUserId: 'dm-123',
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      mockGetCampaignById.mockResolvedValue(campaign);

      await requireCampaignMember(mockReq, mockRes, mockNext);

      expect(mockReq.campaign).toEqual(campaign);
      expect(mockReq.campaignMember).toBeNull();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should find member without characterId', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.user = { id: 'player-456', role: 'player' };
      const campaign = {
        id: 'camp-123',
        dmUserId: 'dm-123',
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      const members = [
        {
          id: 'member-111',
          campaignId: 'camp-123',
          characterId: 'char-789',
          userId: 'player-456',
          status: 'accepted',
          playerNotes: null,
          dmNotes: null,
          joinedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockGetCampaignById.mockResolvedValue(campaign);
      mockGetMembersByCampaign.mockResolvedValue(members);

      await requireCampaignMember(mockReq, mockRes, mockNext);

      expect(mockGetMembersByCampaign).toHaveBeenCalledWith('camp-123');
      expect(mockReq.campaignMember).toEqual(members[0]);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should verify specific character when characterId provided', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.params.characterId = 'char-789';
      mockReq.user = { id: 'player-456', role: 'player' };
      
      const campaign = {
        id: 'camp-123',
        dmUserId: 'dm-123',
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const member = {
        id: 'member-111',
        campaignId: 'camp-123',
        characterId: 'char-789',
        userId: 'player-456',
        status: 'accepted',
        playerNotes: null,
        dmNotes: null,
        joinedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const character = {
        id: 'char-789',
        ownerUserId: 'player-456',
        name: 'Test Character',
      };

      mockGetCampaignById.mockResolvedValue(campaign);
      mockGetMemberByCharacter.mockResolvedValue(member);
      mockGetCharacterById.mockResolvedValue(character);

      await requireCampaignMember(mockReq, mockRes, mockNext);

      expect(mockGetMemberByCharacter).toHaveBeenCalledWith('camp-123', 'char-789');
      expect(mockGetCharacterById).toHaveBeenCalledWith('char-789');
      expect(mockReq.campaignMember).toEqual(member);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireCampaignCharacterAccess', () => {
    it('should return 400 if campaign ID or character ID missing', async () => {
      await requireCampaignCharacterAccess(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ 
        message: 'Campaign ID and Character ID required' 
      });

      mockReq.params.campaignId = 'camp-123';
      await requireCampaignCharacterAccess(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should allow character owner access', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.params.characterId = 'char-789';
      mockReq.user = { id: 'player-456', role: 'player' };
      
      const campaign = {
        id: 'camp-123',
        dmUserId: 'dm-123',
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const member = {
        id: 'member-111',
        campaignId: 'camp-123',
        characterId: 'char-789',
        userId: 'player-456',
        status: 'accepted',
        playerNotes: null,
        dmNotes: null,
        joinedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const character = {
        id: 'char-789',
        ownerUserId: 'player-456',
        name: 'Test Character',
      };

      mockGetCampaignById.mockResolvedValue(campaign);
      mockGetMemberByCharacter.mockResolvedValue(member);
      mockGetCharacterById.mockResolvedValue(character);

      await requireCampaignCharacterAccess(mockReq, mockRes, mockNext);

      expect(mockReq.campaign).toEqual(campaign);
      expect(mockReq.campaignMember).toEqual(member);
      expect(mockReq.campaignCharacter).toEqual(character);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow DM access even if not owner', async () => {
      mockReq.params.campaignId = 'camp-123';
      mockReq.params.characterId = 'char-789';
      mockReq.user = { id: 'dm-123', role: 'gm' };
      
      const campaign = {
        id: 'camp-123',
        dmUserId: 'dm-123',
        name: 'Test Campaign',
        status: 'active',
        visibility: 'invite-only',
        sessionCount: 0,
        maxPlayers: 6,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const member = {
        id: 'member-111',
        campaignId: 'camp-123',
        characterId: 'char-789',
        userId: 'player-456', // Different user
        status: 'accepted',
        playerNotes: null,
        dmNotes: null,
        joinedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      const character = {
        id: 'char-789',
        ownerUserId: 'player-456', // Different from DM
        name: 'Test Character',
      };

      mockGetCampaignById.mockResolvedValue(campaign);
      mockGetMemberByCharacter.mockResolvedValue(member);
      mockGetCharacterById.mockResolvedValue(character);

      await requireCampaignCharacterAccess(mockReq, mockRes, mockNext);

      expect(mockReq.campaign).toEqual(campaign);
      expect(mockReq.campaignMember).toEqual(member);
      expect(mockReq.campaignCharacter).toEqual(character);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});