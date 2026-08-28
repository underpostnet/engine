# SSH Management Guide

## Overview

The SSH management system provides a comprehensive set of commands for managing SSH users, keys, and secure connections on Linux systems.

SSH credentials are **cluster scoped**, not per deploy id. One registry and one key store serve every deploy running on the cluster, so an account is provisioned once instead of once per app:

| Concern               | Location                                    |
| --------------------- | ------------------------------------------- |
| Users registry        | `./engine-private/deploy/conf.users.json`   |
| Key backup store      | `./engine-private/deploy/users/<username>/` |
| Controller (root) key | `./engine-private/deploy/id_rsa`            |

There is no `--deploy-id` flag on `underpost ssh`: every invocation reads and writes the cluster registry, and key backup/restore is always on.

## Quick Start

### Basic User Management

```bash
# Add a new SSH user
underpost ssh --user-add --user myuser

# Add user with custom configuration
underpost ssh --user-add --user myuser --password "mypass" --groups "wheel,sudo" --port 2222

# Remove a user
underpost ssh --user-remove --user myuser

# List system users (with optional filter)
underpost ssh --user-ls
underpost ssh --user-ls --filter "deploy"
```

### Cluster Registry

```bash
# Add a cluster user (registered and key-backed automatically)
underpost ssh --user-add --user devuser

# Remove the cluster user, its keys, and its registry entry
underpost ssh --user-remove --user devuser

# Print the connection command for a registered node (see Edge Hub WireGuard and HAProxy)
underpost wireguard --connect-uri --nodes hp-envy-iso-ram-rocky9
```

---

## Core Commands

### User Operations

#### `--user-add`

Creates a new SSH user with ED25519 key pair and configures secure access.

**Options:**

- `--user <username>` - Username to create (default: `root`)
- `--password <password>` - User password (auto-generated if not provided)
- `--groups <groups>` - Comma-separated group list (default: `wheel`)
- `--port <port>` - SSH port number (default: `22`)
- `--disable-password` - Disable password authentication

**Features:**

- Automatically generates ED25519 SSH key pair
- Configures `authorized_keys` for key-based authentication
- Sets up proper file permissions (600/700)
- Configures sudo access
- Backs up keys to the cluster key store
- Imports existing keys if the user is already in the cluster registry (a key already trusted cluster wide is reinstalled, never re-issued)

**Example:**

```bash
underpost ssh --user-add --user alice --password "SecurePass123" --groups "wheel,docker"
```

#### `--user-remove`

Removes an SSH user and cleans up all associated files.

**What it does:**

- Deletes system user and home directory
- Removes sudo configuration
- Deletes backed-up keys from the cluster key store
- Removes the user from the cluster registry

**Example:**

```bash
underpost ssh --user-remove --user alice
```

#### `--user-ls`

Lists system users and groups with optional filtering.

**Options:**

- `--filter <pattern>` - Filter results by pattern

**Example:**

```bash
underpost ssh --user-ls --filter "deploy"
```

---

### SSH Service Management

#### `--start`

Starts the SSH service and configures permissions.

**Example:**

```bash
underpost ssh --start --port 22
```

#### `--stop`

Stops the SSH service.

**Example:**

```bash
underpost ssh --stop
```

#### `--status`

Checks SSH service status.

**Example:**

```bash
underpost ssh --status
```

---

### Key Management

#### `--generate`

Generates new SSH credential pair for root user.

**Options:**

- `--user <username>` - User to generate keys for
- `--password <password>` - Key passphrase
- `--host <hostname>` - Host identifier for key comment

**Example:**

```bash
underpost ssh --generate --user root --password "mypass"
```

#### `--keys-list`

Lists authorized SSH keys for current user.

**Example:**

```bash
underpost ssh --keys-list --user alice
```

#### `--key-test`

Tests SSH key validity with passphrase.

**Example:**

```bash
underpost ssh --key-test --user alice --password "mypass"
```

---

### Connection Management

Connection URIs are built by node name, not by account: `underpost wireguard --connect-uri --nodes <node-name>`
joins the node document under `./engine-private/deploy/nodes/` to the management address it is registered
under in this registry. See [Edge Hub WireGuard and HAProxy](<Edge Hub WireGuard and HAProxy.md>).

#### `--hosts-list`

Lists known SSH hosts from `known_hosts` file.

**Example:**

```bash
underpost ssh --hosts-list --user alice
```

---

### Configuration Management

#### `--reset`

Resets SSH configuration by clearing authorized keys and known hosts.

**Warning:** This will remove all authorized keys and known hosts for the user.

**Example:**

```bash
underpost ssh --reset --user alice
```

---

## Common Workflows

### 1. Creating a Cluster User

**Scenario:** Set up a new user with automatic key backup.

```bash
# Create the cluster user
underpost ssh \
  --user-add \
  --user apiuser \
  --groups "wheel,docker" \
  --disable-password

# Get the connection string for the node this account manages
underpost wireguard --connect-uri --nodes hp-envy-iso-ram-rocky9 --copy
```

**What happens:**

1. Creates system user `apiuser`
2. Generates ED25519 key pair
3. Configures passwordless sudo access
4. Backs up keys to `./engine-private/deploy/users/apiuser/`
5. Records the user in `./engine-private/deploy/conf.users.json`
6. Copies SSH connection command to clipboard

---

### 2. Restoring User from Backup

**Scenario:** Re-create a user that is already registered at cluster level.

```bash
# If keys exist in backup, they will be automatically imported
underpost ssh --user-add --user apiuser
```

**What happens:**

1. Checks the cluster registry for the existing user
2. Finds backed-up keys in `./engine-private/deploy/users/apiuser/`
3. Creates system user (if doesn't exist)
4. Imports existing keys instead of generating new ones
5. Configures access with original keys

---

### 3. Managing Multiple Users

**Scenario:** Set up multiple users for team access.

```bash
# Add developer user
underpost ssh --user-add --user dev1 \
  --groups "wheel,developers"

# Add another developer
underpost ssh --user-add --user dev2 \
  --groups "wheel,developers"

# Add ops user with different permissions
underpost ssh --user-add --user ops1 \
  --groups "wheel,ops" \
  --port 2222

# List all users
underpost ssh --user-ls --filter "dev"
```

---

### 4. Secure Deployment Setup

**Scenario:** Set up SSH with maximum security for production.

```bash
# Create user with password authentication disabled
underpost ssh \
  --user-add \
  --user produser \
  --disable-password \
  --groups "wheel"

# Configure and start SSH service
underpost ssh --start --port 22

# Verify service is running
underpost ssh --status

# Test the key
underpost ssh --user produser --key-test --password ""
```

---

### 5. User Cleanup

**Scenario:** Remove a user and all associated data.

```bash
# Remove user completely
underpost ssh \
  --user-remove \
  --user olduser

# Verify removal
underpost ssh --user-ls --filter "olduser"
```

**What gets removed:**

- System user account
- Home directory and all files
- SSH keys and configuration
- Sudo access configuration
- Backed-up keys in the cluster key store
- Cluster registry entry

---

## Key File Locations

### User SSH Directory

```
/home/<username>/.ssh/
├── id_rsa              # Private key (600)
├── id_rsa.pub          # Public key (644)
├── authorized_keys     # Authorized public keys (600)
└── known_hosts         # Known host fingerprints (644)
```

### Cluster Key Store

```
./engine-private/deploy/users/<username>/
├── id_rsa              # Private key backup
└── id_rsa.pub          # Public key backup
```

### System Configuration

```
/etc/sudoers.d/90_<username>    # Sudo configuration
```

---

## Security Best Practices

### 1. Use Key-Based Authentication

```bash
# Always prefer --disable-password for production
underpost ssh --user-add --user produser --disable-password
```

### 2. Use Strong Passwords for Keys

```bash
# If using password-protected keys, use strong passphrases
underpost ssh --user-add --user secureuser --password "$(openssl rand -base64 32)"
```

### 3. Limit User Groups

```bash
# Only add users to necessary groups
underpost ssh --user-add --user limiteduser --groups "wheel"
```

### 4. Regular Key Rotation

```bash
# Remove old user
underpost ssh --user-remove --user oldkey

# Add new user
underpost ssh --user-add --user newkey
```

### 5. Use Non-Standard Ports

```bash
# Use custom SSH port for additional security
underpost ssh --user-add --user secureuser --port 2222
```

---

## Configuration Storage

### Users Registry Structure

User records are stored at cluster level in:

```
./engine-private/deploy/conf.users.json
```

**Registry format** — a flat array of records, each carrying one connection per host:

```json
[
  {
    "user": "admin",
    "password": "",
    "groups": "wheel",
    "keyPath": "./engine-private/deploy/users/admin/id_rsa",
    "pubKeyPath": "./engine-private/deploy/users/admin/id_rsa.pub",
    "hosts": [
      { "host": "10.0.0.2", "port": 22 },
      { "host": "10.0.0.3", "port": 22 }
    ]
  }
]
```

A record holds only what cannot be derived at runtime:

- `hosts` is a list because **one account reaches many hosts** — the same operator account on every WireGuard spoke is the normal case. The host is not a field of the record: it was, and registering the account for a second host silently replaced the first.
- The port belongs to the connection, not the record: two hosts of one account can listen on different ports, and a single record-level port could only describe one of them.
- `keyPath` / `pubKeyPath` point at the **key store**, which is the canonical copy. The on-host pair under `~/.ssh/` is a deployment of it, so it is never recorded.
- An empty `password` means the account is key-only: passwordless sudo, and a forwarding-restricted `authorized_keys` entry. There is no separate flag.
- The home directory is resolved from the system on every run, never stored.

### Registering one account for several hosts

`--user-add` is additive. Each run adds or updates the connection for `--host`, leaving the others in place:

```bash
underpost ssh --user admin --host 10.0.0.2 --user-add
underpost ssh --user admin --host 10.0.0.3 --user-add
underpost ssh --user-ls
# admin@10.0.0.2:22
# admin@10.0.0.3:22
```

Re-running for a host already registered updates that connection rather than appending a duplicate.

Once an account has more than one host, the commands that act on **one** machine — `--user-add`, `--start`, `--key-test`, `--hosts-list` — require `--host` and refuse to guess:

```
[ssh] user 'admin' is registered for several hosts (10.0.0.2, 10.0.0.3); pass --host to select one
```

`--user-ls` and `--user-remove` are account-scoped and need no host.

---

## Advanced Options

### Custom Host Configuration

```bash
underpost ssh --user-add \
  --user myuser \
  --host "custom.example.com" \
  --port 2222
```

The port is stored on that host's connection, so the same account can reach another host on a different port.

### Filter System Users

```bash
# Find all deploy-related users
underpost ssh --user-ls --filter "deploy"

# Find all users in specific group
underpost ssh --user-ls --filter "docker"
```

### Manual Configuration Reset

```bash
# Reset SSH config for specific user
underpost ssh --reset --user myuser

# This clears authorized_keys and known_hosts
```

---

## Troubleshooting

### Key Permission Issues

**Problem:** SSH rejects key due to incorrect permissions.

**Solution:**

```bash
# Restart SSH service to fix permissions
underpost ssh --start --user myuser
```

### User Already Exists

**Problem:** User exists on the host but not in the cluster registry.

**Solution:**

```bash
# Remove and re-add user
underpost ssh --user-remove --user existinguser
underpost ssh --user-add --user existinguser
```

### Lost Keys

**Problem:** Keys were deleted but the user exists in the cluster registry.

**Solution:**

```bash
# If backup exists, re-adding will restore keys
underpost ssh --user-add --user myuser

# Otherwise, remove and create fresh
underpost ssh --user-remove --user myuser
underpost ssh --user-add --user myuser
```

### Connection Testing

```bash
# Test key validity
underpost ssh --user myuser --key-test --password "mypass"

# Get connection command for the node
underpost wireguard --connect-uri --nodes hp-envy-iso-ram-rocky9

# Check service status
underpost ssh --status
```

---

## Command Reference Summary

| Command              | Purpose               | Touches the cluster registry |
| -------------------- | --------------------- | ---------------------------- |
| `--user-add`         | Create SSH user       | Reads and writes             |
| `--user-remove`      | Remove SSH user       | Reads and writes             |
| `--user-ls`          | List users/groups     | Reads                        |
| `--start`            | Start SSH service     | Reads                        |
| `--stop`             | Stop SSH service      | No                           |
| `--status`           | Check service status  | No                           |
| `--generate`         | Generate key pair     | No                           |
| `--keys-list`        | List authorized keys  | No                           |
| `--hosts-list`       | List known hosts      | No                           |
| `--key-test`         | Test key validity     | No                           |
| `--reset`            | Clear SSH config      | No                           |
| `--disable-password` | Disable password auth | No                           |

---

## Default Values

- **User:** `root`
- **Port:** `22`
- **Groups:** `wheel`
- **Host:** Auto-detected public IP
- **Password:** Auto-generated 16-character random string
- **Key Type:** ED25519

---

## Notes

- ED25519 keys are preferred over RSA for better security and performance
- Keys are automatically backed up to the cluster key store on every `--user-add`
- Existing keys are preserved when re-adding a user already in the cluster registry
- Sudo access is automatically configured for wheel group members
- File permissions are automatically set to secure defaults (600 for private keys, 700 for .ssh directory)
