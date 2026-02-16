# SSH Management Guide

## Overview

The SSH management system provides a comprehensive set of commands for managing SSH users, keys, and secure connections on Linux systems. It supports both standalone operations and deployment-specific configurations with automatic key backup and restoration.

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

### Deployment Context

```bash
# Add user with deployment tracking
underpost ssh --deploy-id myproject --user-add --user devuser

# Remove user from deployment
underpost ssh --deploy-id myproject --user-remove --user devuser

# Connect using saved credentials
underpost ssh --deploy-id myproject --user devuser --connect-uri
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
- `--deploy-id <id>` - Track user in deployment context

**Features:**
- Automatically generates ED25519 SSH key pair
- Configures `authorized_keys` for key-based authentication
- Sets up proper file permissions (600/700)
- Configures sudo access
- Backs up keys when using `--deploy-id`
- Imports existing keys if user already exists in deployment config

**Example:**
```bash
underpost ssh --user-add --user alice --password "SecurePass123" --groups "wheel,docker"
```

#### `--user-remove`
Removes an SSH user and cleans up all associated files.

**What it does:**
- Deletes system user and home directory
- Removes sudo configuration
- Deletes backed-up keys (when using `--deploy-id`)
- Updates deployment configuration

**Example:**
```bash
underpost ssh --user-remove --user alice --deploy-id myproject
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

#### `--connect-uri`
Displays SSH connection URI for the user.

**Options:**
- `--copy` - Copy URI to clipboard instead of displaying

**Output format:**
```
ssh username@hostname -i /path/to/key -p port
```

**Example:**
```bash
# Display connection URI
underpost ssh --connect-uri --user alice --host 192.168.1.10

# Copy to clipboard
underpost ssh --connect-uri --user alice --host 192.168.1.10 --copy
```

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

### 1. Creating a Deployment User

**Scenario:** Set up a new user for a specific deployment with automatic key backup.

```bash
# Create user with deployment tracking
underpost ssh --deploy-id production-api \
  --user-add \
  --user apiuser \
  --groups "wheel,docker" \
  --disable-password

# Get connection string
underpost ssh --deploy-id production-api \
  --user apiuser \
  --connect-uri --copy
```

**What happens:**
1. Creates system user `apiuser`
2. Generates ED25519 key pair
3. Configures passwordless sudo access
4. Backs up keys to `./engine-private/conf/production-api/users/apiuser/`
5. Saves configuration for future reference
6. Copies SSH connection command to clipboard

---

### 2. Restoring User from Backup

**Scenario:** Re-create a user that was previously configured in a deployment.

```bash
# If keys exist in backup, they will be automatically imported
underpost ssh --deploy-id production-api --user-add --user apiuser
```

**What happens:**
1. Checks deployment config for existing user
2. Finds backed-up keys in `./engine-private/conf/production-api/users/apiuser/`
3. Creates system user (if doesn't exist)
4. Imports existing keys instead of generating new ones
5. Configures access with original keys

---

### 3. Managing Multiple Users

**Scenario:** Set up multiple users for team access.

```bash
# Add developer user
underpost ssh --deploy-id team-project \
  --user-add --user dev1 \
  --groups "wheel,developers"

# Add another developer
underpost ssh --deploy-id team-project \
  --user-add --user dev2 \
  --groups "wheel,developers"

# Add ops user with different permissions
underpost ssh --deploy-id team-project \
  --user-add --user ops1 \
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
underpost ssh --deploy-id production \
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
underpost ssh --deploy-id production-api \
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
- Backed-up keys (if deployment context used)
- Deployment configuration entry

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

### Deployment Backup Directory
```
./engine-private/conf/<deploy-id>/users/<username>/
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
underpost ssh --deploy-id myapp --user-remove --user oldkey

# Add new user
underpost ssh --deploy-id myapp --user-add --user newkey
```

### 5. Use Non-Standard Ports
```bash
# Use custom SSH port for additional security
underpost ssh --user-add --user secureuser --port 2222
```

---

## Configuration Storage

### Deployment Config Structure
When using `--deploy-id`, user configurations are stored in:
```
./engine-private/conf/<deploy-id>/config.node.json
```

**Config format:**
```json
{
  "users": {
    "username": {
      "user": "username",
      "host": "192.168.1.10",
      "port": 22,
      "password": "",
      "groups": "wheel",
      "keyPath": "/home/username/.ssh/id_rsa",
      "pubKeyPath": "/home/username/.ssh/id_rsa.pub",
      "privateKeyCopyPath": "./engine-private/conf/deploy-id/users/username/id_rsa",
      "publicKeyCopyPath": "./engine-private/conf/deploy-id/users/username/id_rsa.pub",
      "disablePassword": true
    }
  }
}
```

---

## Advanced Options

### Custom Host Configuration
```bash
underpost ssh --user-add \
  --user myuser \
  --host "custom.example.com" \
  --port 2222 \
  --deploy-id custom-deployment
```

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
**Problem:** User exists but not in deployment config.

**Solution:**
```bash
# Remove and re-add user
underpost ssh --user-remove --user existinguser
underpost ssh --deploy-id myproject --user-add --user existinguser
```

### Lost Keys
**Problem:** Keys were deleted but user exists in config.

**Solution:**
```bash
# If backup exists, re-adding will restore keys
underpost ssh --deploy-id myproject --user-add --user myuser

# Otherwise, remove and create fresh
underpost ssh --deploy-id myproject --user-remove --user myuser
underpost ssh --deploy-id myproject --user-add --user myuser
```

### Connection Testing
```bash
# Test key validity
underpost ssh --user myuser --key-test --password "mypass"

# Get connection command
underpost ssh --user myuser --connect-uri

# Check service status
underpost ssh --status
```

---

## Command Reference Summary

| Command | Purpose | Requires Deploy ID |
|---------|---------|-------------------|
| `--user-add` | Create SSH user | Optional |
| `--user-remove` | Remove SSH user | Optional |
| `--user-ls` | List users/groups | No |
| `--start` | Start SSH service | No |
| `--stop` | Stop SSH service | No |
| `--status` | Check service status | No |
| `--generate` | Generate key pair | No |
| `--keys-list` | List authorized keys | No |
| `--hosts-list` | List known hosts | No |
| `--key-test` | Test key validity | No |
| `--connect-uri` | Get connection string | Optional |
| `--reset` | Clear SSH config | No |
| `--disable-password` | Disable password auth | No |
| `--copy` | Copy to clipboard | No |

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
- Keys are automatically backed up when using `--deploy-id`
- Existing keys are preserved when re-adding users in deployment context
- Sudo access is automatically configured for wheel group members
- File permissions are automatically set to secure defaults (600 for private keys, 700 for .ssh directory)