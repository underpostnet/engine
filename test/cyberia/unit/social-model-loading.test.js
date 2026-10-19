import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongooseDB } from '../../../src/db/mongo/MongooseDB.js';
import { CyberiaSocialModel } from '../../../src/api/cyberia-social/cyberia-social.model.js';
import { canonicalPair } from '../../../src/api/cyberia-social/relationship.js';

describe('Cyberia social model loading', () => {
  const low = new mongoose.Types.ObjectId('640000000000000000000001');
  const high = new mongoose.Types.ObjectId('640000000000000000000002');
  const request = () => ({ low, high, requester: low, expiresAt: new Date(Date.now() + 60000) });

  it('normalizes either request direction to the same pair', () => {
    expect(canonicalPair(high, low)).toEqual(canonicalPair(low, high));
  });

  it.each([
    { low: high, high: low },
    { high: low },
    { requester: new mongoose.Types.ObjectId() },
    { expiresAt: undefined },
    { status: 'accepted' },
  ])('rejects an invalid relationship: %j', async (fields) => {
    await expect(new CyberiaSocialModel({ ...request(), ...fields }).validate()).rejects.toThrow();
  });

  it('accepts requests and friendships without request expiry', async () => {
    await expect(new CyberiaSocialModel(request()).validate()).resolves.toBeUndefined();
    await expect(
      new CyberiaSocialModel({ ...request(), status: 'accepted', expiresAt: undefined }).validate(),
    ).resolves.toBeUndefined();
  });

  it('loads both schemas on a connection with no registered models', async () => {
    const connection = new mongoose.Mongoose().createConnection();
    try {
      const models = await MongooseDB.loadModels({
        conn: connection,
        apis: ['cyberia-social', 'cyberia-social-profile'],
      });

      expect(models.CyberiaSocial.db).toBe(connection);
      expect(models.CyberiaSocial.collection.name).toBe('cyberiasocials');
      expect(models.CyberiaSocial.schema.path('low').isRequired).toBe(true);
      expect(models.CyberiaSocial.schema.path('high').isRequired).toBe(true);
      expect(models.CyberiaSocialProfile.db).toBe(connection);
      expect(models.CyberiaSocialProfile.collection.name).toBe('cyberiasocialprofiles');
    } finally {
      await connection.close();
    }
  });
});
