# Database and Backup Management Guide

## Overview

The Underpost DB CLI provides comprehensive database management capabilities for Kubernetes-based deployments, supporting both MariaDB and MongoDB. This guide covers import/export operations, multi-pod targeting, backup management, and Git integration.

## Table of Contents

- [Quick Start](#quick-start)
- [Command Syntax](#command-syntax)
- [Options Reference](#options-reference)
- [MariaDB Operations](#mariadb-operations)
- [MongoDB Operations](#mongodb-operations)
- [Multi-Pod Targeting](#multi-pod-targeting)
- [Git Integration](#git-integration)
- [Advanced Use Cases](#advanced-use-cases)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Export Database Backup

```bash
# Export MariaDB database (uses default namespace)
node bin db --export dd-myapp

# Export MongoDB database (uses default namespace)
node bin db --export dd-myapp

# Export with specific namespace
node bin db --export --ns production dd-myapp
```

### Import Database Backup

```bash
# Import MariaDB database (uses default namespace)
node bin db --import dd-myapp

# Import MongoDB database with drop
node bin db --import --drop dd-myapp

# Import with Git integration
node bin db --import --git dd-cyberia

# Display database statistics
node bin db --stats dd-myapp
```

---

## Command Syntax

```bash
node bin db <deploy-list> [options]
```

### Arguments

- **`<deploy-list>`** - Comma-separated list of deployment IDs (e.g., `dd-app1,dd-app2`)

---

## Options Reference

### Core Operations

| Option | Description | Example |
|--------|-------------|---------|
| `--import` | Import data from backup | `--import` |
| `--export` | Export data to backup | `--export` |
| `--stats` | Display database statistics (collections/tables with counts) | `--stats` |

### Pod/Node Targeting

| Option | Description | Example |
|--------|-------------|---------|
| `--pod-name <names>` | Target specific pods (supports wildcards) | `--pod-name "mariadb-0,mariadb-1"` |
| `--node-name <names>` | Filter pods by node placement | `--node-name "node-1,node-2"` |
| `--label-selector <selector>` | Kubernetes label selector | `--label-selector "app=mariadb"` |
| `--all-pods` | Target all matching pods | `--all-pods` |
| `--primary-pod` | Automatically detect and use MongoDB primary pod (MongoDB only) | `--primary-pod` |
| `--ns <namespace>` | Kubernetes namespace (default: `default`) | `--ns production` |

**Note:** If `--node-name` is not specified, all pods in the namespace will be considered (node filtering will be skipped).

### Database Options

| Option | Description | Example |
|--------|-------------|---------|
| `--collections <names>` | Comma-separated collection list (MongoDB) | `--collections "users,posts"` |
| `--drop` | Drop database before import | `--drop` |
| `--preserveUUID` | Preserve UUIDs during import (MongoDB) | `--preserveUUID` |
| `--hosts <hosts>` | Filter by database hosts | `--hosts "localhost,example.com"` |
| `--paths <paths>` | Filter by paths | `--paths "/,/api"` |
| `--out-path <path>` | Custom output path for backups | `--out-path ./my-backup` |

### Git Integration

| Option | Description | Example |
|--------|-------------|---------|
| `--git` | Enable Git backup versioning | `--git` |
| `--macro-rollback-export <n>` | Rollback n commits before export (requires `--git` and `--export`) | `--macro-rollback-export 3` |

---

## Database Statistics

### MongoDB Statistics

Display all collections with document counts:

```bash
# Basic statistics
node bin db --stats dd-myapp

# Statistics from specific pod
node bin db --stats --pod-name mongodb-0 dd-myapp

# Statistics from primary pod
node bin db --stats --primary-pod dd-myapp

# Statistics from specific namespace
node bin db --stats --ns production dd-myapp
```

**MongoDB Output Example:**
```
======================================================================
DATABASE: example2-cyberia (MONGOOSE)
======================================================================
Collections                                        Documents/Rows
----------------------------------------------------------------------
users                                                           1523
posts                                                            847
comments                                                        3421
sessions                                                         156
tokens                                                           892
notifications                                                    654
----------------------------------------------------------------------
TOTAL                                                           8493
======================================================================
```

### MariaDB Statistics

Display all tables with row counts:

```bash
# Basic statistics
node bin db --stats dd-myapp

# Statistics from specific pod
node bin db --stats --pod-name mariadb-statefulset-0 dd-myapp

# Statistics from specific namespace
node bin db --stats --ns production dd-myapp
```

**MariaDB Output Example:**
```
======================================================================
DATABASE: my-database (MARIADB)
======================================================================
Tables                                             Documents/Rows
----------------------------------------------------------------------
customers                                                       2341
orders                                                          5678
products                                                        1234
inventory                                                       3456
invoices                                                        4567
----------------------------------------------------------------------
TOTAL                                                          17276
======================================================================
```

### Statistics with Other Options

Combine statistics with pod filtering:

```bash
# Stats from all pods
node bin db --stats --all-pods dd-myapp

# Stats from specific node
node bin db --stats --node-name "node-1" dd-myapp

# Stats with host and path filtering
node bin db --stats --hosts "localhost" --paths "/" dd-myapp
```

### Use Case: Pre-Backup Verification

Check database size before creating backups:

```bash
# Check statistics
node bin db --stats dd-myapp

# If size is acceptable, proceed with backup
node bin db --export --git dd-myapp
```

---

## MariaDB Operations

### Basic Export

Export MariaDB database from the default pod:

```bash
node bin db --export dd-myapp
```

### Export from Specific Pod

Export from a specific MariaDB pod:

```bash
node bin db --export --pod-name mariadb-statefulset-0 dd-myapp
```

### Export from Multiple Pods

Export from multiple pods:

```bash
node bin db --export --pod-name "mariadb-0,mariadb-1" --all-pods dd-myapp
```

### Export with Custom Namespace

Export from a specific namespace:

```bash
node bin db --export --ns production dd-myapp
```

### Export to Custom Path

Export to a custom directory:

```bash
node bin db --export --out-path ./custom-backup dd-myapp
```

### Export with Git Versioning

Export and commit to Git repository:

```bash
node bin db --export --git dd-myapp
```

### Basic Import

Import MariaDB database to the default pod:

```bash
node bin db --import dd-myapp
```

### Import and Drop Existing Database

Import and replace existing database:

```bash
node bin db --import --drop dd-myapp
```

### Import to Specific Pod

Import to a specific MariaDB pod:

```bash
node bin db --import --pod-name mariadb-statefulset-0 dd-myapp
```

### Import to All Pods

Import to all MariaDB pods in a statefulset:

```bash
node bin db --import --all-pods dd-myapp
```

### Export to Custom Path

Export to a custom directory:

```bash
node bin db --export --out-path ./custom-backup dd-myapp
```

---

## MongoDB Operations

### Basic Export

Export MongoDB database from the default pod:

```bash
node bin db --export dd-myapp
```

### Export Specific Collections

Export only specific collections:

```bash
node bin db --export --collections "users,posts,comments" dd-myapp
```

### Export from Specific Pod

Export from a specific MongoDB pod:

```bash
node bin db --export --pod-name mongodb-0 dd-myapp
```

### Export from Multiple Pods

Export from multiple MongoDB pods:

```bash
node bin db --export --pod-name "mongodb-0,mongodb-1,mongodb-2" --all-pods dd-myapp
```

### Export with Git Versioning

Export and version control with Git:

```bash
node bin db --export --git dd-myapp
```

### Export to Custom Path

Export to a specific directory:

```bash
node bin db --export --out-path ./mongo-backup dd-myapp
```

### Export from Specific Namespace

Export from a different namespace:

```bash
node bin db --export --ns staging dd-myapp
```

### Export with Macro Rollback

Export after rolling back n commits in the Git repository (useful for reverting to a previous backup state):

```bash
# Rollback 2 commits and export
node bin db --export --git --macro-rollback-export 2 dd-myapp

# Rollback 5 commits before exporting
node bin db --export --git --macro-rollback-export 5 dd-myapp
```

**What happens:**
1. Clones/pulls the Git backup repository
2. Rolls back the specified number of commits using `underpost cmt . reset <n>`
3. Exports the database with the rolled-back state
4. Useful for recovering from bad backups or reverting to earlier states

### Basic Import

Import MongoDB database to the default pod:

```bash
node bin db --import dd-myapp
```

### Import with Drop

Import and drop existing collections:

```bash
node bin db --import --drop dd-myapp
```

### Import Preserving UUIDs

Import while preserving document UUIDs:

```bash
node bin db --import --preserveUUID dd-myapp
```

### Import with Drop and Preserve UUID

Combine drop and preserve UUID:

```bash
node bin db --import --drop --preserveUUID dd-myapp
```

### Import to Specific Pod

Import to a specific MongoDB pod:

```bash
node bin db --import --pod-name mongodb-0 dd-myapp
```

### Import to All Pods

Import to all MongoDB pods in replica set:

```bash
node bin db --import --all-pods dd-myapp
```

### Import from Custom Path

Import from a custom backup location:

```bash
node bin db --import --out-path ./mongo-backup dd-myapp
```

### Import Specific Collections

Import only specific collections:

```bash
node bin db --import --collections "users,posts" dd-myapp
```

### Import to Primary Pod Only

Automatically detect and import to MongoDB primary pod in a replica set:

```bash
node bin db --import --primary-pod dd-myapp
```

**What happens:**
1. Queries the replica set to find the PRIMARY node
2. Targets only that pod for import operation
3. Ensures data is written to the primary for proper replication

### Import to Primary with Drop and Preserve UUID

```bash
node bin db --import --drop --preserveUUID --primary-pod dd-myapp
```

### Export from Primary Pod

```bash
node bin db --export --primary-pod dd-myapp
```

**Use Cases for `--primary-pod`:**
- Ensuring writes go to the primary in a replica set
- Avoiding read-only secondary nodes during imports
- Maintaining data consistency in multi-node deployments
- Automatic failover handling (always finds current primary)

### Display Collection Statistics

View all collections and their document counts:

```bash
# Display MongoDB collection statistics
node bin db --stats dd-myapp

# Display from specific pod
node bin db --stats --pod-name mongodb-0 dd-myapp

# Display from primary pod
node bin db --stats --primary-pod dd-myapp

# Display from specific namespace
node bin db --stats --ns production dd-myapp
```

**Output example:**
```
======================================================================
DATABASE: example2-cyberia (MONGOOSE)
======================================================================
Collections                                        Documents/Rows
----------------------------------------------------------------------
users                                                           1523
posts                                                            847
comments                                                        3421
sessions                                                         156
----------------------------------------------------------------------
TOTAL                                                           5947
======================================================================
```

---

## Multi-Pod Targeting

### Target Pods by Name Pattern

Use wildcards to match multiple pods:

```bash
# Target all mariadb pods
node bin db --export --pod-name "mariadb-*" --all-pods dd-myapp

# Target specific numbered pods
node bin db --export --pod-name "mongodb-0,mongodb-2" --all-pods dd-myapp
```

### Target Pods by Node

Filter pods running on specific nodes:

```bash
# Export from pods on specific nodes
node bin db --export --node-name "node-1,node-2" --all-pods dd-myapp

# Import to pods on a single node
node bin db --import --node-name "node-production" --all-pods dd-myapp
```

**Note:** When `--node-name` is not specified, no node filtering is applied and all pods in the namespace are considered. This is the recommended default behavior when working with Kubernetes clusters where node names may not be available in kubectl output.

### Target Pods by Label Selector

Use Kubernetes labels to select pods:

```bash
# Target pods with specific label
node bin db --export --label-selector "app=mariadb,tier=backend" dd-myapp
```

### Combine Multiple Filters

Combine pod name, node, and namespace filters:

```bash
node bin db --export \
  --pod-name "mariadb-*" \
  --node-name "node-1,node-2" \
  --ns production \
  --all-pods \
  dd-myapp
```

### Use MongoDB Primary Pod

Automatically detect and use the primary pod in a MongoDB replica set:

```bash
# Export from primary pod
node bin db --export --primary-pod dd-myapp

# Import to primary pod
node bin db --import --drop --preserveUUID --primary-pod dd-myapp

# With specific namespace
node bin db --import --primary-pod --ns production dd-myapp
```

**How it works:**
The `--primary-pod` option executes:
```bash
kubectl exec -it mongodb-0 -- mongosh --quiet --eval 'rs.status().members.filter(m => m.stateStr=="PRIMARY").map(m=>m.name)'
```
This command queries the replica set status and returns the current PRIMARY pod name.

### Single Pod vs All Pods

```bash
# Default: targets only the first matching pod
node bin db --export --pod-name "mongodb-*" dd-myapp

# Target all matching pods
node bin db --export --pod-name "mongodb-*" --all-pods dd-myapp
```

---

## Git Integration

### Setup

Ensure `GITHUB_USERNAME` environment variable is set:

```bash
export GITHUB_USERNAME=your-username
```

### Export with Git Backup

Automatically clone/pull, commit, and push backups:

```bash
node bin db --export --git dd-myapp
```

**What happens:**
1. Clones or pulls the backup repository: `engine-myapp-cron-backups`
2. Exports database to timestamped directory
3. Commits changes with timestamp
4. Pushes to GitHub

### Import from Git Backup

Import the latest backup from Git:

```bash
node bin db --import --git dd-myapp
```

**What happens:**
1. Pulls latest backup from repository
2. Imports the most recent timestamped backup

### Backup Retention

- Maximum of **5 backups** are retained per database
- Oldest backups are automatically removed when limit is reached
- Configurable via `MAX_BACKUP_RETENTION` constant in code

---

## Advanced Use Cases

### Multi-Deployment Backup

Backup multiple deployments in one command:

```bash
node bin db --export --git dd-app1,dd-app2,dd-app3
```

### Cross-Namespace Operations

Export from production, import to staging:

```bash
# Export from production
node bin db --export --ns production --out-path ./prod-backup dd-myapp

# Import to staging
node bin db --import --ns staging --out-path ./prod-backup dd-myapp
```

### Filter by Host and Path

Target specific database configurations:

```bash
node bin db --export \
  --hosts "api.example.com" \
  --paths "/api,/admin" \
  dd-myapp
```

### Partial Collection Export (MongoDB)

Export only specific collections:

```bash
node bin db --export \
  --collections "users,sessions,tokens" \
  --out-path ./partial-backup \
  dd-myapp
```

### High Availability Import

Import to all pods in a replica set simultaneously:

```bash
node bin db --import \
  --drop \
  --preserveUUID \
  --all-pods \
  --ns production \
  dd-myapp
```

---

## Best Practices

### 1. Enable Git Backups for Production

Version control your database backups:

```bash
node bin db --export --git dd-production-app
```

### 2. Use Specific Namespaces

Explicitly specify namespaces to avoid accidents:

```bash
node bin db --export --ns production dd-myapp
```

### 3. Target Specific Pods for Critical Operations

Use `--primary-pod` for MongoDB imports to ensure data goes to the primary:

```bash
# Import to MongoDB primary pod automatically
node bin db --import --primary-pod dd-myapp

# Or manually specify the pod
node bin db --import --pod-name "mongodb-0" dd-myapp
```

### 4. Preserve UUIDs for MongoDB

Always use `--preserveUUID` for MongoDB imports:

```bash
node bin db --import --drop --preserveUUID dd-myapp
```

### 5. Regular Automated Backups

Set up cron jobs for automated backups:

```bash
# Daily backup at 2 AM
0 2 * * * node bin db --export --git dd-myapp
```

### 6. Custom Output Paths for Organization

Use descriptive backup directories:

```bash
node bin db --export --out-path ./backups/$(date +%Y%m%d) dd-myapp
```

### 7. Filter Collections for Large Databases

Export only needed collections to save time and space:

```bash
node bin db --export --collections "users,products" dd-myapp
```

### 8. Monitor Pod Status

Check pod status before operations:

```bash
kubectl get pods -n production
node bin db --export --ns production dd-myapp
```

### 9. Use Node Targeting for Geo-Distributed Clusters

Target pods on specific nodes for regional backups:

```bash
node bin db --export --node-name "us-east-node-1" dd-myapp
```

### 10. Check Database Statistics Before Operations

Review database size and collection counts before backup:

```bash
# Check statistics first
node bin db --stats dd-myapp

# Then perform backup
node bin db --export --git dd-myapp
```

---

## Troubleshooting

### Common Issues

#### 1. "No pods found matching criteria"

**Problem:** No pods match the specified filters.

**Solution:**
```bash
# Check available pods
kubectl get pods -n default

# Use correct pod name
node bin db --export --pod-name "mariadb-statefulset-0" dd-myapp
```

#### 2. "Invalid namespace format"

**Problem:** Namespace name doesn't follow Kubernetes naming rules.

**Solution:**
```bash
# Use lowercase, alphanumeric, and hyphens only
node bin db --export --ns production dd-myapp  # ✓ Correct
node bin db --export --ns Production_ENV dd-myapp  # ✗ Invalid
```

#### 3. "Configuration file not found"

**Problem:** Deployment configuration doesn't exist.

**Solution:**
```bash
# Check if deployment config exists
ls ./engine-private/conf/dd-myapp/

# Use correct deployment ID
node bin db --export dd-myapp  # not just "myapp"
```

#### 4. "kubectl command failed"

**Problem:** kubectl permissions or connection issues.

**Solution:**
```bash
# Check kubectl access
kubectl get pods

# Check if sudo is needed
sudo kubectl get pods

# Verify Kubernetes context
kubectl config current-context
```

#### 5. "Git operation failed"

**Problem:** GitHub credentials or repository access issues.

**Solution:**
```bash
# Set GitHub username
export GITHUB_USERNAME=your-username

# Check repository exists
# Repository should be: engine-{deployId}-cron-backups

# Verify Git credentials
git config --list
```

#### 6. "Failed to copy file to pod"

**Problem:** Pod filesystem permissions or path issues.

**Solution:**
```bash
# Check pod is running
kubectl get pods -n default

# Verify pod has enough disk space
kubectl exec -n default mariadb-0 -- df -h

# Check pod status
kubectl describe pod mariadb-0 -n default
```

#### 7. "Database import failed"

**Problem:** Backup file corrupted or incompatible.

**Solution:**
```bash
# Verify backup file exists
ls -lh ./backups/

# Check database version compatibility
```

#### 8. "All pods failed"

**Problem:** When using `--all-pods`, all operations failed.

**Solution:**
```bash
# Target single pod first to debug
node bin db --import --pod-name "mongodb-0" dd-myapp

# Check pod logs
kubectl logs mongodb-0 -n default

# Verify network connectivity
kubectl exec -n default mongodb-0 -- ping -c 1 google.com
```

### Debug Mode

Enable detailed logging by checking the log output:

```bash
# Operations are logged with context
# Look for lines starting with:
# - "Executing kubectl command"
# - "Processing pod"
# - "Found X pod(s) matching criteria"
```

### Verify Operations

After import/export, verify the operation:

```bash
# For MariaDB
kubectl exec -n default mariadb-0 -- mariadb -u root -p'password' -e "SHOW DATABASES;"

# For MongoDB
kubectl exec -n default mongodb-0 -- mongosh --eval "show dbs"
```

---

## Examples Summary

### MariaDB Quick Reference

```bash
# Stats
node bin db --stats dd-myapp

# Export
node bin db --export dd-myapp
node bin db --export --git dd-myapp
node bin db --export --pod-name mariadb-0 --ns production dd-myapp

# Import
node bin db --import dd-myapp
node bin db --import --drop dd-myapp
node bin db --import --pod-name mariadb-0 --ns production dd-myapp
```

### MongoDB Quick Reference

```bash
# Stats
node bin db --stats dd-myapp
node bin db --stats --primary-pod dd-myapp

# Export
node bin db --export dd-myapp
node bin db --export --collections "users,posts" dd-myapp
node bin db --export --git --all-pods dd-myapp
node bin db --export --primary-pod dd-myapp

# Import
node bin db --import dd-myapp
node bin db --import --drop --preserveUUID dd-myapp
node bin db --import --pod-name mongodb-0 --ns production dd-myapp
node bin db --import --drop --preserveUUID --primary-pod dd-myapp
```

### Multi-Pod Quick Reference

```bash
# All pods
node bin db --export --all-pods dd-myapp

# Specific nodes
node bin db --export --node-name "node-1,node-2" --all-pods dd-myapp

# Pod patterns
node bin db --export --pod-name "mariadb-*" --all-pods dd-myapp

# MongoDB primary pod
node bin db --import --primary-pod dd-myapp
```

---

## Cluster Metadata Management

In addition to database backups, you can manage cluster metadata (instances and crons):

### Generate Cluster Metadata

```bash
node bin metadata --generate
```

### Export Instances

```bash
node bin metadata --export --instances
```

### Import Instances

```bash
node bin metadata --import --instances
```

### Export Crons

```bash
node bin metadata --export --crons
```

### Import Crons

```bash
node bin metadata --import --crons
```

### Export All Metadata

```bash
node bin metadata --export --instances --crons
```
