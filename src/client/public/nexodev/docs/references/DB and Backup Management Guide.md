# DB and Backup Management Guide

This guide provides comprehensive documentation for managing database backups using the `db` command in the Underpost CLI.

## Quick Reference

```bash
# Export backups with Git version control
underpost db <deploy-id> --export --git

# Import backups (clean restore)
underpost db <deploy-id> --import --drop --git

# View database statistics
underpost db <deploy-id> --stats

# MongoDB primary pod operations
underpost db <deploy-id> --export --primary-pod --git

# Multi-pod export
underpost db <deploy-id> --export --pod-name "mariadb-*" --all-pods

# Specific collections only
underpost db <deploy-id> --export --collections users,orders --git

# Generate rollback script
underpost db <deploy-id> --macro-rollback-export 3
```

## Overview

The `db` command supports:
- **Database Types**: MariaDB and MongoDB
- **Operations**: Import, export, statistics, and rollback
- **Git Integration**: Version control for backups
- **Multi-Pod Support**: Target specific pods or all matching pods
- **Kubernetes Native**: Seamless integration with Kubernetes deployments

## Command Syntax

```bash
underpost db <deploy-list> [options]
```

### Required Arguments

- `<deploy-list>`: Comma-separated list of deployment IDs (e.g., `default-a,default-b`)

### Available Options

| Option | Description |
|--------|-------------|
| `--import` | Import container backups from specified repositories |
| `--export` | Export container backups to specified repositories |
| `--pod-name <pod-name>` | Comma-separated pod names or patterns (supports wildcards like `mariadb-*`) |
| `--all-pods` | Target all matching pods instead of just the first one |
| `--primary-pod` | Automatically detect and use MongoDB primary pod (MongoDB only) |
| `--stats` | Display database statistics (collection/table names with document/row counts) |
| `--collections <collections>` | Comma-separated list of database collections to operate on |
| `--out-path <out-path>` | Custom output path for backups |
| `--drop` | Drop specified databases or collections before importing |
| `--preserveUUID` | Preserve UUIDs during database import operations |
| `--git` | Enable Git integration for backup version control |
| `--force-clone` | Force clone Git repository, overwriting local changes |
| `--hosts <hosts>` | Comma-separated list of database hosts to filter operations |
| `--paths <paths>` | Comma-separated list of paths to filter database operations |
| `--ns <ns-name>` | Kubernetes namespace context (defaults to `default`) |
| `--macro-rollback-export <n>` | Export macro rollback script that reverts the last n commits |

---

## Core Usage Examples

### 1. Export Database Backups

Export backups from all databases in a deployment:

```bash
underpost db default-a --export
```

Export with Git version control:

```bash
underpost db default-a --export --git
```

Export to custom output path:

```bash
underpost db default-a --export --out-path /custom/backup/path
```

### 2. Import Database Backups

Import backups to restore databases:

```bash
underpost db default-a --import
```

Import with database drop (clean import):

```bash
underpost db default-a --import --drop
```

Import while preserving UUIDs:

```bash
underpost db default-a --import --preserveUUID
```

Import with Git integration:

```bash
underpost db default-a --import --git
```

### 3. Database Statistics

View database statistics (collections/tables and counts):

```bash
underpost db default-a --stats
```

View stats for specific pod:

```bash
underpost db default-a --stats --pod-name mongodb-primary
```

### 4. Multi-Pod Operations

Target specific pod by name:

```bash
underpost db default-a --export --pod-name mariadb-master
```

Target all pods matching a pattern:

```bash
underpost db default-a --export --pod-name "mariadb-*" --all-pods
```

Automatically detect MongoDB primary pod:

```bash
underpost db default-a --export --primary-pod
```

### 5. Collection-Specific Operations

Export specific collections only:

```bash
underpost db default-a --export --collections users,orders,products
```

Import specific collections with drop:

```bash
underpost db default-a --import --collections users --drop
```

### 6. Git Version Control

Export with Git integration (clone, commit, push):

```bash
underpost db default-a --export --git
```

Force clone repository (overwrite local changes):

```bash
underpost db default-a --export --git --force-clone
```

Import from Git repository:

```bash
underpost db default-a --import --git
```

### 7. Rollback Operations

Generate rollback script to revert last 3 commits:

```bash
underpost db default-a --macro-rollback-export 3
```

Generate rollback script for last 5 commits:

```bash
underpost db default-a --macro-rollback-export 5
```

### 8. Filtered Operations

Filter by specific hosts:

```bash
underpost db default-a --export --hosts db1.example.com,db2.example.com
```

Filter by paths:

```bash
underpost db default-a --export --paths /data/db1,/data/db2
```

Combine host and path filters:

```bash
underpost db default-a --export --hosts db1.example.com --paths /data/db1
```

### 9. Namespace Operations

Specify Kubernetes namespace:

```bash
underpost db default-a --export --ns production
```

Export from multiple deployments in staging namespace:

```bash
underpost db app-a,app-b --export --ns staging --git
```

### 10. Multiple Deployments

Process multiple deployments simultaneously:

```bash
underpost db default-a,default-b,default-c --export --git
```

Export from all deployments with specific pod pattern:

```bash
underpost db default-a,default-b --export --pod-name "mongodb-*" --all-pods
```

---

## Common Workflows

### Complete Backup Workflow

1. **Export with Git version control:**
   ```bash
   underpost db default-a --export --git
   ```

2. **View statistics to verify:**
   ```bash
   underpost db default-a --stats
   ```

3. **Create rollback point (optional):**
   ```bash
   underpost db default-a --macro-rollback-export 1
   ```

### Clean Database Restore

1. **Import with drop to clean existing data:**
   ```bash
   underpost db default-a --import --drop --git
   ```

2. **Verify with statistics:**
   ```bash
   underpost db default-a --stats
   ```

### MongoDB Primary Pod Backup

1. **Auto-detect and backup primary pod:**
   ```bash
   underpost db mongodb-cluster --export --primary-pod --git
   ```

2. **Restore to primary pod:**
   ```bash
   underpost db mongodb-cluster --import --primary-pod --drop
   ```

### Multi-Environment Sync

1. **Export from production:**
   ```bash
   underpost db prod-app --export --git --ns production
   ```

2. **Import to staging with clean slate:**
   ```bash
   underpost db staging-app --import --git --drop --ns staging
   ```

---

## Best Practices

### 1. Always Use Git Integration
Enable `--git` for automated version control and backup history:
```bash
underpost db default-a --export --git
```

### 2. Verify Before Import
Check statistics before importing to understand data impact:
```bash
underpost db default-a --stats
```

### 3. Use --drop Carefully
The `--drop` flag removes existing data. Always backup first:
```bash
underpost db default-a --export --git  # Backup first
underpost db default-a --import --drop  # Then import
```

### 4. Target Specific Pods
For production systems, target specific pods to minimize impact:
```bash
underpost db default-a --export --pod-name mongodb-primary
```

### 5. Create Rollback Points
Before major changes, create rollback scripts:
```bash
underpost db default-a --macro-rollback-export 5
```

### 6. Use Namespaces
Always specify namespace in multi-environment setups:
```bash
underpost db default-a --export --ns production --git
```

---

## Troubleshooting

### Pod Not Found
If pod is not found, list available pods:
```bash
kubectl get pods -n <namespace>
```

Then specify exact pod name:
```bash
underpost db default-a --export --pod-name <exact-pod-name>
```

### Multiple Pods Detected
Use `--all-pods` to process all matching pods:
```bash
underpost db default-a --export --pod-name "mariadb-*" --all-pods
```

Or target the primary pod for MongoDB:
```bash
underpost db default-a --export --primary-pod
```

### Git Conflicts
Force clone to override local changes:
```bash
underpost db default-a --export --git --force-clone
```

### Namespace Access
Ensure you have proper Kubernetes RBAC permissions:
```bash
kubectl auth can-i get pods -n <namespace>
```

---

## Advanced Examples

### Selective Collection Backup and Restore

Export only user-related collections:
```bash
underpost db default-a --export --collections users,user_profiles,user_sessions --git
```

Import only specific collections without affecting others:
```bash
underpost db default-a --import --collections users --preserveUUID
```

### Cross-Namespace Migration

1. Export from production:
   ```bash
   underpost db prod-app --export --git --ns production
   ```

2. Import to development:
   ```bash
   underpost db dev-app --import --git --drop --ns development
   ```

### Automated Backup Script

Create a scheduled backup script:
```bash
#!/bin/bash
# Daily backup with Git version control
underpost db default-a,default-b --export --git --ns production
underpost db default-a,default-b --stats --ns production > backup-stats-$(date +%Y%m%d).log
```

---

## Notes

- **Backup Retention**: System automatically maintains the last `MAX_BACKUP_RETENTION` backups
- **MongoDB Primary Detection**: `--primary-pod` automatically identifies the primary pod in replica sets
- **Wildcard Support**: Pod names support wildcards (e.g., `mariadb-*`, `mongo-*`)
- **Git Requirements**: Git integration requires properly configured GitHub credentials
- **Kubernetes Context**: Ensure `kubectl` is configured with correct cluster context

---

## Related Commands

- `underpost metadata --export`: Export cluster metadata
- `underpost metadata --import`: Import cluster metadata
- `kubectl get pods -n <namespace>`: List available pods

For more information, refer to the [CLI Reference Guide](./CLI%20Reference%20Guide.md).