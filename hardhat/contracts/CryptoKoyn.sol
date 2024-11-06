// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';

/**
 * @title CryptoKoyn Token
 * @dev An ERC20 token with minting, burning, pausing, and permit functionalities.
 */
contract CryptoKoyn is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ERC20Permit {
  /**
   * @dev Constructs a new CryptoKoyn token.
   * @param initialOwner The initial owner of the token.
   */
  constructor(address initialOwner) ERC20('CryptoKoyn', 'CKY') Ownable(initialOwner) ERC20Permit('CryptoKoyn') {
    _mint(msg.sender, 10000000 * 10 ** decimals());
  }

  /**
   * @dev Pauses all token transfers.
   * @dev Only the owner can call this function.
   */
  function pause() public onlyOwner {
    _pause();
  }

  /**
   * @dev Unpauses all token transfers.
   * @dev Only the owner can call this function.
   */
  function unpause() public onlyOwner {
    _unpause();
  }

  /**
   * @dev Mints new tokens.
   * @param to The recipient of the minted tokens.
   * @param amount The amount of tokens to mint.
   * @dev Only the owner can call this function.
   */
  function mint(address to, uint256 amount) public onlyOwner {
    _mint(to, amount);
  }

  /**
   * @dev Overrides the `_update` function to ensure proper token transfer handling.
   * @param from The sender of the tokens.
   * @param to The recipient of the tokens.
   * @param value The amount of tokens to transfer.
   */
  function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Pausable) {
    super._update(from, to, value);
  }
}
