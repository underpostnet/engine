# PM2 Cron Jobs Cluster Management

## Overview

This document outlines the core functionality of PM2-based cron job management in the Underpost Engine. The system provides automated task scheduling for DNS updates and database backups across multiple deployment configurations.

## Core Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                   PM2 Process Manager                   │
│  ┌─────────────────┐         ┌─────────────────┐        │
│  │  dd-cron-dns    │         │ dd-cron-backup  │        │
│  │  Cron: * * * *  │         │ Cron: 0 1 * * * │        │
│  │  Instances: 1   │         │ Instances: 1    │        │
│  └─────────────────┘         └─────────────────┘        │
└─────────────────────────────────────────────────────────┘
            ↓                            ↓
   ┌────────────────┐          ┌──────────────────┐
   │  Dns.callback  │          │ BackUp.callback  │
   └────────────────┘          └──────────────────┘
            ↓                            ↓
   ┌────────────────┐          ┌──────────────────┐
   │ DNS API Update │          │  Database Export │
   └────────────────┘          └──────────────────┘
```

## Configuration

### File Structure

```
engine-private/
├── deploy/
│   ├── dd.cron          # Cron job deploy ID (e.g., "dd-cron")
│   └── dd.router        # Deploy ID list (e.g., "dd-core,dd-default")
└── conf/
    └── <deploy-id>/
        ├── conf.cron.json    # Cron configuration
        └── package.json      # Start scripts
```

### Configuration Schema

**File:** `./engine-private/conf/<deploy-id>/conf.cron.json`

```json
{
  "records": {
    "A": [
      {
        "host": "example.com",
        "dns": "dondominio",
        "api_key": "API_KEY_HERE",
        "user": "USERNAME_HERE"
      }
    ]
  },
  "jobs": {
    "dns": {
      "expression": "* * * * *",
      "enabled": true,
      "instances": 1
    },
    "backup": {
      "expression": "0 1 * * *",
      "enabled": true,
      "instances": 1
    }
  }
}
```

### Configuration Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `expression` | string | Cron schedule expression | `"0 0 * * *"` |
| `enabled` | boolean | Enable/disable job | `true` |
| `instances` | number | PM2 process instances | `1` |

## CLI Commands

### Initialize PM2 Cron Jobs

```bash
# Initialize all configured jobs
node bin cron --init-pm2-cronjobs --git

# Initialize for specific deploy-ids
node bin cron dd-cron --init-pm2-cronjobs
```

### Update Package Scripts

```bash
# Update package.json for specified deploy-ids
node bin cron dd-cron --init-pm2-cronjobs --update-package-scripts

# Update for multiple deploy-ids
node bin cron dd-core,dd-default --update-package-scripts
```

### Manual Job Execution

```bash
# Execute DNS job
node bin cron dd-cron dns

# Execute backup job for specific deploy-ids
node bin cron dd-core,dd-default backup

# Execute with git backup
node bin cron dd-core,dd-default backup --git
```

### PM2 Management

```bash
# List all PM2 processes
pm2 list

# View logs
pm2 logs dd-cron-dns
pm2 logs dd-cron-backup

# Monitor resources
pm2 monit

# Stop/Delete jobs
pm2 delete dd-cron-dns
pm2 delete dd-cron-backup

# Restart all cron jobs
npm start
```

## Job Types

### 1. DNS Job

**Purpose:** Dynamic DNS IP address updates

**Features:**
- Auto-detects public IP address
- Updates DNS A-records via provider API
- Validates IP changes before updating
- Supports multiple DNS providers

**Configuration Required:**
- DNS provider credentials in `conf.cron.json`
- Host domain names
- API access keys

**Deploy File:** `./engine-private/deploy/dd.cron` (contains: `dd-cron`)

**Execution:**
```bash
node bin cron dd-cron dns
```

### 2. Backup Job

**Purpose:** Automated database exports

**Features:**
- Executes database CLI export command
- Supports multiple deploy-ids
- Optional Git repository upload
- Leverages existing database tools

**Configuration Required:**
- Database configuration per deploy-id
- Optional: Git credentials for upload

**Deploy File:** `./engine-private/deploy/dd.router` (contains: `dd-core,dd-default` or similar list)

**Execution:**
```bash
# Executes backup for all deploy-ids in dd.router file
node bin cron dd-core,dd-default backup --git
```

## Cron Expression Guide

| Expression | Description | Frequency |
|------------|-------------|-----------|
| `* * * * *` | Every minute | 1440/day |
| `*/5 * * * *` | Every 5 minutes | 288/day |
| `0 * * * *` | Every hour | 24/day |
| `0 0 * * *` | Daily at midnight | 1/day |
| `0 1 * * *` | Daily at 1:00 AM | 1/day |
| `0 */6 * * *` | Every 6 hours | 4/day |
| `0 0 * * 0` | Weekly (Sunday) | 1/week |
| `0 0 1 * *` | Monthly | 1/month |

**Format:** `minute hour day month weekday`

## Cluster Management

### Instance Configuration

PM2 instances allow parallel job execution:

```json
{
  "jobs": {
    "backup": {
      "expression": "0 1 * * *",
      "enabled": true,
      "instances": 2  // Run 2 parallel instances
    }
  }
}
```

### Deploy-ID List Mapping

Jobs can target different deploy-id lists from deployment files:

```javascript
// src/server/cron.js
getRelatedDeployIdList(jobId) {
  const deployFilePath = jobId === 'backup' 
    ? './engine-private/deploy/dd.router'  // Contains: "dd-core,dd-default"
    : './engine-private/deploy/dd.cron';   // Contains: "dd-cron"
  
  return fs.readFileSync(deployFilePath, 'utf8').trim();
}
```

**Note:** `dd.router` file contains a comma-separated list of deploy IDs that the backup job will process.

## Workflow

### 1. Initialization

```bash
npm start
```

**Process:**
1. Read cron configuration from deploy-id
2. Delete existing PM2 cron processes
3. Create new PM2 processes with cron schedules
4. PM2 manages execution timing

### 2. Scheduled Execution

```
PM2 Timer → Job Trigger → Callback Execution → Result Logging
```

### 3. Manual Execution

```bash
node bin cron dd-cron dns
```

**Process:**
1. CLI receives command
2. Execute job callback directly
3. Skip PM2 scheduling
4. Output logs to console

## Monitoring

### Log Files

PM2 maintains logs for each process:

```bash
# Real-time logs
pm2 logs dd-cron-dns

# Log files location
~/.pm2/logs/
├── dd-cron-dns-error.log
├── dd-cron-dns-out.log
├── dd-cron-backup-error.log
└── dd-cron-backup-out.log
```

### Process Status

```bash
pm2 list
```

**Output:**
```
┌────┬────────────────┬─────────┬─────────┬──────────┬────────┐
│ id │ name           │ mode    │ status  │ restart  │ uptime │
├────┼────────────────┼─────────┼─────────┼──────────┼────────┤
│ 0  │ dd-cron-dns    │ cron    │ stopped │ 142      │ 0      │
│ 1  │ dd-cron-backup │ cron    │ stopped │ 24       │ 0      │
└────┴────────────────┴─────────┴─────────┴──────────┴────────┘
```

**Note:** Cron jobs show `stopped` status between executions (normal behavior).

## API Reference

### UnderpostCron.API

```javascript
// Initialize PM2 cron jobs
await UnderpostCron.API.initCronJobs({ git: true });

// Update package.json scripts
await UnderpostCron.API.updatePackageScripts('dd-cron,dd-core,dd-default');

// Get deploy-id list for job
const deployIdList = UnderpostCron.API.getRelatedDeployIdList('dns');
// Returns: "dd-cron" or "dd-core,dd-default" depending on job
```

### Job Callbacks

```javascript
// Execute DNS job
await Dns.callback('dd-cron', { git: false });

```

## Extension

### Adding Custom Jobs

1. **Create Job Module** (`src/server/my-job.js`)
   ```javascript
   class MyJob {
     static callback = async function (deployList, options = {}) {
       // Job implementation
     };
   }
   export default MyJob;
   ```

2. **Register Job** (`src/server/cron.js`)
   ```javascript
   static JOB = {
     dns: Dns,
     backup: BackUp,
     myJob: MyJob,  // Add new job
   };
   ```

3. **Configure Job** (`conf.cron.json`)
   ```json
   {
     "jobs": {
       "myJob": {
         "expression": "0 2 * * *",
         "enabled": true,
         "instances": 1
       }
     }
   }
   ```

4. **Initialize**
   ```bash
   node bin cron --init-pm2-cronjobs
   ```
