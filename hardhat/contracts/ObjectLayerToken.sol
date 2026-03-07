// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';
import '@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol';
import '@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol';
import '@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title ObjectLayerToken
 * @dev A unified ERC-1155 multi-token contract for the Cyberia Online Object Layer ecosystem.
 *
 * A single ERC-1155 contract that represents both fungible and non-fungible tokens
 * within the Object Layer paradigm.
 *
 * Token ID semantics:
 *   - Token ID 0 (CRYPTOKOYN): Fungible in-game currency.
 *     Minted with 18-decimal supply; divisible and stackable.
 *   - Token IDs >= 1: Object Layer item tokens. Each token ID is derived from
 *     `uint256(keccak256(abi.encodePacked(namespace, itemId)))`.
 *     - Supply of 1 → non-fungible (unique gear).
 *     - Supply > 1 → semi-fungible (stackable resources, consumables).
 *
 * Object Layer mapping:
 *   Each on-chain token ID corresponds to an off-chain ObjectLayer document whose
 *   `data.ledger` field references this contract:
 *     {
 *       "type": "ERC-1155",
 *       "address": "<this contract address>",
 *       "tokenId": "<uint256 token id>"
 *     }
 *
 *   The token URI resolves to `ipfs://{metadataCid}/{tokenId}.json` where
 *   metadataCid is the IPFS CID stored in `data.render.metadataCid`.
 *
 * Features:
 *   - Mint / batch-mint (owner only) — register new Object Layer items on-chain.
 *   - Burn / batch-burn — holders can destroy tokens.
 *   - Pause / unpause — owner can freeze all transfers (emergency governance).
 *   - Supply tracking — on-chain total supply per token ID via ERC1155Supply.
 *   - On-chain item registry — maps token IDs to IPFS metadata CIDs and item identifiers.
 *
 * Designed for deployment on Hyperledger Besu (IBFT2/QBFT) private networks via Hardhat.
 */
contract ObjectLayerToken is ERC1155, ERC1155Burnable, ERC1155Pausable, ERC1155Supply, Ownable {
  // ──────────────────────────────────────────────────────────────────────
  // Constants
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Token ID 0 is the fungible in-game currency (CryptoKoyn / CKY equivalent).
   */
  uint256 public constant CRYPTOKOYN = 0;

  /**
   * @dev Initial fungible supply minted to the deployer (10 million with 18 decimals).
   */
  uint256 public constant INITIAL_CRYPTOKOYN_SUPPLY = 10_000_000 * 1e18;

  // ──────────────────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Base URI prefix for token metadata (e.g. "ipfs://").
   */
  string private _baseTokenURI;

  /**
   * @dev Per-token-ID metadata CID override. When set, the full URI becomes
   *      `{_baseTokenURI}{_tokenCIDs[id]}`.
   */
  mapping(uint256 => string) private _tokenCIDs;

  /**
   * @dev Human-readable item identifier for each registered token ID.
   *      Maps tokenId → itemId string (e.g. "hatchet", "gold-ore").
   */
  mapping(uint256 => string) private _itemIds;

  /**
   * @dev Reverse lookup: keccak256(itemId) → tokenId. Used to prevent duplicate registrations.
   */
  mapping(bytes32 => uint256) private _itemIdToTokenId;

  /**
   * @dev Counter tracking the next sequential token ID for auto-registration.
   *      Starts at 1 because token ID 0 is reserved for CRYPTOKOYN.
   */
  uint256 private _nextTokenId;

  // ──────────────────────────────────────────────────────────────────────
  // Events
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Emitted when a new Object Layer item is registered on-chain.
   * @param tokenId The ERC-1155 token ID assigned to this item.
   * @param itemId The human-readable item identifier (e.g. "hatchet").
   * @param metadataCid The IPFS CID pointing to the item's metadata JSON.
   * @param initialSupply The number of tokens minted in the registration transaction.
   */
  event ObjectLayerRegistered(uint256 indexed tokenId, string itemId, string metadataCid, uint256 initialSupply);

  /**
   * @dev Emitted when a token's metadata CID is updated.
   * @param tokenId The ERC-1155 token ID whose metadata was updated.
   * @param metadataCid The new IPFS CID.
   */
  event MetadataUpdated(uint256 indexed tokenId, string metadataCid);

  // ──────────────────────────────────────────────────────────────────────
  // Constructor
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Deploys the contract, mints the initial CryptoKoyn supply to the deployer,
   *      and registers token ID 0 as the fungible currency.
   * @param initialOwner The address that will own the contract and receive the initial supply.
   * @param baseURI The base URI prefix for metadata resolution (e.g. "ipfs://").
   */
  constructor(address initialOwner, string memory baseURI) ERC1155(baseURI) Ownable(initialOwner) {
    _baseTokenURI = baseURI;
    _nextTokenId = 1;

    // Register and mint the fungible currency token
    _itemIds[CRYPTOKOYN] = 'cryptokoyn';
    _itemIdToTokenId[keccak256(abi.encodePacked('cryptokoyn'))] = CRYPTOKOYN;
    _mint(initialOwner, CRYPTOKOYN, INITIAL_CRYPTOKOYN_SUPPLY, '');

    emit ObjectLayerRegistered(CRYPTOKOYN, 'cryptokoyn', '', INITIAL_CRYPTOKOYN_SUPPLY);
  }

  // ──────────────────────────────────────────────────────────────────────
  // URI
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Returns the metadata URI for a given token ID.
   *      If a per-token CID is set, returns `{baseURI}{cid}`.
   *      Otherwise falls back to the ERC-1155 default `{baseURI}{id}.json`.
   * @param tokenId The token ID to query.
   * @return The full metadata URI string.
   */
  function uri(uint256 tokenId) public view override returns (string memory) {
    string memory tokenCid = _tokenCIDs[tokenId];
    if (bytes(tokenCid).length > 0) {
      return string(abi.encodePacked(_baseTokenURI, tokenCid));
    }
    return super.uri(tokenId);
  }

  /**
   * @dev Updates the base URI prefix. Only callable by the owner.
   * @param newBaseURI The new base URI string.
   */
  function setBaseURI(string calldata newBaseURI) external onlyOwner {
    _baseTokenURI = newBaseURI;
    _setURI(newBaseURI);
  }

  /**
   * @dev Sets or updates the IPFS metadata CID for a specific token ID.
   *      Only callable by the owner.
   * @param tokenId The token ID to update.
   * @param metadataCid The new IPFS CID string.
   */
  function setTokenMetadataCID(uint256 tokenId, string calldata metadataCid) external onlyOwner {
    _tokenCIDs[tokenId] = metadataCid;
    emit MetadataUpdated(tokenId, metadataCid);
    emit URI(uri(tokenId), tokenId);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Object Layer Registration
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Computes the deterministic token ID for a given item identifier.
   * @param itemId The human-readable item identifier string.
   * @return The uint256 token ID derived from keccak256.
   */
  function computeTokenId(string calldata itemId) public pure returns (uint256) {
    return uint256(keccak256(abi.encodePacked('cyberia.object-layer:', itemId)));
  }

  /**
   * @dev Registers a new Object Layer item on-chain and mints the initial supply.
   *      The token ID is deterministically derived from the item identifier.
   *      Reverts if the item identifier has already been registered.
   *
   *      For unique (non-fungible) items, set `initialSupply` to 1.
   *      For stackable (semi-fungible) items, set `initialSupply` > 1.
   *
   * @param to The address to receive the minted tokens.
   * @param itemId The human-readable item identifier (e.g. "hatchet", "gold-ore").
   * @param metadataCid The IPFS CID for the item's metadata JSON.
   * @param initialSupply The number of tokens to mint.
   * @param data Additional data forwarded to the ERC-1155 receiver hook.
   * @return tokenId The assigned ERC-1155 token ID.
   */
  function registerObjectLayer(
    address to,
    string calldata itemId,
    string calldata metadataCid,
    uint256 initialSupply,
    bytes calldata data
  ) external onlyOwner returns (uint256 tokenId) {
    bytes32 itemHash = keccak256(abi.encodePacked(itemId));
    require(
      (_itemIdToTokenId[itemHash] == 0 && bytes(_itemIds[0]).length > 0) || _itemIdToTokenId[itemHash] == 0,
      'ObjectLayerToken: item already registered'
    );

    tokenId = computeTokenId(itemId);

    // Prevent collision with an existing different item at the same hash-derived ID
    require(bytes(_itemIds[tokenId]).length == 0, 'ObjectLayerToken: token ID collision');

    _itemIds[tokenId] = itemId;
    _itemIdToTokenId[itemHash] = tokenId;

    if (bytes(metadataCid).length > 0) {
      _tokenCIDs[tokenId] = metadataCid;
    }

    if (initialSupply > 0) {
      _mint(to, tokenId, initialSupply, data);
    }

    emit ObjectLayerRegistered(tokenId, itemId, metadataCid, initialSupply);
  }

  /**
   * @dev Batch-registers multiple Object Layer items in a single transaction.
   * @param to The address to receive all minted tokens.
   * @param itemIds Array of human-readable item identifiers.
   * @param metadataCids Array of IPFS CIDs for each item's metadata.
   * @param supplies Array of initial supply amounts for each item.
   * @param data Additional data forwarded to the ERC-1155 receiver hook.
   * @return tokenIds Array of assigned ERC-1155 token IDs.
   */
  function batchRegisterObjectLayers(
    address to,
    string[] calldata itemIds,
    string[] calldata metadataCids,
    uint256[] calldata supplies,
    bytes calldata data
  ) external onlyOwner returns (uint256[] memory tokenIds) {
    require(
      itemIds.length == metadataCids.length && itemIds.length == supplies.length,
      'ObjectLayerToken: array length mismatch'
    );

    tokenIds = new uint256[](itemIds.length);
    uint256[] memory mintIds = new uint256[](itemIds.length);
    uint256[] memory mintAmounts = new uint256[](itemIds.length);

    for (uint256 i = 0; i < itemIds.length; i++) {
      uint256 tokenId = computeTokenId(itemIds[i]);

      require(bytes(_itemIds[tokenId]).length == 0, 'ObjectLayerToken: item already registered or token ID collision');

      bytes32 itemHash = keccak256(abi.encodePacked(itemIds[i]));
      _itemIds[tokenId] = itemIds[i];
      _itemIdToTokenId[itemHash] = tokenId;

      if (bytes(metadataCids[i]).length > 0) {
        _tokenCIDs[tokenId] = metadataCids[i];
      }

      tokenIds[i] = tokenId;
      mintIds[i] = tokenId;
      mintAmounts[i] = supplies[i];

      emit ObjectLayerRegistered(tokenId, itemIds[i], metadataCids[i], supplies[i]);
    }

    _mintBatch(to, mintIds, mintAmounts, data);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Minting (additional supply for existing tokens)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Mints additional supply for an existing token ID. Only callable by the owner.
   * @param to The address to receive the minted tokens.
   * @param tokenId The token ID to mint.
   * @param amount The number of tokens to mint.
   * @param data Additional data forwarded to the ERC-1155 receiver hook.
   */
  function mint(address to, uint256 tokenId, uint256 amount, bytes calldata data) external onlyOwner {
    _mint(to, tokenId, amount, data);
  }

  /**
   * @dev Batch-mints additional supply for multiple existing token IDs.
   *      Only callable by the owner.
   * @param to The address to receive all minted tokens.
   * @param ids Array of token IDs.
   * @param amounts Array of amounts to mint for each token ID.
   * @param data Additional data forwarded to the ERC-1155 receiver hook.
   */
  function mintBatch(
    address to,
    uint256[] calldata ids,
    uint256[] calldata amounts,
    bytes calldata data
  ) external onlyOwner {
    _mintBatch(to, ids, amounts, data);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Pause / Unpause
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Pauses all token transfers. Only callable by the owner.
   *      Used for emergency governance or maintenance windows.
   */
  function pause() external onlyOwner {
    _pause();
  }

  /**
   * @dev Unpauses all token transfers. Only callable by the owner.
   */
  function unpause() external onlyOwner {
    _unpause();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Query helpers
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Returns the item identifier for a given token ID.
   * @param tokenId The token ID to look up.
   * @return The human-readable item identifier string.
   */
  function getItemId(uint256 tokenId) external view returns (string memory) {
    return _itemIds[tokenId];
  }

  /**
   * @dev Returns the token ID for a given item identifier.
   * @param itemId The human-readable item identifier.
   * @return The ERC-1155 token ID (0 if not registered, but 0 is also CRYPTOKOYN).
   */
  function getTokenIdByItemId(string calldata itemId) external view returns (uint256) {
    return _itemIdToTokenId[keccak256(abi.encodePacked(itemId))];
  }

  /**
   * @dev Returns the IPFS metadata CID for a given token ID.
   * @param tokenId The token ID to look up.
   * @return The IPFS CID string (empty if not set).
   */
  function getMetadataCID(uint256 tokenId) external view returns (string memory) {
    return _tokenCIDs[tokenId];
  }

  /**
   * @dev Returns the next auto-incremented token ID (informational only;
   *      `registerObjectLayer` uses deterministic IDs from keccak256).
   */
  function nextTokenId() external view returns (uint256) {
    return _nextTokenId;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Internal overrides required by Solidity
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Hook that is called before any token transfer. Ensures both
   *      ERC1155Pausable (transfer-blocking when paused) and ERC1155Supply
   *      (total supply tracking) logic execute correctly.
   */
  function _update(
    address from,
    address to,
    uint256[] memory ids,
    uint256[] memory values
  ) internal override(ERC1155, ERC1155Pausable, ERC1155Supply) {
    super._update(from, to, ids, values);
  }
}
