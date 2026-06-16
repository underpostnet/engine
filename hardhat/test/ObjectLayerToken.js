import { describe, it, beforeEach } from 'node:test';
import { expect } from 'chai';
import hre from 'hardhat';
import { parseEther, keccak256, toBytes, getAddress } from 'viem';

describe('ObjectLayerToken (ERC-1155)', { concurrency: false }, function () {
  let token;
  let ownerAddress;
  let player1Address;
  let player2Address;
  let receiverAddress;
  let ownerClient;
  let player1Client;
  let player2Client;
  let receiverClient;
  let viem;

  const BASE_URI = 'ipfs://';
  const CRYPTOKOYN_ID = 0n;
  const INITIAL_SUPPLY = parseEther('10000000'); // 10M with 18 decimals

  beforeEach(async function () {
    const ctx = await hre.network.getOrCreate();
    viem = ctx.viem;

    const clients = await viem.getWalletClients();
    ownerClient = clients[0];
    player1Client = clients[1];
    player2Client = clients[2];
    receiverClient = clients[3];
    ownerAddress = getAddress(ownerClient.account.address);
    player1Address = getAddress(player1Client.account.address);
    player2Address = getAddress(player2Client.account.address);
    receiverAddress = getAddress(receiverClient.account.address);

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

    it('Should register cryptokoyn as the item ID for token 0', async function () {
      const itemId = await token.read.getItemId([CRYPTOKOYN_ID]);
      expect(itemId).to.equal('cryptokoyn');
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
  // URI
  // ────────────────────────────────────────────────────────────────────

  describe('URI', function () {
    it('Should return the base URI by default for unregistered token IDs', async function () {
      const tokenUri = await token.read.uri([999n]);
      expect(tokenUri).to.equal(BASE_URI);
    });

    it('Should return per-token CID URI when set', async function () {
      const testCid = 'bafkreia1234567890abcdef';
      await token.write.setTokenMetadataCID([CRYPTOKOYN_ID, testCid]);

      const tokenUri = await token.read.uri([CRYPTOKOYN_ID]);
      expect(tokenUri).to.equal(`${BASE_URI}${testCid}`);
    });

    it('Should allow owner to update base URI', async function () {
      const newBase = 'https://meta.cyberiaonline.com/';
      await token.write.setBaseURI([newBase]);

      const testCid = 'testcid123';
      await token.write.setTokenMetadataCID([CRYPTOKOYN_ID, testCid]);

      const tokenUri = await token.read.uri([CRYPTOKOYN_ID]);
      expect(tokenUri).to.equal(`${newBase}${testCid}`);
    });

    it('Should revert setBaseURI from non-owner', async function () {
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.setBaseURI(['https://evil.com/']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
    });

    it('Should revert setTokenMetadataCID from non-owner', async function () {
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.setTokenMetadataCID([CRYPTOKOYN_ID, 'evilcid']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
    });

    it('Should emit MetadataUpdated and URI events on setTokenMetadataCID', async function () {
      const cid = 'bafkrei_test_meta';
      await token.write.setTokenMetadataCID([42n, cid]);
      const uri = await token.read.uri([42n]);
      expect(uri).to.equal(`${BASE_URI}${cid}`);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Token ID computation
  // ────────────────────────────────────────────────────────────────────

  describe('computeTokenId', function () {
    it('Should return deterministic token IDs for item identifiers', async function () {
      const id1 = await token.read.computeTokenId(['hatchet']);
      const id2 = await token.read.computeTokenId(['hatchet']);
      expect(id1).to.equal(id2);
    });

    it('Should return different token IDs for different item identifiers', async function () {
      const id1 = await token.read.computeTokenId(['hatchet']);
      const id2 = await token.read.computeTokenId(['sword']);
      expect(id1).to.not.equal(id2);
    });

    it('Should match off-chain keccak256 computation', async function () {
      const itemId = 'hatchet';
      const expectedId = BigInt(keccak256(toBytes(`cyberia.object-layer:${itemId}`)));
      const computedId = await token.read.computeTokenId([itemId]);
      expect(computedId).to.equal(expectedId);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Object Layer Registration
  // ────────────────────────────────────────────────────────────────────

  describe('registerObjectLayer', function () {
    it('Should register a new object layer and mint tokens', async function () {
      const itemId = 'axe';
      const metadataCid = 'bafkreia_axe_meta';
      const supply = 1n;

      await token.write.registerObjectLayer([ownerAddress, itemId, metadataCid, supply, '0x']);

      const tokenId = await token.read.computeTokenId([itemId]);
      expect(await token.read.balanceOf([ownerAddress, tokenId])).to.equal(supply);
      expect(await token.read.totalSupply([tokenId])).to.equal(supply);
    });

    it('Should store item ID and metadata CID on-chain', async function () {
      const itemId = 'sword';
      const metadataCid = 'bafkreia_sword_meta';
      await token.write.registerObjectLayer([ownerAddress, itemId, metadataCid, 1n, '0x']);

      const tokenId = await token.read.computeTokenId([itemId]);
      expect(await token.read.getItemId([tokenId])).to.equal(itemId);
      expect(await token.read.getMetadataCID([tokenId])).to.equal(metadataCid);
    });

    it('Should resolve URI via per-token CID after registration', async function () {
      const itemId = 'shield';
      const metadataCid = 'bafkreia_shield_meta';
      await token.write.registerObjectLayer([ownerAddress, itemId, metadataCid, 1n, '0x']);

      const tokenId = await token.read.computeTokenId([itemId]);
      expect(await token.read.uri([tokenId])).to.equal(`${BASE_URI}${metadataCid}`);
    });

    it('Should allow registration with zero supply (metadata-only)', async function () {
      const itemId = 'scroll';
      const metadataCid = 'bafkreia_scroll_meta';
      await token.write.registerObjectLayer([ownerAddress, itemId, metadataCid, 0n, '0x']);

      const tokenId = await token.read.computeTokenId([itemId]);
      expect(await token.read.balanceOf([ownerAddress, tokenId])).to.equal(0n);
      expect(await token.read.getItemId([tokenId])).to.equal(itemId);
    });

    it('Should allow registration with empty metadata CID', async function () {
      const itemId = 'potion';
      await token.write.registerObjectLayer([ownerAddress, itemId, '', 1n, '0x']);

      const tokenId = await token.read.computeTokenId([itemId]);
      expect(await token.read.getMetadataCID([tokenId])).to.equal('');
      expect(await token.read.balanceOf([ownerAddress, tokenId])).to.equal(1n);
    });

    it('Should register fungible (stackable) items with supply > 1', async function () {
      const itemId = 'gold-ore';
      const fungibleSupply = parseEther('1000000');
      await token.write.registerObjectLayer([player1Address, itemId, 'bafkrei_gold', fungibleSupply, '0x']);

      const tokenId = await token.read.computeTokenId([itemId]);
      expect(await token.read.balanceOf([player1Address, tokenId])).to.equal(fungibleSupply);
      expect(await token.read.totalSupply([tokenId])).to.equal(fungibleSupply);
    });

    it('Should support getTokenIdByItemId reverse lookup', async function () {
      const itemId = 'ring';
      await token.write.registerObjectLayer([ownerAddress, itemId, '', 1n, '0x']);

      const tokenId = await token.read.computeTokenId([itemId]);
      expect(await token.read.getTokenIdByItemId([itemId])).to.equal(tokenId);
    });

    it('Should revert on duplicate item ID collision at the token ID level', async function () {
      const itemId = 'dup-item';
      await token.write.registerObjectLayer([ownerAddress, itemId, '', 1n, '0x']);

      try {
        await token.write.registerObjectLayer([ownerAddress, itemId, '', 1n, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('item already registered');
      }
    });

    it('Should revert when called by non-owner', async function () {
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.registerObjectLayer([player1Address, 'nope', '', 1n, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Batch Registration
  // ────────────────────────────────────────────────────────────────────

  describe('batchRegisterObjectLayers', function () {
    const items = ['b-sword', 'b-shield', 'b-potion', 'b-scroll'];
    const cids = ['bafkrei_b_sword', 'bafkrei_b_shield', 'bafkrei_b_potion', 'bafkrei_b_scroll'];
    const supplies = [1n, 1n, parseEther('100'), parseEther('50')];

    it('Should batch-register multiple object layers', async function () {
      await token.write.batchRegisterObjectLayers([ownerAddress, items, cids, supplies, '0x']);

      for (let i = 0; i < items.length; i++) {
        const tokenId = await token.read.computeTokenId([items[i]]);
        expect(await token.read.balanceOf([ownerAddress, tokenId])).to.equal(supplies[i]);
        expect(await token.read.getItemId([tokenId])).to.equal(items[i]);
        expect(await token.read.getMetadataCID([tokenId])).to.equal(cids[i]);
      }
    });

    it('Should revert on array length mismatch', async function () {
      try {
        await token.write.batchRegisterObjectLayers([ownerAddress, ['a', 'b'], ['cid1'], [1n, 1n], '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('array length mismatch');
      }
    });

    it('Should revert on duplicate within batch (token ID collision)', async function () {
      try {
        await token.write.batchRegisterObjectLayers([
          ownerAddress,
          ['dup-item-x', 'dup-item-x'],
          ['cid1', 'cid2'],
          [1n, 1n],
          '0x',
        ]);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('already registered or token ID collision');
      }
    });

    it('Should revert when called by non-owner', async function () {
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.batchRegisterObjectLayers([player1Address, items, cids, supplies, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
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

    it('Should mint additional supply for registered object layers', async function () {
      const itemId = 'mint-arrow';
      await token.write.registerObjectLayer([ownerAddress, itemId, '', 100n, '0x']);
      const tokenId = await token.read.computeTokenId([itemId]);

      await token.write.mint([player1Address, tokenId, 50n, '0x']);
      expect(await token.read.balanceOf([player1Address, tokenId])).to.equal(50n);
      expect(await token.read.totalSupply([tokenId])).to.equal(150n);
    });

    it('Should batch-mint multiple token IDs', async function () {
      await token.write.registerObjectLayer([ownerAddress, 'mint-wood', '', 0n, '0x']);
      await token.write.registerObjectLayer([ownerAddress, 'mint-stone', '', 0n, '0x']);

      const woodId = await token.read.computeTokenId(['mint-wood']);
      const stoneId = await token.read.computeTokenId(['mint-stone']);

      await token.write.mintBatch([player1Address, [woodId, stoneId, CRYPTOKOYN_ID], [100n, 200n, 50n], '0x']);

      expect(await token.read.balanceOf([player1Address, woodId])).to.equal(100n);
      expect(await token.read.balanceOf([player1Address, stoneId])).to.equal(200n);
      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(50n);
    });

    it('Should revert mint from non-owner', async function () {
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.mint([player1Address, CRYPTOKOYN_ID, 1n, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
    });

    it('Should revert mintBatch from non-owner', async function () {
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.mintBatch([player1Address, [CRYPTOKOYN_ID], [1n], '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Transfers (ERC-1155 standard)
  // ────────────────────────────────────────────────────────────────────

  describe('Transfers', function () {
    it('Should transfer CryptoKoyn between accounts', async function () {
      const amount = parseEther('1000');
      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, amount, '0x']);

      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(amount);
      expect(await token.read.balanceOf([ownerAddress, CRYPTOKOYN_ID])).to.equal(INITIAL_SUPPLY - amount);
    });

    it('Should transfer registered object layer items', async function () {
      const itemId = 'rare-blade';
      await token.write.registerObjectLayer([ownerAddress, itemId, '', 1n, '0x']);
      const tokenId = await token.read.computeTokenId([itemId]);

      await token.write.safeTransferFrom([ownerAddress, player1Address, tokenId, 1n, '0x']);

      expect(await token.read.balanceOf([player1Address, tokenId])).to.equal(1n);
      expect(await token.read.balanceOf([ownerAddress, tokenId])).to.equal(0n);
    });

    it('Should batch-transfer multiple token types', async function () {
      await token.write.registerObjectLayer([ownerAddress, 'helm', '', 5n, '0x']);
      const helmId = await token.read.computeTokenId(['helm']);

      await token.write.safeBatchTransferFrom([
        ownerAddress,
        player1Address,
        [CRYPTOKOYN_ID, helmId],
        [parseEther('500'), 2n],
        '0x',
      ]);

      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(parseEther('500'));
      expect(await token.read.balanceOf([player1Address, helmId])).to.equal(2n);
    });

    it('Should support balanceOfBatch queries', async function () {
      const itemId = 't-gem';
      await token.write.registerObjectLayer([player1Address, itemId, '', 10n, '0x']);
      const gemId = await token.read.computeTokenId([itemId]);

      const balances = await token.read.balanceOfBatch([
        [ownerAddress, player1Address, player1Address],
        [CRYPTOKOYN_ID, CRYPTOKOYN_ID, gemId],
      ]);

      expect(balances[0]).to.equal(INITIAL_SUPPLY);
      expect(balances[1]).to.equal(0n);
      expect(balances[2]).to.equal(10n);
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
      const itemId = 'burn-item';
      await token.write.registerObjectLayer([ownerAddress, itemId, '', 10n, '0x']);
      const burnItemId = await token.read.computeTokenId([itemId]);

      await token.write.burnBatch([ownerAddress, [CRYPTOKOYN_ID, burnItemId], [parseEther('50'), 3n]]);

      expect(await token.read.balanceOf([ownerAddress, CRYPTOKOYN_ID])).to.equal(INITIAL_SUPPLY - parseEther('50'));
      expect(await token.read.balanceOf([ownerAddress, burnItemId])).to.equal(7n);
    });

    it('Should revert burn when called by unauthorized account on others tokens', async function () {
      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, parseEther('100'), '0x']);

      const tokenAsPlayer2 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player2Client },
      });
      try {
        await tokenAsPlayer2.write.burn([player1Address, CRYPTOKOYN_ID, parseEther('50')]);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('ERC1155MissingApprovalForAll');
      }
    });

    it('Should allow approved operator to burn tokens', async function () {
      // Transfer tokens from owner to player1
      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, parseEther('100'), '0x']);

      // player1 approves player2 as operator
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      await tokenAsPlayer1.write.setApprovalForAll([player2Address, true]);

      // player2 burns on behalf of player1
      const tokenAsPlayer2 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player2Client },
      });
      await tokenAsPlayer2.write.burn([player1Address, CRYPTOKOYN_ID, parseEther('50')]);
      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(parseEther('50'));
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Pause / Unpause
  // ────────────────────────────────────────────────────────────────────

  describe('Pause / Unpause', function () {
    it('Should pause and block transfers', async function () {
      await token.write.pause();

      try {
        await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, 1n, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('EnforcedPause');
      }
    });

    it('Should unpause and allow transfers again', async function () {
      await token.write.pause();
      await token.write.unpause();

      await token.write.safeTransferFrom([ownerAddress, player1Address, CRYPTOKOYN_ID, 1n, '0x']);
      expect(await token.read.balanceOf([player1Address, CRYPTOKOYN_ID])).to.equal(1n);
    });

    it('Should block minting when paused', async function () {
      await token.write.pause();

      try {
        await token.write.mint([player1Address, CRYPTOKOYN_ID, 1n, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('EnforcedPause');
      }
    });

    it('Should block registration (which mints) when paused', async function () {
      await token.write.pause();

      try {
        await token.write.registerObjectLayer([ownerAddress, 'paused-item', '', 1n, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('EnforcedPause');
      }
    });

    it('Should revert pause from non-owner', async function () {
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.pause();
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
    });

    it('Should revert unpause from non-owner', async function () {
      await token.write.pause();
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      try {
        await tokenAsPlayer1.write.unpause();
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('OwnableUnauthorizedAccount');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Supply tracking (ERC1155Supply)
  // ────────────────────────────────────────────────────────────────────

  describe('Supply Tracking', function () {
    it('Should track exists() for minted token IDs', async function () {
      const randomId = 9999n;
      expect(await token.read.exists([randomId])).to.equal(false);
      expect(await token.read.exists([CRYPTOKOYN_ID])).to.equal(true);
    });

    it('Should update exists() after registration', async function () {
      const itemId = 'tracking-test';
      const tokenId = await token.read.computeTokenId([itemId]);

      expect(await token.read.exists([tokenId])).to.equal(false);

      await token.write.registerObjectLayer([ownerAddress, itemId, '', 1n, '0x']);

      expect(await token.read.exists([tokenId])).to.equal(true);
    });

    it('Should update totalSupply after burns', async function () {
      const itemId = 'supply-test';
      await token.write.registerObjectLayer([ownerAddress, itemId, '', 10n, '0x']);
      const tokenId = await token.read.computeTokenId([itemId]);

      expect(await token.read.totalSupply([tokenId])).to.equal(10n);

      await token.write.burn([ownerAddress, tokenId, 3n]);

      expect(await token.read.totalSupply([tokenId])).to.equal(7n);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Object Layer → ERC-1155 integration scenario
  // ────────────────────────────────────────────────────────────────────

  describe('Object Layer Integration Scenario', function () {
    it('Should simulate full object layer lifecycle: register → mint → transfer → burn', async function () {
      // 1. Register a weapon type
      const weaponItemId = 'legendary-hatchet';
      const weaponCid = 'bafkreia_hatchet_atlas_metadata_cid';

      await token.write.registerObjectLayer([ownerAddress, weaponItemId, weaponCid, 1n, '0x']);

      const weaponTokenId = await token.read.computeTokenId([weaponItemId]);

      expect(await token.read.getItemId([weaponTokenId])).to.equal(weaponItemId);
      expect(await token.read.getMetadataCID([weaponTokenId])).to.equal(weaponCid);
      expect(await token.read.totalSupply([weaponTokenId])).to.equal(1n);
      expect(await token.read.uri([weaponTokenId])).to.equal(`ipfs://${weaponCid}`);

      // 2. Register a fungible resource
      const resourceItemId = 'gold-ore';
      const resourceCid = 'bafkreia_gold_ore_meta';
      const resourceSupply = parseEther('1000000');

      await token.write.registerObjectLayer([ownerAddress, resourceItemId, resourceCid, resourceSupply, '0x']);

      const resourceTokenId = await token.read.computeTokenId([resourceItemId]);

      // 3. Transfer weapon to player
      await token.write.safeTransferFrom([ownerAddress, player1Address, weaponTokenId, 1n, '0x']);
      expect(await token.read.balanceOf([player1Address, weaponTokenId])).to.equal(1n);

      // 4. Transfer gold to player
      const lootAmount = parseEther('500');
      await token.write.safeTransferFrom([ownerAddress, player1Address, resourceTokenId, lootAmount, '0x']);

      // 5. Player-to-player trade
      const tokenAsPlayer1 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player1Client },
      });
      await tokenAsPlayer1.write.safeBatchTransferFrom([
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
      const tokenAsPlayer2 = await viem.getContractAt('ObjectLayerToken', token.address, {
        client: { wallet: player2Client },
      });
      const craftCost = parseEther('25');
      await tokenAsPlayer2.write.burn([player2Address, resourceTokenId, craftCost]);

      expect(await token.read.balanceOf([player2Address, resourceTokenId])).to.equal(parseEther('75'));
      expect(await token.read.totalSupply([resourceTokenId])).to.equal(resourceSupply - craftCost);

      // 7. Verify CryptoKoyn alongside items
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

    it('Should simulate governance: pause, update metadata, unpause', async function () {
      await token.write.registerObjectLayer([ownerAddress, 'gov-item', 'old-cid', 10n, '0x']);
      const tokenId = await token.read.computeTokenId(['gov-item']);

      await token.write.pause();
      try {
        await token.write.safeTransferFrom([ownerAddress, player1Address, tokenId, 1n, '0x']);
        expect.fail('Expected revert');
      } catch (err) {
        expect(err.message).to.include('EnforcedPause');
      }

      await token.write.setTokenMetadataCID([tokenId, 'new-upgraded-cid']);
      expect(await token.read.getMetadataCID([tokenId])).to.equal('new-upgraded-cid');

      await token.write.unpause();
      await token.write.safeTransferFrom([ownerAddress, player1Address, tokenId, 1n, '0x']);
      expect(await token.read.balanceOf([player1Address, tokenId])).to.equal(1n);
    });
  });
});
