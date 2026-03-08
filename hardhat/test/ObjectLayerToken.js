import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('ObjectLayerToken (ERC-1155)', function () {
  let token;
  let owner;
  let player1;
  let player2;
  let receiver;

  const BASE_URI = 'ipfs://';
  const CRYPTOKOYN_ID = 0n;
  const INITIAL_SUPPLY = ethers.parseEther('10000000'); // 10M with 18 decimals

  beforeEach(async function () {
    [owner, player1, player2, receiver] = await ethers.getSigners();

    const ObjectLayerToken = await ethers.getContractFactory('ObjectLayerToken');
    token = await ObjectLayerToken.deploy(owner.address, BASE_URI);
    await token.waitForDeployment();
  });

  // ────────────────────────────────────────────────────────────────────
  // Deployment
  // ────────────────────────────────────────────────────────────────────

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it('Should mint initial CryptoKoyn supply to the owner', async function () {
      const balance = await token.balanceOf(owner.address, CRYPTOKOYN_ID);
      expect(balance).to.equal(INITIAL_SUPPLY);
    });

    it('Should track total supply for CryptoKoyn', async function () {
      const supply = await token.totalSupply(CRYPTOKOYN_ID);
      expect(supply).to.equal(INITIAL_SUPPLY);
    });

    it('Should register cryptokoyn as the item ID for token 0', async function () {
      const itemId = await token.getItemId(CRYPTOKOYN_ID);
      expect(itemId).to.equal('cryptokoyn');
    });

    it('Should return CRYPTOKOYN constant as 0', async function () {
      expect(await token.CRYPTOKOYN()).to.equal(0n);
    });

    it('Should return INITIAL_CRYPTOKOYN_SUPPLY constant', async function () {
      expect(await token.INITIAL_CRYPTOKOYN_SUPPLY()).to.equal(INITIAL_SUPPLY);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // URI
  // ────────────────────────────────────────────────────────────────────

  describe('URI', function () {
    it('Should return the base URI by default for unregistered token IDs', async function () {
      const tokenUri = await token.uri(999);
      // Default ERC1155 behavior returns the base URI template
      expect(tokenUri).to.equal(BASE_URI);
    });

    it('Should return per-token CID URI when set', async function () {
      const testCid = 'bafkreia1234567890abcdef';
      await token.setTokenMetadataCID(CRYPTOKOYN_ID, testCid);

      const tokenUri = await token.uri(CRYPTOKOYN_ID);
      expect(tokenUri).to.equal(`${BASE_URI}${testCid}`);
    });

    it('Should allow owner to update base URI', async function () {
      const newBase = 'https://meta.cyberiaonline.com/';
      await token.setBaseURI(newBase);

      const testCid = 'testcid123';
      await token.setTokenMetadataCID(CRYPTOKOYN_ID, testCid);

      const tokenUri = await token.uri(CRYPTOKOYN_ID);
      expect(tokenUri).to.equal(`${newBase}${testCid}`);
    });

    it('Should revert setBaseURI from non-owner', async function () {
      await expect(token.connect(player1).setBaseURI('https://evil.com/')).to.be.revertedWithCustomError(
        token,
        'OwnableUnauthorizedAccount',
      );
    });

    it('Should revert setTokenMetadataCID from non-owner', async function () {
      await expect(token.connect(player1).setTokenMetadataCID(CRYPTOKOYN_ID, 'evilcid')).to.be.revertedWithCustomError(
        token,
        'OwnableUnauthorizedAccount',
      );
    });

    it('Should emit MetadataUpdated and URI events on setTokenMetadataCID', async function () {
      const cid = 'bafkrei_test_meta';
      await expect(token.setTokenMetadataCID(42, cid)).to.emit(token, 'MetadataUpdated').withArgs(42, cid);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Token ID computation
  // ────────────────────────────────────────────────────────────────────

  describe('computeTokenId', function () {
    it('Should return deterministic token IDs for item identifiers', async function () {
      const id1 = await token.computeTokenId('hatchet');
      const id2 = await token.computeTokenId('hatchet');
      expect(id1).to.equal(id2);
    });

    it('Should return different token IDs for different item identifiers', async function () {
      const id1 = await token.computeTokenId('hatchet');
      const id2 = await token.computeTokenId('sword');
      expect(id1).to.not.equal(id2);
    });

    it('Should match off-chain keccak256 computation', async function () {
      const itemId = 'hatchet';
      const expectedId = BigInt(ethers.keccak256(ethers.toUtf8Bytes(`cyberia.object-layer:${itemId}`)));
      const computedId = await token.computeTokenId(itemId);
      expect(computedId).to.equal(expectedId);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Object Layer Registration
  // ────────────────────────────────────────────────────────────────────

  describe('registerObjectLayer', function () {
    const testItemId = 'hatchet';
    const testMetadataCid = 'bafkreia_hatchet_meta_json';
    const testSupply = 1n; // Unique / non-fungible

    it('Should register a new object layer and mint tokens', async function () {
      const tx = await token.registerObjectLayer(owner.address, testItemId, testMetadataCid, testSupply, '0x');

      const tokenId = await token.computeTokenId(testItemId);

      await expect(tx)
        .to.emit(token, 'ObjectLayerRegistered')
        .withArgs(tokenId, testItemId, testMetadataCid, testSupply);

      expect(await token.balanceOf(owner.address, tokenId)).to.equal(testSupply);
      expect(await token.totalSupply(tokenId)).to.equal(testSupply);
    });

    it('Should store item ID and metadata CID on-chain', async function () {
      await token.registerObjectLayer(owner.address, testItemId, testMetadataCid, testSupply, '0x');

      const tokenId = await token.computeTokenId(testItemId);
      expect(await token.getItemId(tokenId)).to.equal(testItemId);
      expect(await token.getMetadataCID(tokenId)).to.equal(testMetadataCid);
    });

    it('Should resolve URI via per-token CID after registration', async function () {
      await token.registerObjectLayer(owner.address, testItemId, testMetadataCid, testSupply, '0x');

      const tokenId = await token.computeTokenId(testItemId);
      expect(await token.uri(tokenId)).to.equal(`${BASE_URI}${testMetadataCid}`);
    });

    it('Should allow registration with zero supply (metadata-only)', async function () {
      await token.registerObjectLayer(owner.address, testItemId, testMetadataCid, 0n, '0x');

      const tokenId = await token.computeTokenId(testItemId);
      expect(await token.balanceOf(owner.address, tokenId)).to.equal(0n);
      expect(await token.getItemId(tokenId)).to.equal(testItemId);
    });

    it('Should allow registration with empty metadata CID', async function () {
      await token.registerObjectLayer(owner.address, testItemId, '', testSupply, '0x');

      const tokenId = await token.computeTokenId(testItemId);
      expect(await token.getMetadataCID(tokenId)).to.equal('');
      expect(await token.balanceOf(owner.address, tokenId)).to.equal(testSupply);
    });

    it('Should register fungible (stackable) items with supply > 1', async function () {
      const fungibleSupply = ethers.parseEther('1000000'); // 1M gold ore
      await token.registerObjectLayer(player1.address, 'gold-ore', 'bafkrei_gold', fungibleSupply, '0x');

      const tokenId = await token.computeTokenId('gold-ore');
      expect(await token.balanceOf(player1.address, tokenId)).to.equal(fungibleSupply);
      expect(await token.totalSupply(tokenId)).to.equal(fungibleSupply);
    });

    it('Should support getTokenIdByItemId reverse lookup', async function () {
      await token.registerObjectLayer(owner.address, testItemId, testMetadataCid, testSupply, '0x');

      const tokenId = await token.computeTokenId(testItemId);
      expect(await token.getTokenIdByItemId(testItemId)).to.equal(tokenId);
    });

    it('Should revert on duplicate item ID collision at the token ID level', async function () {
      await token.registerObjectLayer(owner.address, testItemId, testMetadataCid, testSupply, '0x');

      await expect(
        token.registerObjectLayer(owner.address, testItemId, testMetadataCid, testSupply, '0x'),
      ).to.be.revertedWith('ObjectLayerToken: item already registered or token ID collision');
    });

    it('Should revert when called by non-owner', async function () {
      await expect(
        token.connect(player1).registerObjectLayer(player1.address, testItemId, testMetadataCid, testSupply, '0x'),
      ).to.be.revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Batch Registration
  // ────────────────────────────────────────────────────────────────────

  describe('batchRegisterObjectLayers', function () {
    const items = ['sword', 'shield', 'potion', 'scroll'];
    const cids = ['bafkrei_sword', 'bafkrei_shield', 'bafkrei_potion', 'bafkrei_scroll'];
    const supplies = [1n, 1n, ethers.parseEther('100'), ethers.parseEther('50')];

    it('Should batch-register multiple object layers', async function () {
      const tx = await token.batchRegisterObjectLayers(owner.address, items, cids, supplies, '0x');

      for (let i = 0; i < items.length; i++) {
        const tokenId = await token.computeTokenId(items[i]);
        expect(await token.balanceOf(owner.address, tokenId)).to.equal(supplies[i]);
        expect(await token.getItemId(tokenId)).to.equal(items[i]);
        expect(await token.getMetadataCID(tokenId)).to.equal(cids[i]);

        await expect(tx).to.emit(token, 'ObjectLayerRegistered').withArgs(tokenId, items[i], cids[i], supplies[i]);
      }
    });

    it('Should revert on array length mismatch', async function () {
      await expect(
        token.batchRegisterObjectLayers(owner.address, ['a', 'b'], ['cid1'], [1n, 1n], '0x'),
      ).to.be.revertedWith('ObjectLayerToken: array length mismatch');
    });

    it('Should revert on duplicate within batch (token ID collision)', async function () {
      await expect(
        token.batchRegisterObjectLayers(owner.address, ['dup-item', 'dup-item'], ['cid1', 'cid2'], [1n, 1n], '0x'),
      ).to.be.revertedWith('ObjectLayerToken: item already registered or token ID collision');
    });

    it('Should revert when called by non-owner', async function () {
      await expect(
        token.connect(player1).batchRegisterObjectLayers(player1.address, items, cids, supplies, '0x'),
      ).to.be.revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Minting additional supply
  // ────────────────────────────────────────────────────────────────────

  describe('Minting', function () {
    it('Should mint additional CryptoKoyn supply', async function () {
      const additionalAmount = ethers.parseEther('5000000');
      await token.mint(player1.address, CRYPTOKOYN_ID, additionalAmount, '0x');

      expect(await token.balanceOf(player1.address, CRYPTOKOYN_ID)).to.equal(additionalAmount);
      expect(await token.totalSupply(CRYPTOKOYN_ID)).to.equal(INITIAL_SUPPLY + additionalAmount);
    });

    it('Should mint additional supply for registered object layers', async function () {
      await token.registerObjectLayer(owner.address, 'arrow', 'bafkrei_arrow', 100n, '0x');
      const tokenId = await token.computeTokenId('arrow');

      await token.mint(player1.address, tokenId, 50n, '0x');
      expect(await token.balanceOf(player1.address, tokenId)).to.equal(50n);
      expect(await token.totalSupply(tokenId)).to.equal(150n);
    });

    it('Should batch-mint multiple token IDs', async function () {
      await token.registerObjectLayer(owner.address, 'wood', '', 0n, '0x');
      await token.registerObjectLayer(owner.address, 'stone', '', 0n, '0x');

      const woodId = await token.computeTokenId('wood');
      const stoneId = await token.computeTokenId('stone');

      await token.mintBatch(player1.address, [woodId, stoneId, CRYPTOKOYN_ID], [100n, 200n, 50n], '0x');

      expect(await token.balanceOf(player1.address, woodId)).to.equal(100n);
      expect(await token.balanceOf(player1.address, stoneId)).to.equal(200n);
      expect(await token.balanceOf(player1.address, CRYPTOKOYN_ID)).to.equal(50n);
    });

    it('Should revert mint from non-owner', async function () {
      await expect(token.connect(player1).mint(player1.address, CRYPTOKOYN_ID, 1n, '0x')).to.be.revertedWithCustomError(
        token,
        'OwnableUnauthorizedAccount',
      );
    });

    it('Should revert mintBatch from non-owner', async function () {
      await expect(
        token.connect(player1).mintBatch(player1.address, [CRYPTOKOYN_ID], [1n], '0x'),
      ).to.be.revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Transfers (ERC-1155 standard)
  // ────────────────────────────────────────────────────────────────────

  describe('Transfers', function () {
    it('Should transfer CryptoKoyn between accounts', async function () {
      const amount = ethers.parseEther('1000');
      await token.safeTransferFrom(owner.address, player1.address, CRYPTOKOYN_ID, amount, '0x');

      expect(await token.balanceOf(player1.address, CRYPTOKOYN_ID)).to.equal(amount);
      expect(await token.balanceOf(owner.address, CRYPTOKOYN_ID)).to.equal(INITIAL_SUPPLY - amount);
    });

    it('Should transfer registered object layer items', async function () {
      await token.registerObjectLayer(owner.address, 'rare-blade', 'bafkrei_blade', 1n, '0x');
      const tokenId = await token.computeTokenId('rare-blade');

      await token.safeTransferFrom(owner.address, player1.address, tokenId, 1n, '0x');

      expect(await token.balanceOf(player1.address, tokenId)).to.equal(1n);
      expect(await token.balanceOf(owner.address, tokenId)).to.equal(0n);
    });

    it('Should batch-transfer multiple token types', async function () {
      await token.registerObjectLayer(owner.address, 'helm', '', 5n, '0x');
      const helmId = await token.computeTokenId('helm');

      await token.safeBatchTransferFrom(
        owner.address,
        player1.address,
        [CRYPTOKOYN_ID, helmId],
        [ethers.parseEther('500'), 2n],
        '0x',
      );

      expect(await token.balanceOf(player1.address, CRYPTOKOYN_ID)).to.equal(ethers.parseEther('500'));
      expect(await token.balanceOf(player1.address, helmId)).to.equal(2n);
    });

    it('Should support balanceOfBatch queries', async function () {
      await token.registerObjectLayer(player1.address, 'gem', '', 10n, '0x');
      const gemId = await token.computeTokenId('gem');

      const balances = await token.balanceOfBatch(
        [owner.address, player1.address, player1.address],
        [CRYPTOKOYN_ID, CRYPTOKOYN_ID, gemId],
      );

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
      const burnAmount = ethers.parseEther('100');
      await token.burn(owner.address, CRYPTOKOYN_ID, burnAmount);

      expect(await token.balanceOf(owner.address, CRYPTOKOYN_ID)).to.equal(INITIAL_SUPPLY - burnAmount);
      expect(await token.totalSupply(CRYPTOKOYN_ID)).to.equal(INITIAL_SUPPLY - burnAmount);
    });

    it('Should allow batch burning', async function () {
      await token.registerObjectLayer(owner.address, 'burn-item', '', 10n, '0x');
      const burnItemId = await token.computeTokenId('burn-item');

      await token.burnBatch(owner.address, [CRYPTOKOYN_ID, burnItemId], [ethers.parseEther('50'), 3n]);

      expect(await token.balanceOf(owner.address, CRYPTOKOYN_ID)).to.equal(INITIAL_SUPPLY - ethers.parseEther('50'));
      expect(await token.balanceOf(owner.address, burnItemId)).to.equal(7n);
    });

    it('Should revert burn when called by unauthorized account on others tokens', async function () {
      await token.safeTransferFrom(owner.address, player1.address, CRYPTOKOYN_ID, ethers.parseEther('100'), '0x');

      // player2 tries to burn player1's tokens without approval
      await expect(
        token.connect(player2).burn(player1.address, CRYPTOKOYN_ID, ethers.parseEther('50')),
      ).to.be.revertedWithCustomError(token, 'ERC1155MissingApprovalForAll');
    });

    it('Should allow approved operator to burn tokens', async function () {
      await token.safeTransferFrom(owner.address, player1.address, CRYPTOKOYN_ID, ethers.parseEther('100'), '0x');

      // player1 approves player2
      await token.connect(player1).setApprovalForAll(player2.address, true);

      // player2 burns on behalf of player1
      await token.connect(player2).burn(player1.address, CRYPTOKOYN_ID, ethers.parseEther('50'));

      expect(await token.balanceOf(player1.address, CRYPTOKOYN_ID)).to.equal(ethers.parseEther('50'));
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Pause / Unpause
  // ────────────────────────────────────────────────────────────────────

  describe('Pause / Unpause', function () {
    it('Should pause and block transfers', async function () {
      await token.pause();

      await expect(
        token.safeTransferFrom(owner.address, player1.address, CRYPTOKOYN_ID, 1n, '0x'),
      ).to.be.revertedWithCustomError(token, 'EnforcedPause');
    });

    it('Should unpause and allow transfers again', async function () {
      await token.pause();
      await token.unpause();

      await expect(token.safeTransferFrom(owner.address, player1.address, CRYPTOKOYN_ID, 1n, '0x')).to.not.be.reverted;
    });

    it('Should block minting when paused', async function () {
      await token.pause();

      await expect(token.mint(player1.address, CRYPTOKOYN_ID, 1n, '0x')).to.be.revertedWithCustomError(
        token,
        'EnforcedPause',
      );
    });

    it('Should block registration (which mints) when paused', async function () {
      await token.pause();

      await expect(token.registerObjectLayer(owner.address, 'paused-item', '', 1n, '0x')).to.be.revertedWithCustomError(
        token,
        'EnforcedPause',
      );
    });

    it('Should revert pause from non-owner', async function () {
      await expect(token.connect(player1).pause()).to.be.revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
    });

    it('Should revert unpause from non-owner', async function () {
      await token.pause();
      await expect(token.connect(player1).unpause()).to.be.revertedWithCustomError(token, 'OwnableUnauthorizedAccount');
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Supply tracking (ERC1155Supply)
  // ────────────────────────────────────────────────────────────────────

  describe('Supply Tracking', function () {
    it('Should track exists() for minted token IDs', async function () {
      const randomId = 9999n;
      expect(await token.exists(randomId)).to.equal(false);
      expect(await token.exists(CRYPTOKOYN_ID)).to.equal(true);
    });

    it('Should update exists() after registration', async function () {
      const itemId = 'tracking-test';
      const tokenId = await token.computeTokenId(itemId);

      expect(await token.exists(tokenId)).to.equal(false);

      await token.registerObjectLayer(owner.address, itemId, '', 1n, '0x');

      expect(await token.exists(tokenId)).to.equal(true);
    });

    it('Should update totalSupply after burns', async function () {
      await token.registerObjectLayer(owner.address, 'supply-test', '', 10n, '0x');
      const tokenId = await token.computeTokenId('supply-test');

      expect(await token.totalSupply(tokenId)).to.equal(10n);

      await token.burn(owner.address, tokenId, 3n);

      expect(await token.totalSupply(tokenId)).to.equal(7n);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Object Layer → ERC-1155 integration scenario
  // ────────────────────────────────────────────────────────────────────

  describe('Object Layer Integration Scenario', function () {
    it('Should simulate full object layer lifecycle: register → mint → transfer → burn', async function () {
      // 1. Game server registers a weapon type
      const weaponItemId = 'legendary-hatchet';
      const weaponCid = 'bafkreia_hatchet_atlas_metadata_cid';

      await token.registerObjectLayer(
        owner.address, // governance / server wallet
        weaponItemId,
        weaponCid,
        1n, // unique: supply of 1
        '0x',
      );

      const weaponTokenId = await token.computeTokenId(weaponItemId);

      // Verify on-chain state matches off-chain ObjectLayer data
      expect(await token.getItemId(weaponTokenId)).to.equal(weaponItemId);
      expect(await token.getMetadataCID(weaponTokenId)).to.equal(weaponCid);
      expect(await token.totalSupply(weaponTokenId)).to.equal(1n);
      expect(await token.uri(weaponTokenId)).to.equal(`ipfs://${weaponCid}`);

      // 2. Game server registers a fungible resource
      const resourceItemId = 'gold-ore';
      const resourceCid = 'bafkreia_gold_ore_meta';
      const resourceSupply = ethers.parseEther('1000000');

      await token.registerObjectLayer(owner.address, resourceItemId, resourceCid, resourceSupply, '0x');

      const resourceTokenId = await token.computeTokenId(resourceItemId);

      // 3. Transfer weapon to player (quest reward)
      await token.safeTransferFrom(owner.address, player1.address, weaponTokenId, 1n, '0x');
      expect(await token.balanceOf(player1.address, weaponTokenId)).to.equal(1n);

      // 4. Transfer gold to player (enemy loot)
      const lootAmount = ethers.parseEther('500');
      await token.safeTransferFrom(owner.address, player1.address, resourceTokenId, lootAmount, '0x');

      // 5. Player-to-player trade: player1 sends weapon + 100 gold to player2
      await token
        .connect(player1)
        .safeBatchTransferFrom(
          player1.address,
          player2.address,
          [weaponTokenId, resourceTokenId],
          [1n, ethers.parseEther('100')],
          '0x',
        );

      expect(await token.balanceOf(player2.address, weaponTokenId)).to.equal(1n);
      expect(await token.balanceOf(player2.address, resourceTokenId)).to.equal(ethers.parseEther('100'));
      expect(await token.balanceOf(player1.address, weaponTokenId)).to.equal(0n);
      expect(await token.balanceOf(player1.address, resourceTokenId)).to.equal(ethers.parseEther('400'));

      // 6. Player2 consumes (burns) gold ore in crafting
      const craftCost = ethers.parseEther('25');
      await token.connect(player2).burn(player2.address, resourceTokenId, craftCost);

      expect(await token.balanceOf(player2.address, resourceTokenId)).to.equal(ethers.parseEther('75'));
      expect(await token.totalSupply(resourceTokenId)).to.equal(resourceSupply - craftCost);

      // 7. Verify CryptoKoyn (fungible currency) still works alongside items
      await token.safeTransferFrom(owner.address, player1.address, CRYPTOKOYN_ID, ethers.parseEther('5000'), '0x');

      const balances = await token.balanceOfBatch(
        [player1.address, player1.address, player1.address, player2.address, player2.address],
        [CRYPTOKOYN_ID, weaponTokenId, resourceTokenId, weaponTokenId, resourceTokenId],
      );

      expect(balances[0]).to.equal(ethers.parseEther('5000')); // player1 CKY
      expect(balances[1]).to.equal(0n); // player1 weapon (traded away)
      expect(balances[2]).to.equal(ethers.parseEther('400')); // player1 gold
      expect(balances[3]).to.equal(1n); // player2 weapon
      expect(balances[4]).to.equal(ethers.parseEther('75')); // player2 gold (after burn)
    });

    it('Should simulate governance: pause, update metadata, unpause', async function () {
      await token.registerObjectLayer(owner.address, 'gov-item', 'old-cid', 10n, '0x');
      const tokenId = await token.computeTokenId('gov-item');

      // Pause for maintenance
      await token.pause();
      await expect(
        token.safeTransferFrom(owner.address, player1.address, tokenId, 1n, '0x'),
      ).to.be.revertedWithCustomError(token, 'EnforcedPause');

      // Update metadata while paused (setTokenMetadataCID does not transfer, so it works)
      await token.setTokenMetadataCID(tokenId, 'new-upgraded-cid');
      expect(await token.getMetadataCID(tokenId)).to.equal('new-upgraded-cid');

      // Resume operations
      await token.unpause();
      await token.safeTransferFrom(owner.address, player1.address, tokenId, 1n, '0x');
      expect(await token.balanceOf(player1.address, tokenId)).to.equal(1n);
    });
  });
});
