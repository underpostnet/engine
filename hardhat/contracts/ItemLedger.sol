// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title ItemLedger
 * @dev An ERC721 token contract for managing items, with minting and burning capabilities.
 */
contract ItemLedger is ERC721, ERC721Enumerable, ERC721Burnable, Ownable {
  /**
   * @dev Constructs a new ItemLedger contract.
   * @param initialOwner The initial owner of the contract.
   */
  constructor(address initialOwner) ERC721('ItemLedger', 'IL') Ownable(initialOwner) {}

  /**
   * @dev Sets the base URI for token URIs.
   */
  function _baseURI() internal pure override returns (string memory) {
    return 'IL';
  }

  /**
   * @dev Mints a new NFT to a specified address.
   * @param to The address to mint the NFT to.
   * @param tokenId The ID of the token to be minted.
   * @dev Only the owner can call this function.
   */
  function safeMint(address to, uint256 tokenId) public onlyOwner {
    _safeMint(to, tokenId);
  }

  // The following functions are overrides required by Solidity.
  // They ensure proper interaction with the inherited ERC721 and ERC721Enumerable contracts.

  /**
   * @dev Overrides the `_update` function to ensure proper token ownership updates.
   * @param to The new owner of the token.
   * @param tokenId The ID of the token.
   * @param auth The authorized address for the transfer.
   * @return The address of the previous owner.
   */
  function _update(
    address to,
    uint256 tokenId,
    address auth
  ) internal override(ERC721, ERC721Enumerable) returns (address) {
    return super._update(to, tokenId, auth);
  }

  /**
   * @dev Overrides the `_increaseBalance` function to ensure proper token balance updates.
   * @param account The account to increase the balance of.
   * @param value The amount to increase the balance by.
   */
  function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
    super._increaseBalance(account, value);
  }

  /**
   * @dev Overrides the `supportsInterface` function to ensure proper interface checks.
   * @param interfaceId The interface ID to check.
   * @return True if the contract implements the interface, false otherwise.
   */
  function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
