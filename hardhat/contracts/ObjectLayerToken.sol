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
 * @dev The ItemLedger ERC-1155 contract: one token type per registered Object Layer.
 *
 * Token ID semantics:
 *   - Token ID 0 (CRYPTOKOYN): fungible currency, minted with 18-decimal supply.
 *   - Any other token ID is `uint256(contentHash)`, where `contentHash` is the sha2-256 of the
 *     canonical Object Layer bytes: the digest the Object Layer CID carries. The same content
 *     always gives the same token id; two definitions with different content give different
 *     ids, whatever item label they share. No label, owner, contract or textual encoding
 *     takes part in the derivation.
 *     - Supply of 1 → non-fungible (unique gear).
 *     - Supply > 1 → semi-fungible (stackable resources, consumables).
 *
 * A registered definition is immutable: the token id is its content. The CID a token id
 * resolves to is computed from the digest (CIDv1, raw, sha2-256, base32), never stored, never
 * changed. Content lives on IPFS under that CID; ownership is the ERC-1155 balance of each holder.
 *
 * The token URI resolves to `{baseURI}{objectLayerCid}`. The base URI is presentation
 * configuration, the one mutable value here.
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

  /**
   * @dev Multicodec prefix of the Object Layer CID: CIDv1, raw codec, sha2-256, 32-byte digest.
   */
  bytes4 private constant CID_V1_RAW_SHA256_PREFIX = 0x01551220;

  /**
   * @dev Lower-case RFC 4648 base32 alphabet, the CIDv1 base32 multibase.
   */
  bytes private constant BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

  // ──────────────────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Base URI prefix for token metadata (e.g. "ipfs://").
   */
  string private _baseTokenURI;

  /**
   * @dev Token ids registered as Object Layers.
   */
  mapping(uint256 => bool) private _registered;

  // ──────────────────────────────────────────────────────────────────────
  // Events
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Emitted when an Object Layer is registered on-chain.
   * @param tokenId The ERC-1155 token ID: the content hash as uint256.
   * @param contentHash The sha2-256 of the canonical Object Layer bytes.
   * @param objectLayerCid The canonical Object Layer CID.
   * @param initialSupply The number of tokens minted in the registration transaction.
   */
  event ObjectLayerRegistered(uint256 indexed tokenId, bytes32 contentHash, string objectLayerCid, uint256 initialSupply);

  // ──────────────────────────────────────────────────────────────────────
  // Constructor
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Deploys the contract and mints the initial CryptoKoyn supply to the deployer.
   * @param initialOwner The address that will own the contract and receive the initial supply.
   * @param baseURI The base URI prefix for metadata resolution (e.g. "ipfs://").
   */
  constructor(address initialOwner, string memory baseURI) ERC1155(baseURI) Ownable(initialOwner) {
    _baseTokenURI = baseURI;
    _mint(initialOwner, CRYPTOKOYN, INITIAL_CRYPTOKOYN_SUPPLY, '');
  }

  // ──────────────────────────────────────────────────────────────────────
  // URI
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Returns the metadata URI for a token ID: `{baseURI}{objectLayerCid}` for a
   *      registered Object Layer, the ERC-1155 default otherwise.
   * @param tokenId The token ID to query.
   * @return The full metadata URI string.
   */
  function uri(uint256 tokenId) public view override returns (string memory) {
    if (_registered[tokenId]) {
      return string(abi.encodePacked(_baseTokenURI, _cidOf(bytes32(tokenId))));
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

  // ──────────────────────────────────────────────────────────────────────
  // Object Layer Registration
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev The token ID of an Object Layer: its content hash as a uint256.
   * @param contentHash The sha2-256 of the canonical Object Layer bytes.
   * @return The uint256 token ID.
   */
  function computeTokenId(bytes32 contentHash) public pure returns (uint256) {
    return uint256(contentHash);
  }

  /**
   * @dev The content hash a token ID represents.
   * @param tokenId The token ID.
   * @return The sha2-256 of the canonical Object Layer bytes.
   */
  function contentHashOf(uint256 tokenId) public pure returns (bytes32) {
    return bytes32(tokenId);
  }

  /**
   * @dev Registers an Object Layer on-chain and mints the initial supply.
   *      Reverts if the content hash is zero, is the currency id, or is already registered.
   *
   *      For unique (non-fungible) items, set `initialSupply` to 1.
   *      For stackable (semi-fungible) items, set `initialSupply` > 1.
   *
   * @param to The address to receive the minted tokens.
   * @param contentHash The sha2-256 of the canonical Object Layer bytes.
   * @param initialSupply The number of tokens to mint.
   * @param data Additional data forwarded to the ERC-1155 receiver hook.
   * @return tokenId The ERC-1155 token ID.
   */
  function registerObjectLayer(
    address to,
    bytes32 contentHash,
    uint256 initialSupply,
    bytes calldata data
  ) external onlyOwner returns (uint256 tokenId) {
    tokenId = _register(contentHash, initialSupply);
    if (initialSupply > 0) {
      _mint(to, tokenId, initialSupply, data);
    }
  }

  /**
   * @dev Batch-registers Object Layers in a single transaction.
   * @param to The address to receive all minted tokens.
   * @param contentHashes Array of canonical content hashes.
   * @param supplies Array of initial supply amounts for each Object Layer.
   * @param data Additional data forwarded to the ERC-1155 receiver hook.
   * @return tokenIds Array of ERC-1155 token IDs.
   */
  function batchRegisterObjectLayers(
    address to,
    bytes32[] calldata contentHashes,
    uint256[] calldata supplies,
    bytes calldata data
  ) external onlyOwner returns (uint256[] memory tokenIds) {
    require(contentHashes.length == supplies.length, 'ObjectLayerToken: array length mismatch');

    tokenIds = new uint256[](contentHashes.length);
    for (uint256 i = 0; i < contentHashes.length; i++) {
      tokenIds[i] = _register(contentHashes[i], supplies[i]);
    }

    _mintBatch(to, tokenIds, supplies, data);
  }

  function _register(bytes32 contentHash, uint256 initialSupply) private returns (uint256 tokenId) {
    tokenId = uint256(contentHash);
    require(tokenId != CRYPTOKOYN, 'ObjectLayerToken: empty content hash');
    require(!_registered[tokenId], 'ObjectLayerToken: object layer already registered');

    _registered[tokenId] = true;
    emit ObjectLayerRegistered(tokenId, contentHash, _cidOf(contentHash), initialSupply);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Minting (additional supply for existing tokens)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * @dev Mints additional supply of CryptoKoyn or of a registered Object Layer. Only callable by the owner.
   * @param to The address to receive the minted tokens.
   * @param tokenId The token ID to mint.
   * @param amount The number of tokens to mint.
   * @param data Additional data forwarded to the ERC-1155 receiver hook.
   */
  function mint(address to, uint256 tokenId, uint256 amount, bytes calldata data) external onlyOwner {
    require(_isMintable(tokenId), 'ObjectLayerToken: token not registered');
    _mint(to, tokenId, amount, data);
  }

  /**
   * @dev Batch-mints additional supply for several token IDs. Only callable by the owner.
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
    for (uint256 i = 0; i < ids.length; i++) {
      require(_isMintable(ids[i]), 'ObjectLayerToken: token not registered');
    }
    _mintBatch(to, ids, amounts, data);
  }

  function _isMintable(uint256 tokenId) private view returns (bool) {
    return tokenId == CRYPTOKOYN || _registered[tokenId];
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
   * @dev The canonical Object Layer CID a registered token ID represents.
   * @param tokenId The token ID to look up.
   * @return The Object Layer CID (empty if not registered).
   */
  function getObjectLayerCid(uint256 tokenId) external view returns (string memory) {
    if (!_registered[tokenId]) return '';
    return _cidOf(bytes32(tokenId));
  }

  /**
   * @dev Whether a token ID is a registered Object Layer.
   * @param tokenId The token ID to look up.
   */
  function isRegistered(uint256 tokenId) external view returns (bool) {
    return _registered[tokenId];
  }

  /**
   * @dev CIDv1 / raw / sha2-256 / base32 of a content hash: `b` + base32(0x01551220 ‖ digest).
   */
  function _cidOf(bytes32 contentHash) private pure returns (string memory) {
    bytes memory raw = abi.encodePacked(CID_V1_RAW_SHA256_PREFIX, contentHash);
    // 36 bytes = 288 bits = 57 groups of 5 bits and 3 remaining bits: 58 characters.
    bytes memory out = new bytes(59);
    out[0] = 'b';
    uint256 buffer = 0;
    uint256 bits = 0;
    uint256 cursor = 1;
    for (uint256 i = 0; i < raw.length; i++) {
      buffer = (buffer << 8) | uint8(raw[i]);
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        out[cursor++] = BASE32_ALPHABET[(buffer >> bits) & 31];
      }
    }
    if (bits > 0) {
      out[cursor++] = BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
    }
    return string(out);
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
