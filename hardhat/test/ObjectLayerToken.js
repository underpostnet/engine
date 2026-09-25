import { describe, it, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { expect } from 'chai';
import hre from 'hardhat';
import { parseEther, getAddress } from 'viem';

// The identity vectors are the cross-language contract: Node computes the canonical bytes, an
// independent implementation hashed and encoded them, and Solidity must agree here.
const vectors = JSON.parse(readFileSync(new URL('../../test/support/object-layer-identity-vectors.json', import.meta.url)));
const definition = (label) => vectors.definitions.find((v) => v.label === label);
const HATCHET_A = definition('hatchet-a');
const HATCHET_B = definition('hatchet-b');
const GOLD_ORE = definition('gold-ore');
const hash = (vector) => `0x${vector.contentHash}`;
const tokenIdOf = (vector) => BigInt(vector.tokenId);

describe('ObjectLayerToken (ERC-1155)', { concurrency: false }, function () {
  let token;
  let ownerAddress;
  let player1Address;
  let player2Address;
  let ownerClient;
  let player1Client;
  let player2Client;
  let viem;

  const BASE_URI = 'ipfs://';
  const CRYPTOKOYN_ID = 0n;
  const INITIAL_SUPPLY = parseEther('10000000'); // 10M with 18 decimals

  const asPlayer1 = async () =>
    await viem.getContractAt('ObjectLayerToken', token.address, { client: { wallet: player1Client } });
  const asPlayer2 = async () =>
    await viem.getContractAt('ObjectLayerToken', token.address, { client: { wallet: player2Client } });
  const expectRevert = async (promise, message) => {
    try {
      await promise;
      expect.fail('Expected revert');
    } catch (err) {
      expect(err.message).to.include(message);
    }
  };

  beforeEach(async function () {
    const ctx = await hre.network.getOrCreate();
    viem = ctx.viem;

    const clients = await viem.getWalletClients();
    ownerClient = clients[0];
    player1Client = clients[1];
    player2Client = clients[2];
    ownerAddress = getAddress(ownerClient.account.address);
    player1Address = getAddress(player1Client.account.address);
    player2Address = getAddress(player2Client.account.address);

    token = await viem.deployContract('ObjectLayerToken', [ownerAddress, BASE_URI]);
  });

  // ────────────────────────────────────────────────────────────────────
  // Deployment
  // ────────────────────────────────────────────────────────────────────

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      const owner = await token.read.owner();
      expect(getAddress(owner)).to.equal(ownerAddress);
    });

    it('Should mint initial CryptoKoyn supply to the owner', async function () {
      const balance = await token.read.balanceOf([ownerAddress, CRYPTOKOYN_ID]);
      expect(balance).to.equal(INITIAL_SUPPLY);
    });

    it('Should track total supply for CryptoKoyn', async function () {
      const supply = await token.read.totalSupply([CRYPTOKOYN_ID]);
      expect(supply).to.equal(INITIAL_SUPPLY);
    });

    it('Should keep CryptoKoyn outside the Object Layer registry', async function () {
      expect(await token.read.getObjectLayerCid([CRYPTOKOYN_ID])).to.equal('');
      expect(await token.read.isRegistered([CRYPTOKOYN_ID])).to.equal(false);
      await expectRevert(
        token.write.registerObjectLayer([ownerAddress, `0x${'0'.repeat(64)}`, 1n, '0x']),
        'empty content hash',
      );
    });

    it('Should return CRYPTOKOYN constant as 0', async function () {
      const val = await token.read.CRYPTOKOYN();
      expect(val).to.equal(0n);
    });

    it('Should return INITIAL_CRYPTOKOYN_SUPPLY constant', async function () {
      const val = await token.read.INITIAL_CRYPTOKOYN_SUPPLY();
      expect(val).to.equal(INITIAL_SUPPLY);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Identity vectors: Solidity agrees with the independent derivation
  // ────────────────────────────────────────────────────────────────────

  describe('Identity vectors', function () {
    for (const vector of [...vectors.definitions, ...vectors.anchors]) {
      it(`Should derive the token id and the CID of ${vector.label}`, async function () {
        expect(await token.read.computeTokenId([hash(vector)])).to.equal(BigInt(vector.tokenId));
        expect(await token.read.contentHashOf([BigInt(vector.tokenId)])).to.equal(hash(vector));
        await token.write.registerObjectLayer([ownerAddress, hash(vector), 0n, '0x']);
        expect(await token.read.getObjectLayerCid([BigInt(vector.tokenId)])).to.equal(vector.cid);
        expect(await token.read.uri([BigInt(vector.tokenId)])).to.equal(`${BASE_URI}${vector.cid}`);
      });
    }

    it('Should give different definitions of one item label different token ids', async function () {
      expect(HATCHET_A.canonical.data.item.id).to.equal(HATCHET_B.canonical.data.item.id);
      expect(tokenIdOf(HATCHET_A)).to.not.equal(tokenIdOf(HATCHET_B));
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // URI
  // ────────────────────────────────────────────────────────────────────

  describe('URI', function () {
    it('Should return the base URI by default for unregistered token IDs', async function () {
      const tokenUri = await token.read.uri([999n]);
      expect(tokenUri).to.equal(BASE_URI);
    });

    it('Should allow owner to update base URI, the one mutable presentation value', async function () {
      const newBase = 'https://meta.itemledger.com/';
      await token.write.setBaseURI([newBase]);
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      expect(await token.read.uri([tokenIdOf(HATCHET_A)])).to.equal(`${newBase}${HATCHET_A.cid}`);
    });

    it('Should revert setBaseURI from non-owner', async function () {
      await expectRevert((await asPlayer1()).write.setBaseURI(['https://evil.com/']), 'OwnableUnauthorizedAccount');
    });

    it('Should expose no way to change the content a token id resolves to', async function () {
      const functions = token.abi.filter((entry) => entry.type === 'function').map((entry) => entry.name);
      expect(functions).to.include('setBaseURI');
      expect(functions).to.not.include('setTokenMetadataCID');
      expect(functions).to.not.include('setURI');
      expect(token.abi.filter((entry) => entry.type === 'event').map((entry) => entry.name)).to.not.include('MetadataUpdated');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Object Layer Registration
  // ────────────────────────────────────────────────────────────────────

  describe('registerObjectLayer', function () {
    it('Should register an Object Layer and mint tokens', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      expect(await token.read.balanceOf([ownerAddress, tokenIdOf(HATCHET_A)])).to.equal(1n);
      expect(await token.read.totalSupply([tokenIdOf(HATCHET_A)])).to.equal(1n);
    });

    it('Should resolve the token ID back to its Object Layer CID', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      expect(await token.read.getObjectLayerCid([tokenIdOf(HATCHET_A)])).to.equal(HATCHET_A.cid);
      expect(await token.read.isRegistered([tokenIdOf(HATCHET_A)])).to.equal(true);
    });

    it('Should register two definitions of one item label as two token types', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_B), 5n, '0x']);
      expect(await token.read.getObjectLayerCid([tokenIdOf(HATCHET_A)])).to.equal(HATCHET_A.cid);
      expect(await token.read.getObjectLayerCid([tokenIdOf(HATCHET_B)])).to.equal(HATCHET_B.cid);
      expect(await token.read.totalSupply([tokenIdOf(HATCHET_A)])).to.equal(1n);
      expect(await token.read.totalSupply([tokenIdOf(HATCHET_B)])).to.equal(5n);
    });

    it('Should allow registration with zero supply (registry-only)', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 0n, '0x']);
      expect(await token.read.balanceOf([ownerAddress, tokenIdOf(HATCHET_A)])).to.equal(0n);
      expect(await token.read.isRegistered([tokenIdOf(HATCHET_A)])).to.equal(true);
    });

    it('Should register fungible (stackable) resources with supply > 1', async function () {
      const fungibleSupply = parseEther('1000000');
      await token.write.registerObjectLayer([player1Address, hash(GOLD_ORE), fungibleSupply, '0x']);
      expect(await token.read.balanceOf([player1Address, tokenIdOf(GOLD_ORE)])).to.equal(fungibleSupply);
      expect(await token.read.totalSupply([tokenIdOf(GOLD_ORE)])).to.equal(fungibleSupply);
    });

    it('Should revert when the same Object Layer is registered twice', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      await expectRevert(
        token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']),
        'object layer already registered',
      );
    });

    it('Should revert when called by non-owner', async function () {
      await expectRevert(
        (await asPlayer1()).write.registerObjectLayer([player1Address, hash(HATCHET_A), 1n, '0x']),
        'OwnableUnauthorizedAccount',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Batch Registration
  // ────────────────────────────────────────────────────────────────────

  describe('batchRegisterObjectLayers', function () {
    const batch = [HATCHET_A, HATCHET_B, GOLD_ORE];
    const supplies = [1n, 1n, parseEther('100')];

    it('Should batch-register multiple Object Layers', async function () {
      await token.write.batchRegisterObjectLayers([ownerAddress, batch.map(hash), supplies, '0x']);

      for (let i = 0; i < batch.length; i++) {
        expect(await token.read.balanceOf([ownerAddress, tokenIdOf(batch[i])])).to.equal(supplies[i]);
        expect(await token.read.getObjectLayerCid([tokenIdOf(batch[i])])).to.equal(batch[i].cid);
      }
    });

    it('Should revert on array length mismatch', async function () {
      await expectRevert(
        token.write.batchRegisterObjectLayers([ownerAddress, [hash(HATCHET_A), hash(HATCHET_B)], [1n], '0x']),
        'array length mismatch',
      );
    });

    it('Should revert on a duplicate within the batch', async function () {
      await expectRevert(
        token.write.batchRegisterObjectLayers([ownerAddress, [hash(HATCHET_A), hash(HATCHET_A)], [1n, 1n], '0x']),
        'object layer already registered',
      );
    });

    it('Should revert when called by non-owner', async function () {
      await expectRevert(
        (await asPlayer1()).write.batchRegisterObjectLayers([player1Address, batch.map(hash), supplies, '0x']),
        'OwnableUnauthorizedAccount',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Minting additional supply
  // ────────────────────────────────────────────────────────────────────

  describe('Minting', function () {
    it('Should mint additional CryptoKoyn supply', async function () {
      const additionalAmount = parseEther('5000000');
      await token.write.mint([player1Address, CRYPTOKOYN_ID, additionalAmount, '0x']);

      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(additionalAmount);
      expect(await token.read.totalSupply([CRYPTOKOYN_ID])).to.equal(INITIAL_SUPPLY + additionalAmount);
    });

    it('Should mint additional supply of a registered Object Layer', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(GOLD_ORE), 100n, '0x']);
      await token.write.mint([player1Address, tokenIdOf(GOLD_ORE), 50n, '0x']);
      expect(await token.read.balanceOf([player1Address, tokenIdOf(GOLD_ORE)])).to.equal(50n);
      expect(await token.read.totalSupply([tokenIdOf(GOLD_ORE)])).to.equal(150n);
    });

    it('Should refuse to mint an unregistered token ID', async function () {
      await expectRevert(token.write.mint([player1Address, tokenIdOf(GOLD_ORE), 1n, '0x']), 'token not registered');
      await expectRevert(
        token.write.mintBatch([player1Address, [CRYPTOKOYN_ID, tokenIdOf(GOLD_ORE)], [1n, 1n], '0x']),
        'token not registered',
      );
    });

    it('Should batch-mint multiple token IDs', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 0n, '0x']);
      await token.write.registerObjectLayer([ownerAddress, hash(GOLD_ORE), 0n, '0x']);

      await token.write.mintBatch([
        player1Address,
        [tokenIdOf(HATCHET_A), tokenIdOf(GOLD_ORE), CRYPTOKOYN_ID],
        [100n, 200n, 50n],
        '0x',
      ]);

      expect(await token.read.balanceOf([player1Address, tokenIdOf(HATCHET_A)])).to.equal(100n);
      expect(await token.read.balanceOf([player1Address, tokenIdOf(GOLD_ORE)])).to.equal(200n);
      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(50n);
    });

    it('Should revert mint from non-owner', async function () {
      await expectRevert((await asPlayer1()).write.mint([player1Address, CRYPTOKOYN_ID, 1n, '0x']), 'OwnableUnauthorizedAccount');
    });

    it('Should revert mintBatch from non-owner', async function () {
      await expectRevert(
        (await asPlayer1()).write.mintBatch([player1Address, [CRYPTOKOYN_ID], [1n], '0x']),
        'OwnableUnauthorizedAccount',
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Transfers and ownership (ERC-1155 standard)
  // ────────────────────────────────────────────────────────────────────

  describe('Transfers', function () {
    it('Should transfer CryptoKoyn between accounts', async function () {
      const amount = parseEther('1000');
      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, amount, '0x']);

      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(amount);
      expect(await token.read.balanceOf([ownerAddress, CRYPTOKOYN_ID])).to.equal(INITIAL_SUPPLY - amount);
    });

    it('Should transfer a registered Object Layer item', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      await token.write.safeTransferFrom([ownerAddress, player1Address, tokenIdOf(HATCHET_A), 1n, '0x']);

      expect(await token.read.balanceOf([player1Address, tokenIdOf(HATCHET_A)])).to.equal(1n);
      expect(await token.read.balanceOf([ownerAddress, tokenIdOf(HATCHET_A)])).to.equal(0n);
    });

    it('Should let several owners hold balances of one token type while its CID stays', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 11n, '0x']);
      const tokenId = tokenIdOf(HATCHET_A);

      await token.write.safeTransferFrom([ownerAddress, player1Address, tokenId, 3n, '0x']);
      await token.write.safeTransferFrom([ownerAddress, player2Address, tokenId, 8n, '0x']);

      const balances = await token.read.balanceOfBatch([
        [player1Address, player2Address, ownerAddress],
        [tokenId, tokenId, tokenId],
      ]);
      expect(balances).to.deep.equal([3n, 8n, 0n]);
      expect(await token.read.totalSupply([tokenId])).to.equal(11n);
      expect(await token.read.getObjectLayerCid([tokenId])).to.equal(HATCHET_A.cid);
    });

    it('Should batch-transfer multiple token types', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(GOLD_ORE), 5n, '0x']);

      await token.write.safeBatchTransferFrom([
        ownerAddress,
        player1Address,
        [CRYPTOKOYN_ID, tokenIdOf(GOLD_ORE)],
        [parseEther('500'), 2n],
        '0x',
      ]);

      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(parseEther('500'));
      expect(await token.read.balanceOf([player1Address, tokenIdOf(GOLD_ORE)])).to.equal(2n);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Burning
  // ────────────────────────────────────────────────────────────────────

  describe('Burning', function () {
    it('Should allow token holders to burn their tokens', async function () {
      const burnAmount = parseEther('100');
      await token.write.burn([ownerAddress, CRYPTOKOYN_ID, burnAmount]);

      expect(await token.read.balanceOf([ownerAddress, CRYPTOKOYN_ID])).to.equal(INITIAL_SUPPLY - burnAmount);
      expect(await token.read.totalSupply([CRYPTOKOYN_ID])).to.equal(INITIAL_SUPPLY - burnAmount);
    });

    it('Should allow batch burning', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(GOLD_ORE), 10n, '0x']);
      await token.write.burnBatch([ownerAddress, [CRYPTOKOYN_ID, tokenIdOf(GOLD_ORE)], [parseEther('50'), 3n]]);

      expect(await token.read.balanceOf([ownerAddress, CRYPTOKOYN_ID])).to.equal(INITIAL_SUPPLY - parseEther('50'));
      expect(await token.read.balanceOf([ownerAddress, tokenIdOf(GOLD_ORE)])).to.equal(7n);
    });

    it('Should revert burn when called by unauthorized account on others tokens', async function () {
      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, parseEther('100'), '0x']);
      await expectRevert(
        (await asPlayer2()).write.burn([player1Address, CRYPTOKOYN_ID, parseEther('50')]),
        'ERC1155MissingApprovalForAll',
      );
    });

    it('Should allow approved operator to burn tokens', async function () {
      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, parseEther('100'), '0x']);
      await (await asPlayer1()).write.setApprovalForAll([player2Address, true]);
      await (await asPlayer2()).write.burn([player1Address, CRYPTOKOYN_ID, parseEther('50')]);
      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(parseEther('50'));
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Pause / Unpause
  // ────────────────────────────────────────────────────────────────────

  describe('Pause / Unpause', function () {
    it('Should pause and block transfers', async function () {
      await token.write.pause();
      await expectRevert(
        token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, 1n, '0x']),
        'EnforcedPause',
      );
    });

    it('Should unpause and allow transfers again', async function () {
      await token.write.pause();
      await token.write.unpause();

      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, 1n, '0x']);
      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(1n);
    });

    it('Should block minting when paused', async function () {
      await token.write.pause();
      await expectRevert(token.write.mint([player1Address, CRYPTOKOYN_ID, 1n, '0x']), 'EnforcedPause');
    });

    it('Should block registration (which mints) when paused', async function () {
      await token.write.pause();
      await expectRevert(token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']), 'EnforcedPause');
    });

    it('Should revert pause from non-owner', async function () {
      await expectRevert((await asPlayer1()).write.pause(), 'OwnableUnauthorizedAccount');
    });

    it('Should revert unpause from non-owner', async function () {
      await token.write.pause();
      await expectRevert((await asPlayer1()).write.unpause(), 'OwnableUnauthorizedAccount');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Supply tracking (ERC1155Supply)
  // ────────────────────────────────────────────────────────────────────

  describe('Supply Tracking', function () {
    it('Should track exists() for minted token IDs', async function () {
      expect(await token.read.exists([9999n])).to.equal(false);
      expect(await token.read.exists([CRYPTOKOYN_ID])).to.equal(true);
    });

    it('Should update exists() after registration', async function () {
      expect(await token.read.exists([tokenIdOf(HATCHET_A)])).to.equal(false);
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      expect(await token.read.exists([tokenIdOf(HATCHET_A)])).to.equal(true);
    });

    it('Should update totalSupply after burns', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(GOLD_ORE), 10n, '0x']);
      expect(await token.read.totalSupply([tokenIdOf(GOLD_ORE)])).to.equal(10n);
      await token.write.burn([ownerAddress, tokenIdOf(GOLD_ORE), 3n]);
      expect(await token.read.totalSupply([tokenIdOf(GOLD_ORE)])).to.equal(7n);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Object Layer → ERC-1155 integration scenario
  // ────────────────────────────────────────────────────────────────────

  describe('Object Layer Integration Scenario', function () {
    it('Should simulate full object layer lifecycle: register → mint → transfer → burn', async function () {
      // 1. Register a unique weapon definition
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 1n, '0x']);
      const weaponTokenId = tokenIdOf(HATCHET_A);

      expect(await token.read.getObjectLayerCid([weaponTokenId])).to.equal(HATCHET_A.cid);
      expect(await token.read.totalSupply([weaponTokenId])).to.equal(1n);
      expect(await token.read.uri([weaponTokenId])).to.equal(`ipfs://${HATCHET_A.cid}`);

      // 2. Register a fungible resource
      const resourceSupply = parseEther('1000000');
      await token.write.registerObjectLayer([ownerAddress, hash(GOLD_ORE), resourceSupply, '0x']);
      const resourceTokenId = tokenIdOf(GOLD_ORE);

      // 3. Transfer weapon to player
      await token.write.safeTransferFrom([ownerAddress, player1Address, weaponTokenId, 1n, '0x']);
      expect(await token.read.balanceOf([player1Address, weaponTokenId])).to.equal(1n);

      // 4. Transfer gold to player
      const lootAmount = parseEther('500');
      await token.write.safeTransferFrom([ownerAddress, player1Address, resourceTokenId, lootAmount, '0x']);

      // 5. Player-to-player trade
      await (await asPlayer1()).write.safeBatchTransferFrom([
        player1Address,
        player2Address,
        [weaponTokenId, resourceTokenId],
        [1n, parseEther('100')],
        '0x',
      ]);

      expect(await token.read.balanceOf([player2Address, weaponTokenId])).to.equal(1n);
      expect(await token.read.balanceOf([player2Address, resourceTokenId])).to.equal(parseEther('100'));
      expect(await token.read.balanceOf([player1Address, weaponTokenId])).to.equal(0n);
      expect(await token.read.balanceOf([player1Address, resourceTokenId])).to.equal(parseEther('400'));

      // 6. Player2 burns gold ore
      const craftCost = parseEther('25');
      await (await asPlayer2()).write.burn([player2Address, resourceTokenId, craftCost]);

      expect(await token.read.balanceOf([player2Address, resourceTokenId])).to.equal(parseEther('75'));
      expect(await token.read.totalSupply([resourceTokenId])).to.equal(resourceSupply - craftCost);

      // 7. Ownership moved; the Object Layer identity did not.
      expect(await token.read.getObjectLayerCid([weaponTokenId])).to.equal(HATCHET_A.cid);

      // 8. Verify CryptoKoyn alongside items
      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, parseEther('5000'), '0x']);

      const balances = await token.read.balanceOfBatch([
        [player1Address, player1Address, player1Address, player2Address, player2Address],
        [CRYPTOKOYN_ID, weaponTokenId, resourceTokenId, weaponTokenId, resourceTokenId],
      ]);

      expect(balances[0]).to.equal(parseEther('5000'));
      expect(balances[1]).to.equal(0n);
      expect(balances[2]).to.equal(parseEther('400'));
      expect(balances[3]).to.equal(1n);
      expect(balances[4]).to.equal(parseEther('75'));
    });

    it('Should simulate governance: pause, hold the registry, unpause', async function () {
      await token.write.registerObjectLayer([ownerAddress, hash(HATCHET_A), 10n, '0x']);
      const tokenId = tokenIdOf(HATCHET_A);

      await token.write.pause();
      await expectRevert(
        token.write.safeTransferFrom([ownerAddress, player1Address, tokenId, 1n, '0x']),
        'EnforcedPause',
      );
      expect(await token.read.getObjectLayerCid([tokenId])).to.equal(HATCHET_A.cid);

      await token.write.unpause();
      await token.write.safeTransferFrom([ownerAddress, player1Address, tokenId, 1n, '0x']);
      expect(await token.read.balanceOf([player1Address, tokenId])).to.equal(1n);
    });
  });
});
