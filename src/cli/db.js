/**
 * UnderpostDB CLI module
 * @module src/cli/db.js
 * @namespace UnderpostDB
 * @description Manages database operations, backups, and cluster metadata for Kubernetes deployments.
 * Supports MariaDB and MongoDB with import/export capabilities, Git integration, and multi-pod operations.
 */

import { mergeFile, splitFileFactory } from '../server/conf.js';
import { loggerFactory } from '../server/logger.js';
import { shellExec } from '../server/process.js';
import fs from 'fs-extra';
import os from 'os';
import UnderpostDeploy from './deploy.js';
import UnderpostCron from './cron.js';
import { DataBaseProvider } from '../db/DataBaseProvider.js';
import { loadReplicas, pathPortAssignmentFactory } from '../server/conf.js';

const logger = loggerFactory(import.meta);

/**
 * Constants for database operations
 * @constant {number} MAX_BACKUP_RETENTION - Maximum number of backups to retain
 * @memberof UnderpostDB
 */
const MAX_BACKUP_RETENTION = 5;

/**
 * Timeout for kubectl operations in milliseconds
 * @constant {number} KUBECTL_TIMEOUT
 * @memberof UnderpostDB
 */
const KUBECTL_TIMEOUT = 300000; // 5 minutes

/**
 * @typedef {Object} DatabaseOptions
 * @memberof UnderpostDB
 * @property {boolean} [import=false] - Flag to import data from a backup
 * @property {boolean} [export=false] - Flag to export data to a backup
 * @property {string} [podName=''] - Comma-separated list of pod names or patterns
 * @property {string} [nodeName=''] - Comma-separated list of node names for pod filtering
 * @property {string} [ns='default'] - Kubernetes namespace
 * @property {string} [collections=''] - Comma-separated list of collections to include
 * @property {string} [outPath=''] - Output path for backup files
 * @property {boolean} [drop=false] - Flag to drop the database before importing
 * @property {boolean} [preserveUUID=false] - Flag to preserve UUIDs during import
 * @property {boolean} [git=false] - Flag to enable Git integration
 * @property {string} [hosts=''] - Comma-separated list of hosts to include
 * @property {string} [paths=''] - Comma-separated list of paths to include
 * @property {string} [labelSelector=''] - Kubernetes label selector for pods
 * @property {boolean} [allPods=false] - Flag to target all matching pods
 * @property {boolean} [dryRun=false] - Flag to simulate operations without executing
 * @property {boolean} [primaryPod=false] - Flag to automatically detect and use MongoDB primary pod
 * @property {boolean} [stats=false] - Flag to display collection/table statistics
 */

/**
 * @typedef {Object} PodInfo
 * @memberof UnderpostDB
 * @property {string} NAME - Pod name
 * @property {string} NAMESPACE - Pod namespace
 * @property {string} NODE - Node where pod is running
 * @property {string} STATUS - Pod status
 * @property {string} [IP] - Pod IP address
 */

/**
 * @typedef {Object} DatabaseConfig
 * @memberof UnderpostDB
 * @property {string} provider - Database provider (mariadb, mongoose)
 * @property {string} name - Database name
 * @property {string} user - Database user
 * @property {string} password - Database password
 * @property {string} hostFolder - Host folder path
 * @property {string} host - Host identifier
 * @property {string} path - Path identifier
 * @property {number} [currentBackupTimestamp] - Timestamp of current backup
 */

/**
 * @class UnderpostDB
 * @description Manages database operations and backups for Kubernetes-based deployments.
 * Provides comprehensive database management including import/export, multi-pod targeting,
 * Git integration, and cluster metadata management.
 */
class UnderpostDB {
  static API = {
    /**
     * Helper: Validates namespace name
     * @private
     * @param {string} namespace - Namespace to validate
     * @returns {boolean} True if valid
     */
    _validateNamespace(namespace) {
      if (!namespace || typeof namespace !== 'string') return false;
      // Kubernetes namespace naming rules: lowercase alphanumeric, -, max 63 chars
      return /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(namespace) && namespace.length <= 63;
    },

    /**
     * Helper: Validates pod name
     * @private
     * @param {string} podName - Pod name to validate
     * @returns {boolean} True if valid
     */
    _validatePodName(podName) {
      if (!podName || typeof podName !== 'string') return false;
      // Kubernetes pod naming rules: lowercase alphanumeric, -, max 253 chars
      return /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(podName) && podName.length <= 253;
    },

    /**
     * Helper: Gets filtered pods based on criteria
     * @private
     * @param {Object} criteria - Filter criteria
     * @param {string} [criteria.podNames] - Comma-separated pod name patterns
     * @param {string} [criteria.nodeNames] - Comma-separated node names
     * @param {string} [criteria.namespace='default'] - Kubernetes namespace
     * @param {string} [criteria.labelSelector] - Label selector
     * @param {string} [criteria.deployId] - Deployment ID pattern
     * @returns {Array<PodInfo>} Filtered pod list
     */
    _getFilteredPods(criteria = {}) {
      const { podNames, nodeNames, namespace = 'default', labelSelector, deployId } = criteria;

      try {
        // Get all pods using UnderpostDeploy.API.get
        let pods = UnderpostDeploy.API.get(deployId || '', 'pods', namespace);

        // Filter by pod names if specified
        if (podNames) {
          const patterns = podNames.split(',').map((p) => p.trim());
          pods = pods.filter((pod) => {
            return patterns.some((pattern) => {
              // Support wildcards
              const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
              return regex.test(pod.NAME);
            });
          });
        }

        // Filter by node names if specified (only if NODE is not '<none>')
        if (nodeNames) {
          const nodes = nodeNames.split(',').map((n) => n.trim());
          pods = pods.filter((pod) => {
            // Skip filtering if NODE is '<none>' or undefined
            if (!pod.NODE || pod.NODE === '<none>') {
              return true;
            }
            return nodes.includes(pod.NODE);
          });
        }

        // Filter by label selector if specified
        if (labelSelector) {
          // Note: UnderpostDeploy.API.get doesn't support label selectors directly
          // This would require a separate kubectl command
          logger.warn('Label selector filtering requires additional implementation');
        }

        logger.info(`Found ${pods.length} pod(s) matching criteria`, { criteria, podNames: pods.map((p) => p.NAME) });
        return pods;
      } catch (error) {
        logger.error('Error filtering pods', { error: error.message, criteria });
        return [];
      }
    },

    /**
     * Helper: Gets MongoDB primary pod name
     * @private
     * @param {string} namespace - Kubernetes namespace
     * @param {Array<PodInfo>} pods - List of MongoDB pods
     * @returns {string|null} Primary pod name or null if not found
     */
    _getMongoPrimaryPod(namespace, pods) {
      try {
        if (!pods || pods.length === 0) {
          logger.warn('No MongoDB pods available to check for primary');
          return null;
        }

        // Try the first pod to get replica set status
        const firstPod = pods[0].NAME;
        logger.info('Checking for MongoDB primary pod', { namespace, checkingPod: firstPod });

        const command = `sudo kubectl exec -n ${namespace} -i ${firstPod} -- mongosh --quiet --eval 'rs.status().members.filter(m => m.stateStr=="PRIMARY").map(m=>m.name)'`;
        const output = shellExec(command, { stdout: true, silent: true });

        if (!output || output.trim() === '') {
          logger.warn('No primary pod found in replica set');
          return null;
        }

        // Parse the output to get the primary pod name
        // Output format: [ 'mongodb-0:27017' ] or [ 'mongodb-1.mongodb-service:27017' ] or similar
        const match = output.match(/['"]([^'"]+)['"]/);
        if (match && match[1]) {
          let primaryName = match[1].split(':')[0]; // Extract pod name without port
          // Remove service suffix if present (e.g., "mongodb-1.mongodb-service" -> "mongodb-1")
          primaryName = primaryName.split('.')[0];
          logger.info('Found MongoDB primary pod', { primaryPod: primaryName });
          return primaryName;
        }

        logger.warn('Could not parse primary pod from replica set status', { output });
        return null;
      } catch (error) {
        logger.error('Failed to get MongoDB primary pod', { error: error.message });
        return null;
      }
    },

    /**
     * Helper: Executes kubectl command with error handling
     * @private
     * @param {string} command - kubectl command to execute
     * @param {Object} options - Execution options
     * @param {boolean} [options.dryRun=false] - Dry run mode
     * @param {string} [options.context=''] - Command context for logging
     * @returns {string|null} Command output or null on error
     */
    _executeKubectl(command, options = {}) {
      const { dryRun = false, context = '' } = options;

      if (dryRun) {
        logger.info(`[DRY RUN] Would execute: ${command}`, { context });
        return null;
      }

      try {
        logger.info(`Executing kubectl command`, { command, context });
        return shellExec(command, { stdout: true });
      } catch (error) {
        logger.error(`kubectl command failed`, { command, error: error.message, context });
        throw error;
      }
    },

    /**
     * Helper: Copies file to pod
     * @private
     * @param {Object} params - Copy parameters
     * @param {string} params.sourcePath - Source file path
     * @param {string} params.podName - Target pod name
     * @param {string} params.namespace - Pod namespace
     * @param {string} params.destPath - Destination path in pod
     * @param {boolean} [params.dryRun=false] - Dry run mode
     * @returns {boolean} Success status
     */
    _copyToPod({ sourcePath, podName, namespace, destPath, dryRun = false }) {
      try {
        const command = `sudo kubectl cp ${sourcePath} ${namespace}/${podName}:${destPath}`;
        UnderpostDB.API._executeKubectl(command, { dryRun, context: `copy to pod ${podName}` });
        return true;
      } catch (error) {
        logger.error('Failed to copy file to pod', { sourcePath, podName, destPath, error: error.message });
        return false;
      }
    },

    /**
     * Helper: Copies file from pod
     * @private
     * @param {Object} params - Copy parameters
     * @param {string} params.podName - Source pod name
     * @param {string} params.namespace - Pod namespace
     * @param {string} params.sourcePath - Source path in pod
     * @param {string} params.destPath - Destination file path
     * @param {boolean} [params.dryRun=false] - Dry run mode
     * @returns {boolean} Success status
     */
    _copyFromPod({ podName, namespace, sourcePath, destPath, dryRun = false }) {
      try {
        const command = `sudo kubectl cp ${namespace}/${podName}:${sourcePath} ${destPath}`;
        UnderpostDB.API._executeKubectl(command, { dryRun, context: `copy from pod ${podName}` });
        return true;
      } catch (error) {
        logger.error('Failed to copy file from pod', { podName, sourcePath, destPath, error: error.message });
        return false;
      }
    },

    /**
     * Helper: Executes command in pod
     * @private
     * @param {Object} params - Execution parameters
     * @param {string} params.podName - Pod name
     * @param {string} params.namespace - Pod namespace
     * @param {string} params.command - Command to execute
     * @param {boolean} [params.dryRun=false] - Dry run mode
     * @returns {string|null} Command output or null
     */
    _execInPod({ podName, namespace, command, dryRun = false }) {
      try {
        const kubectlCmd = `sudo kubectl exec -n ${namespace} -i ${podName} -- sh -c "${command}"`;
        return UnderpostDB.API._executeKubectl(kubectlCmd, { dryRun, context: `exec in pod ${podName}` });
      } catch (error) {
        logger.error('Failed to execute command in pod', { podName, command, error: error.message });
        throw error;
      }
    },

    /**
     * Helper: Manages Git repository for backups
     * @private
     * @param {Object} params - Git parameters
     * @param {string} params.repoName - Repository name
     * @param {string} params.operation - Operation (clone, pull, commit, push)
     * @param {string} [params.message=''] - Commit message
     * @returns {boolean} Success status
     */
    _manageGitRepo({ repoName, operation, message = '' }) {
      try {
        const username = process.env.GITHUB_USERNAME;
        if (!username) {
          logger.error('GITHUB_USERNAME environment variable not set');
          return false;
        }

        const repoPath = `../${repoName}`;

        switch (operation) {
          case 'clone':
            if (!fs.existsSync(repoPath)) {
              shellExec(`cd .. && underpost clone ${username}/${repoName}`);
              logger.info(`Cloned repository: ${repoName}`);
            }
            break;

          case 'pull':
            if (fs.existsSync(repoPath)) {
              shellExec(`cd ${repoPath} && git checkout . && git clean -f -d`);
              shellExec(`cd ${repoPath} && underpost pull . ${username}/${repoName}`);
              logger.info(`Pulled repository: ${repoName}`);
            }
            break;

          case 'commit':
            if (fs.existsSync(repoPath)) {
              shellExec(`cd ${repoPath} && git add .`);
              shellExec(`underpost cmt ${repoPath} backup '' '${message}'`);
              logger.info(`Committed to repository: ${repoName}`, { message });
            }
            break;

          case 'push':
            if (fs.existsSync(repoPath)) {
              shellExec(`cd ${repoPath} && underpost push . ${username}/${repoName}`, { disableLog: true });
              logger.info(`Pushed repository: ${repoName}`);
            }
            break;

          default:
            logger.warn(`Unknown git operation: ${operation}`);
            return false;
        }

        return true;
      } catch (error) {
        logger.error(`Git operation failed`, { repoName, operation, error: error.message });
        return false;
      }
    },

    /**
     * Helper: Manages backup timestamps and cleanup
     * @private
     * @param {string} backupPath - Backup directory path
     * @param {number} newTimestamp - New backup timestamp
     * @param {boolean} shouldCleanup - Whether to cleanup old backups
     * @returns {Object} Backup info with current and removed timestamps
     */
    _manageBackupTimestamps(backupPath, newTimestamp, shouldCleanup) {
      try {
        if (!fs.existsSync(backupPath)) {
          fs.mkdirSync(backupPath, { recursive: true });
        }

        // Delete empty folders
        shellExec(`cd ${backupPath} && find . -type d -empty -delete`);

        const times = fs.readdirSync(backupPath);
        const validTimes = times.map((t) => parseInt(t)).filter((t) => !isNaN(t));

        const currentBackupTimestamp = validTimes.length > 0 ? Math.max(...validTimes) : null;
        const removeBackupTimestamp = validTimes.length > 0 ? Math.min(...validTimes) : null;

        // Cleanup old backups if we have too many
        if (shouldCleanup && validTimes.length >= MAX_BACKUP_RETENTION && removeBackupTimestamp) {
          const removeDir = `${backupPath}/${removeBackupTimestamp}`;
          logger.info('Removing old backup', { path: removeDir });
          fs.removeSync(removeDir);
        }

        // Create new backup directory
        if (shouldCleanup) {
          const newBackupDir = `${backupPath}/${newTimestamp}`;
          logger.info('Creating new backup directory', { path: newBackupDir });
          fs.mkdirSync(newBackupDir, { recursive: true });
        }

        return {
          current: currentBackupTimestamp,
          removed: removeBackupTimestamp,
          count: validTimes.length,
        };
      } catch (error) {
        logger.error('Error managing backup timestamps', { backupPath, error: error.message });
        return { current: null, removed: null, count: 0 };
      }
    },

    /**
     * Helper: Performs MariaDB import operation
     * @private
     * @param {Object} params - Import parameters
     * @param {PodInfo} params.pod - Target pod
     * @param {string} params.namespace - Namespace
     * @param {string} params.dbName - Database name
     * @param {string} params.user - Database user
     * @param {string} params.password - Database password
     * @param {string} params.sqlPath - SQL file path
     * @param {boolean} [params.dryRun=false] - Dry run mode
     * @returns {boolean} Success status
     */
    _importMariaDB({ pod, namespace, dbName, user, password, sqlPath, dryRun = false }) {
      try {
        const podName = pod.NAME;
        const containerSqlPath = `/${dbName}.sql`;

        logger.info('Importing MariaDB database', { podName, dbName });

        // Remove existing SQL file in container
        UnderpostDB.API._execInPod({
          podName,
          namespace,
          command: `rm -rf ${containerSqlPath}`,
          dryRun,
        });

        // Copy SQL file to pod
        if (
          !UnderpostDB.API._copyToPod({
            sourcePath: sqlPath,
            podName,
            namespace,
            destPath: containerSqlPath,
            dryRun,
          })
        ) {
          return false;
        }

        // Create database if it doesn't exist
        UnderpostDB.API._executeKubectl(
          `kubectl exec -n ${namespace} -i ${podName} -- mariadb -p${password} -e 'CREATE DATABASE IF NOT EXISTS ${dbName};'`,
          { dryRun, context: `create database ${dbName}` },
        );

        // Import SQL file
        const importCmd = `mariadb -u ${user} -p${password} ${dbName} < ${containerSqlPath}`;
        UnderpostDB.API._execInPod({ podName, namespace, command: importCmd, dryRun });

        logger.info('Successfully imported MariaDB database', { podName, dbName });
        return true;
      } catch (error) {
        logger.error('MariaDB import failed', { podName: pod.NAME, dbName, error: error.message });
        return false;
      }
    },

    /**
     * Helper: Performs MariaDB export operation
     * @private
     * @param {Object} params - Export parameters
     * @param {PodInfo} params.pod - Source pod
     * @param {string} params.namespace - Namespace
     * @param {string} params.dbName - Database name
     * @param {string} params.user - Database user
     * @param {string} params.password - Database password
     * @param {string} params.outputPath - Output file path
     * @param {boolean} [params.dryRun=false] - Dry run mode
     * @returns {boolean} Success status
     */
    async _exportMariaDB({ pod, namespace, dbName, user, password, outputPath, dryRun = false }) {
      try {
        const podName = pod.NAME;
        const containerSqlPath = `/home/${dbName}.sql`;

        logger.info('Exporting MariaDB database', { podName, dbName });

        // Remove existing SQL file in container
        UnderpostDB.API._execInPod({
          podName,
          namespace,
          command: `rm -rf ${containerSqlPath}`,
          dryRun,
        });

        // Dump database
        const dumpCmd = `mariadb-dump --user=${user} --password=${password} --lock-tables ${dbName} > ${containerSqlPath}`;
        UnderpostDB.API._execInPod({ podName, namespace, command: dumpCmd, dryRun });

        // Copy SQL file from pod
        if (
          !UnderpostDB.API._copyFromPod({
            podName,
            namespace,
            sourcePath: containerSqlPath,
            destPath: outputPath,
            dryRun,
          })
        ) {
          return false;
        }

        // Split file if it exists
        if (!dryRun && fs.existsSync(outputPath)) {
          await splitFileFactory(dbName, outputPath);
        }

        logger.info('Successfully exported MariaDB database', { podName, dbName, outputPath });
        return true;
      } catch (error) {
        logger.error('MariaDB export failed', { podName: pod.NAME, dbName, error: error.message });
        return false;
      }
    },

    /**
     * Helper: Performs MongoDB import operation
     * @private
     * @param {Object} params - Import parameters
     * @param {PodInfo} params.pod - Target pod
     * @param {string} params.namespace - Namespace
     * @param {string} params.dbName - Database name
     * @param {string} params.bsonPath - BSON directory path
     * @param {boolean} params.drop - Whether to drop existing database
     * @param {boolean} params.preserveUUID - Whether to preserve UUIDs
     * @param {boolean} [params.dryRun=false] - Dry run mode
     * @returns {boolean} Success status
     */
    _importMongoDB({ pod, namespace, dbName, bsonPath, drop, preserveUUID, dryRun = false }) {
      try {
        const podName = pod.NAME;
        const containerBsonPath = `/${dbName}`;

        logger.info('Importing MongoDB database', { podName, dbName });

        // Remove existing BSON directory in container
        UnderpostDB.API._execInPod({
          podName,
          namespace,
          command: `rm -rf ${containerBsonPath}`,
          dryRun,
        });

        // Copy BSON directory to pod
        if (
          !UnderpostDB.API._copyToPod({
            sourcePath: bsonPath,
            podName,
            namespace,
            destPath: containerBsonPath,
            dryRun,
          })
        ) {
          return false;
        }

        // Restore database
        const restoreCmd = `mongorestore -d ${dbName} ${containerBsonPath}${drop ? ' --drop' : ''}${
          preserveUUID ? ' --preserveUUID' : ''
        }`;
        UnderpostDB.API._execInPod({ podName, namespace, command: restoreCmd, dryRun });

        logger.info('Successfully imported MongoDB database', { podName, dbName });
        return true;
      } catch (error) {
        logger.error('MongoDB import failed', { podName: pod.NAME, dbName, error: error.message });
        return false;
      }
    },

    /**
     * Helper: Performs MongoDB export operation
     * @private
     * @param {Object} params - Export parameters
     * @param {PodInfo} params.pod - Source pod
     * @param {string} params.namespace - Namespace
     * @param {string} params.dbName - Database name
     * @param {string} params.outputPath - Output directory path
     * @param {string} [params.collections=''] - Comma-separated collection list
     * @param {boolean} [params.dryRun=false] - Dry run mode
     * @returns {boolean} Success status
     */
    _exportMongoDB({ pod, namespace, dbName, outputPath, collections = '', dryRun = false }) {
      try {
        const podName = pod.NAME;
        const containerBsonPath = `/${dbName}`;

        logger.info('Exporting MongoDB database', { podName, dbName, collections });

        // Remove existing BSON directory in container
        UnderpostDB.API._execInPod({
          podName,
          namespace,
          command: `rm -rf ${containerBsonPath}`,
          dryRun,
        });

        // Dump database or specific collections
        if (collections) {
          const collectionList = collections.split(',').map((c) => c.trim());
          for (const collection of collectionList) {
            const dumpCmd = `mongodump -d ${dbName} --collection ${collection} -o /`;
            UnderpostDB.API._execInPod({ podName, namespace, command: dumpCmd, dryRun });
          }
        } else {
          const dumpCmd = `mongodump -d ${dbName} -o /`;
          UnderpostDB.API._execInPod({ podName, namespace, command: dumpCmd, dryRun });
        }

        // Copy BSON directory from pod
        if (
          !UnderpostDB.API._copyFromPod({
            podName,
            namespace,
            sourcePath: containerBsonPath,
            destPath: outputPath,
            dryRun,
          })
        ) {
          return false;
        }

        logger.info('Successfully exported MongoDB database', { podName, dbName, outputPath });
        return true;
      } catch (error) {
        logger.error('MongoDB export failed', { podName: pod.NAME, dbName, error: error.message });
        return false;
      }
    },

    /**
     * Helper: Gets MongoDB collection statistics
     * @private
     * @param {Object} params - Parameters
     * @param {string} params.podName - Pod name
     * @param {string} params.namespace - Namespace
     * @param {string} params.dbName - Database name
     * @returns {Object|null} Collection statistics or null on error
     */
    _getMongoStats({ podName, namespace, dbName }) {
      try {
        logger.info('Getting MongoDB collection statistics', { podName, dbName });

        // Use db.getSiblingDB() instead of 'use' command
        const script = `db.getSiblingDB('${dbName}').getCollectionNames().map(function(c) { return { collection: c, count: db.getSiblingDB('${dbName}')[c].countDocuments() }; })`;

        // Execute the script
        const command = `sudo kubectl exec -n ${namespace} -i ${podName} -- mongosh --quiet --eval "${script}"`;
        const output = shellExec(command, { stdout: true, silent: true });

        if (!output || output.trim() === '') {
          logger.warn('No collections found or empty output');
          return null;
        }

        // Clean the output: remove newlines, handle EJSON format, replace single quotes with double quotes
        let cleanedOutput = output
          .trim()
          .replace(/\n/g, '')
          .replace(/\s+/g, ' ')
          .replace(/NumberLong\("(\d+)"\)/g, '$1')
          .replace(/NumberLong\((\d+)\)/g, '$1')
          .replace(/NumberInt\("(\d+)"\)/g, '$1')
          .replace(/NumberInt\((\d+)\)/g, '$1')
          .replace(/ISODate\("([^"]+)"\)/g, '"$1"')
          .replace(/'/g, '"')
          .replace(/(\w+):/g, '"$1":');

        try {
          const stats = JSON.parse(cleanedOutput);
          logger.info('MongoDB statistics retrieved', { dbName, collections: stats.length });
          return stats;
        } catch (parseError) {
          logger.error('Failed to parse MongoDB output', {
            podName,
            dbName,
            error: parseError.message,
            rawOutput: output.substring(0, 200),
            cleanedOutput: cleanedOutput.substring(0, 200),
          });
          return null;
        }
      } catch (error) {
        logger.error('Failed to get MongoDB statistics', { podName, dbName, error: error.message });
        return null;
      }
    },

    /**
     * Helper: Gets MariaDB table statistics
     * @private
     * @param {Object} params - Parameters
     * @param {string} params.podName - Pod name
     * @param {string} params.namespace - Namespace
     * @param {string} params.dbName - Database name
     * @param {string} params.user - Database user
     * @param {string} params.password - Database password
     * @returns {Object|null} Table statistics or null on error
     */
    _getMariaDBStats({ podName, namespace, dbName, user, password }) {
      try {
        logger.info('Getting MariaDB table statistics', { podName, dbName });

        const command = `sudo kubectl exec -n ${namespace} -i ${podName} -- mariadb -u ${user} -p${password} ${dbName} -e "SELECT TABLE_NAME as 'table', TABLE_ROWS as 'count' FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${dbName}' ORDER BY TABLE_NAME;" --skip-column-names --batch`;
        const output = shellExec(command, { stdout: true, silent: true });

        if (!output || output.trim() === '') {
          logger.warn('No tables found or empty output');
          return null;
        }

        // Parse the output (tab-separated values)
        const lines = output.trim().split('\n');
        const stats = lines.map((line) => {
          const [table, count] = line.split('\t');
          return { table, count: parseInt(count) || 0 };
        });

        logger.info('MariaDB statistics retrieved', { dbName, tables: stats.length });
        return stats;
      } catch (error) {
        logger.error('Failed to get MariaDB statistics', { podName, dbName, error: error.message });
        return null;
      }
    },

    /**
     * Helper: Displays database statistics in table format
     * @private
     * @param {Object} params - Parameters
     * @param {string} params.provider - Database provider
     * @param {string} params.dbName - Database name
     * @param {Array<Object>} params.stats - Statistics array
     */
    _displayStats({ provider, dbName, stats }) {
      if (!stats || stats.length === 0) {
        logger.warn('No statistics to display', { provider, dbName });
        return;
      }

      const title = provider === 'mongoose' ? 'Collections' : 'Tables';
      const itemKey = provider === 'mongoose' ? 'collection' : 'table';

      console.log('\n' + '='.repeat(70));
      console.log(`DATABASE: ${dbName} (${provider.toUpperCase()})`);
      console.log('='.repeat(70));
      console.log(`${title.padEnd(50)} ${'Documents/Rows'.padStart(18)}`);
      console.log('-'.repeat(70));

      let totalCount = 0;
      stats.forEach((item) => {
        const name = item[itemKey] || 'Unknown';
        const count = item.count || 0;
        totalCount += count;
        console.log(`${name.padEnd(50)} ${count.toString().padStart(18)}`);
      });

      console.log('-'.repeat(70));
      console.log(`${'TOTAL'.padEnd(50)} ${totalCount.toString().padStart(18)}`);
      console.log('='.repeat(70) + '\n');
    },

    /**
     * Main callback: Initiates database backup workflow
     * @method callback
     * @description Orchestrates the backup process for multiple deployments, handling
     * database connections, backup storage, and optional Git integration for version control.
     * Supports targeting multiple specific pods, nodes, and namespaces with advanced filtering.
     * @param {string} [deployList='default'] - Comma-separated list of deployment IDs
     * @param {DatabaseOptions} [options] - Database operation options
     * @returns {Promise<void>}
     * @memberof UnderpostDB
     * @example
     * // Export database from specific pods
     * await UnderpostDB.API.callback('dd-myapp', {
     *   export: true,
     *   podName: 'mariadb-statefulset-0,mariadb-statefulset-1',
     *   ns: 'production'
     * });
     *
     * @example
     * // Import database to all matching pods on specific nodes
     * await UnderpostDB.API.callback('dd-myapp', {
     *   import: true,
     *   nodeName: 'node-1,node-2',
     *   allPods: true,
     *   ns: 'staging'
     * });
     *
     * @example
     * // Import to MongoDB primary pod only
     * await UnderpostDB.API.callback('dd-myapp', {
     *   import: true,
     *   primaryPod: true,
     *   ns: 'production'
     * });
     */
    async callback(
      deployList = 'default',
      options = {
        import: false,
        export: false,
        podName: '',
        nodeName: '',
        ns: 'default',
        collections: '',
        outPath: '',
        drop: false,
        preserveUUID: false,
        git: false,
        hosts: '',
        paths: '',
        labelSelector: '',
        allPods: false,
        dryRun: false,
        primaryPod: false,
        stats: false,
      },
    ) {
      const newBackupTimestamp = new Date().getTime();
      const namespace = options.ns && typeof options.ns === 'string' ? options.ns : 'default';

      // Validate namespace
      if (!UnderpostDB.API._validateNamespace(namespace)) {
        logger.error('Invalid namespace format', { namespace });
        throw new Error(`Invalid namespace: ${namespace}`);
      }

      logger.info('Starting database operation', {
        deployList,
        namespace,
        import: options.import,
        export: options.export,
        dryRun: options.dryRun,
      });

      for (const _deployId of deployList.split(',')) {
        const deployId = _deployId.trim();
        if (!deployId) continue;

        logger.info('Processing deployment', { deployId });

        /** @type {Object.<string, Object.<string, DatabaseConfig>>} */
        const dbs = {};
        const repoName = `engine-${deployId.split('dd-')[1]}-cron-backups`;

        // Load server configuration
        const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
        if (!fs.existsSync(confServerPath)) {
          logger.error('Configuration file not found', { path: confServerPath });
          continue;
        }

        const confServer = JSON.parse(fs.readFileSync(confServerPath, 'utf8'));

        // Build database configuration map
        for (const host of Object.keys(confServer)) {
          for (const path of Object.keys(confServer[host])) {
            const { db } = confServer[host][path];
            if (db) {
              const { provider, name, user, password } = db;
              if (!dbs[provider]) dbs[provider] = {};

              if (!(name in dbs[provider])) {
                dbs[provider][name] = {
                  user,
                  password,
                  hostFolder: host + path.replaceAll('/', '-'),
                  host,
                  path,
                };
              }
            }
          }
        }

        // Handle Git operations
        if (options.git === true) {
          UnderpostDB.API._manageGitRepo({ repoName, operation: 'clone' });
          UnderpostDB.API._manageGitRepo({ repoName, operation: 'pull' });
        }

        // Process each database provider
        for (const provider of Object.keys(dbs)) {
          for (const dbName of Object.keys(dbs[provider])) {
            const { hostFolder, user, password, host, path } = dbs[provider][dbName];

            // Filter by hosts and paths if specified
            if (
              (options.hosts &&
                !options.hosts
                  .split(',')
                  .map((h) => h.trim())
                  .includes(host)) ||
              (options.paths &&
                !options.paths
                  .split(',')
                  .map((p) => p.trim())
                  .includes(path))
            ) {
              logger.info('Skipping database due to host/path filter', { dbName, host, path });
              continue;
            }

            if (!hostFolder) {
              logger.warn('No hostFolder defined for database', { dbName, provider });
              continue;
            }

            logger.info('Processing database', { hostFolder, provider, dbName });

            const backUpPath = `../${repoName}/${hostFolder}`;
            const backupInfo = UnderpostDB.API._manageBackupTimestamps(
              backUpPath,
              newBackupTimestamp,
              options.export === true,
            );

            dbs[provider][dbName].currentBackupTimestamp = backupInfo.current;

            const currentTimestamp = backupInfo.current || newBackupTimestamp;
            const sqlContainerPath = `/home/${dbName}.sql`;
            const fromPartsPath = `../${repoName}/${hostFolder}/${currentTimestamp}/${dbName}-parths.json`;
            const toSqlPath = `../${repoName}/${hostFolder}/${currentTimestamp}/${dbName}.sql`;
            const toNewSqlPath = `../${repoName}/${hostFolder}/${newBackupTimestamp}/${dbName}.sql`;
            const toBsonPath = `../${repoName}/${hostFolder}/${currentTimestamp}/${dbName}`;
            const toNewBsonPath = `../${repoName}/${hostFolder}/${newBackupTimestamp}/${dbName}`;

            // Merge split SQL files if needed for import
            if (options.import === true && fs.existsSync(fromPartsPath) && !fs.existsSync(toSqlPath)) {
              const names = JSON.parse(fs.readFileSync(fromPartsPath, 'utf8')).map((_path) => {
                return `../${repoName}/${hostFolder}/${currentTimestamp}/${_path.split('/').pop()}`;
              });
              logger.info('Merging backup parts', { fromPartsPath, toSqlPath, parts: names.length });
              await mergeFile(names, toSqlPath);
            }

            // Get target pods based on provider and options
            let targetPods = [];
            const podCriteria = {
              podNames: options.podName,
              nodeNames: options.nodeName,
              namespace,
              labelSelector: options.labelSelector,
              deployId: provider === 'mariadb' ? 'mariadb' : 'mongo',
            };

            targetPods = UnderpostDB.API._getFilteredPods(podCriteria);

            // Fallback to default if no custom pods specified
            if (targetPods.length === 0 && !options.podName && !options.nodeName) {
              const defaultPods = UnderpostDeploy.API.get(
                provider === 'mariadb' ? 'mariadb' : 'mongo',
                'pods',
                namespace,
              );
              console.log('defaultPods', defaultPods);
              targetPods = defaultPods;
            }

            if (targetPods.length === 0) {
              logger.warn('No pods found matching criteria', { provider, criteria: podCriteria });
              continue;
            }

            // Handle primary pod detection for MongoDB
            let podsToProcess = [];
            if (provider === 'mongoose' && !options.podName && !options.allPods) {
              // When no pod name is specified for MongoDB, always use primary pod
              const primaryPodName = UnderpostDB.API._getMongoPrimaryPod(namespace, targetPods);
              if (primaryPodName) {
                const primaryPod = targetPods.find((p) => p.NAME === primaryPodName);
                if (primaryPod) {
                  podsToProcess = [primaryPod];
                  logger.info('Using MongoDB primary pod', { primaryPod: primaryPodName });
                } else {
                  logger.warn('Primary pod not in filtered list, using first pod', { primaryPodName });
                  podsToProcess = [targetPods[0]];
                }
              } else {
                logger.warn('Could not detect primary pod, using first pod');
                podsToProcess = [targetPods[0]];
              }
            } else if (options.primaryPod === true && provider === 'mongoose') {
              // Explicit primaryPod flag
              const primaryPodName = UnderpostDB.API._getMongoPrimaryPod(namespace, targetPods);
              if (primaryPodName) {
                const primaryPod = targetPods.find((p) => p.NAME === primaryPodName);
                if (primaryPod) {
                  podsToProcess = [primaryPod];
                  logger.info('Using MongoDB primary pod', { primaryPod: primaryPodName });
                } else {
                  logger.warn('Primary pod not in filtered list, using first pod', { primaryPodName });
                  podsToProcess = [targetPods[0]];
                }
              } else {
                logger.warn('Could not detect primary pod, using first pod');
                podsToProcess = [targetPods[0]];
              }
            } else {
              // Limit to first pod unless allPods is true
              podsToProcess = options.allPods === true ? targetPods : [targetPods[0]];
            }

            logger.info(`Processing ${podsToProcess.length} pod(s) for ${provider}`, {
              dbName,
              pods: podsToProcess.map((p) => p.NAME),
            });

            // Process each pod
            for (const pod of podsToProcess) {
              logger.info('Processing pod', { podName: pod.NAME, node: pod.NODE, status: pod.STATUS });

              switch (provider) {
                case 'mariadb': {
                  if (options.stats === true) {
                    const stats = UnderpostDB.API._getMariaDBStats({
                      podName: pod.NAME,
                      namespace,
                      dbName,
                      user,
                      password,
                    });
                    if (stats) {
                      UnderpostDB.API._displayStats({ provider, dbName, stats });
                    }
                  }

                  if (options.import === true) {
                    UnderpostDB.API._importMariaDB({
                      pod,
                      namespace,
                      dbName,
                      user,
                      password,
                      sqlPath: toSqlPath,
                      dryRun: options.dryRun,
                    });
                  }

                  if (options.export === true) {
                    const outputPath = options.outPath || toNewSqlPath;
                    await UnderpostDB.API._exportMariaDB({
                      pod,
                      namespace,
                      dbName,
                      user,
                      password,
                      outputPath,
                      dryRun: options.dryRun,
                    });
                  }
                  break;
                }

                case 'mongoose': {
                  if (options.stats === true) {
                    const stats = UnderpostDB.API._getMongoStats({
                      podName: pod.NAME,
                      namespace,
                      dbName,
                    });
                    if (stats) {
                      UnderpostDB.API._displayStats({ provider, dbName, stats });
                    }
                  }

                  if (options.import === true) {
                    const bsonPath = options.outPath || toBsonPath;
                    UnderpostDB.API._importMongoDB({
                      pod,
                      namespace,
                      dbName,
                      bsonPath,
                      drop: options.drop,
                      preserveUUID: options.preserveUUID,
                      dryRun: options.dryRun,
                    });
                  }

                  if (options.export === true) {
                    const outputPath = options.outPath || toNewBsonPath;
                    UnderpostDB.API._exportMongoDB({
                      pod,
                      namespace,
                      dbName,
                      outputPath,
                      collections: options.collections,
                      dryRun: options.dryRun,
                    });
                  }
                  break;
                }

                default:
                  logger.warn('Unsupported database provider', { provider });
                  break;
              }
            }
          }
        }

        // Commit and push to Git if enabled
        if (options.export === true && options.git === true) {
          const commitMessage = `${new Date(newBackupTimestamp).toLocaleDateString()} ${new Date(
            newBackupTimestamp,
          ).toLocaleTimeString()}`;
          UnderpostDB.API._manageGitRepo({ repoName, operation: 'commit', message: commitMessage });
          UnderpostDB.API._manageGitRepo({ repoName, operation: 'push' });
        }
      }

      logger.info('Database operation completed successfully');
    },

    /**
     * Creates cluster metadata for the specified deployment
     * @method clusterMetadataFactory
     * @description Loads database configuration and initializes cluster metadata including
     * instances and cron jobs. This method populates the database with deployment information.
     * @param {string} [deployId=process.env.DEFAULT_DEPLOY_ID] - The deployment ID
     * @param {string} [host=process.env.DEFAULT_DEPLOY_HOST] - The host identifier
     * @param {string} [path=process.env.DEFAULT_DEPLOY_PATH] - The path identifier
     * @returns {Promise<void>}
     * @memberof UnderpostDB
     * @throws {Error} If database configuration is invalid or connection fails
     */
    async clusterMetadataFactory(
      deployId = process.env.DEFAULT_DEPLOY_ID,
      host = process.env.DEFAULT_DEPLOY_HOST,
      path = process.env.DEFAULT_DEPLOY_PATH,
    ) {
      deployId = deployId ?? process.env.DEFAULT_DEPLOY_ID;
      host = host ?? process.env.DEFAULT_DEPLOY_HOST;
      path = path ?? process.env.DEFAULT_DEPLOY_PATH;

      logger.info('Creating cluster metadata', { deployId, host, path });

      const env = 'production';
      const deployListPath = './engine-private/deploy/dd.router';

      if (!fs.existsSync(deployListPath)) {
        logger.error('Deploy router file not found', { path: deployListPath });
        throw new Error(`Deploy router file not found: ${deployListPath}`);
      }

      const deployList = fs.readFileSync(deployListPath, 'utf8').split(',');

      const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
      if (!fs.existsSync(confServerPath)) {
        logger.error('Server configuration not found', { path: confServerPath });
        throw new Error(`Server configuration not found: ${confServerPath}`);
      }

      const { db } = JSON.parse(fs.readFileSync(confServerPath, 'utf8'))[host][path];

      try {
        await DataBaseProvider.load({ apis: ['instance', 'cron'], host, path, db });

        /** @type {import('../api/instance/instance.model.js').InstanceModel} */
        const Instance = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Instance;

        await Instance.deleteMany();
        logger.info('Cleared existing instance metadata');

        for (const _deployId of deployList) {
          const deployId = _deployId.trim();
          if (!deployId) continue;

          logger.info('Processing deployment for metadata', { deployId });

          const confServerPath = `./engine-private/conf/${deployId}/conf.server.json`;
          if (!fs.existsSync(confServerPath)) {
            logger.warn('Configuration not found for deployment', { deployId, path: confServerPath });
            continue;
          }

          const confServer = loadReplicas(deployId, JSON.parse(fs.readFileSync(confServerPath, 'utf8')));
          const router = await UnderpostDeploy.API.routerFactory(deployId, env);
          const pathPortAssignmentData = await pathPortAssignmentFactory(deployId, router, confServer);

          for (const host of Object.keys(confServer)) {
            for (const { path, port } of pathPortAssignmentData[host]) {
              if (!confServer[host][path]) continue;

              const { client, runtime, apis, peer } = confServer[host][path];

              // Save main instance
              {
                const body = {
                  deployId,
                  host,
                  path,
                  port,
                  client,
                  runtime,
                  apis,
                };

                logger.info('Saving instance metadata', body);
                await new Instance(body).save();
              }

              // Save peer instance if exists
              if (peer) {
                const body = {
                  deployId,
                  host,
                  path: path === '/' ? '/peer' : `${path}/peer`,
                  port: port + 1,
                  runtime: 'nodejs',
                };

                logger.info('Saving peer instance metadata', body);
                await new Instance(body).save();
              }
            }
          }

          // Process additional instances
          const confInstancesPath = `./engine-private/conf/${deployId}/conf.instances.json`;
          if (fs.existsSync(confInstancesPath)) {
            const confInstances = JSON.parse(fs.readFileSync(confInstancesPath, 'utf8'));
            for (const instance of confInstances) {
              const { id, host, path, fromPort, metadata } = instance;
              const { runtime } = metadata;
              const body = {
                deployId,
                host,
                path,
                port: fromPort,
                client: id,
                runtime,
              };
              logger.info('Saving additional instance metadata', body);
              await new Instance(body).save();
            }
          }
        }
      } catch (error) {
        logger.error('Failed to create instance metadata', { error: error.message, stack: error.stack });
        throw error;
      }

      try {
        const cronDeployPath = './engine-private/deploy/dd.cron';
        if (!fs.existsSync(cronDeployPath)) {
          logger.warn('Cron deploy file not found', { path: cronDeployPath });
          return;
        }

        const cronDeployId = fs.readFileSync(cronDeployPath, 'utf8').trim();
        const confCronPath = `./engine-private/conf/${cronDeployId}/conf.cron.json`;

        if (!fs.existsSync(confCronPath)) {
          logger.warn('Cron configuration not found', { path: confCronPath });
          return;
        }

        const confCron = JSON.parse(fs.readFileSync(confCronPath, 'utf8'));

        await DataBaseProvider.load({ apis: ['cron'], host, path, db });

        /** @type {import('../api/cron/cron.model.js').CronModel} */
        const Cron = DataBaseProvider.instance[`${host}${path}`].mongoose.models.Cron;

        await Cron.deleteMany();
        logger.info('Cleared existing cron metadata');

        for (const jobId of Object.keys(confCron.jobs)) {
          const body = {
            jobId,
            deployId: UnderpostCron.API.getRelatedDeployId(jobId),
            expression: confCron.jobs[jobId].expression,
            enabled: confCron.jobs[jobId].enabled,
          };
          logger.info('Saving cron metadata', body);
          await new Cron(body).save();
        }
      } catch (error) {
        logger.error('Failed to create cron metadata', { error: error.message, stack: error.stack });
      }

      await DataBaseProvider.instance[`${host}${path}`].mongoose.close();
      logger.info('Cluster metadata creation completed');
    },

    /**
     * Handles backup of cluster metadata
     * @method clusterMetadataBackupCallback
     * @description Orchestrates backup and restore operations for cluster metadata including
     * instances and cron jobs. Supports import/export and metadata generation.
     * @param {string} [deployId=process.env.DEFAULT_DEPLOY_ID] - The deployment ID
     * @param {string} [host=process.env.DEFAULT_DEPLOY_HOST] - The host identifier
     * @param {string} [path=process.env.DEFAULT_DEPLOY_PATH] - The path identifier
     * @param {Object} [options] - Backup operation options
     * @param {boolean} [options.generate=false] - Generate cluster metadata
     * @param {boolean} [options.itc=false] - Execute in container context
     * @param {boolean} [options.import=false] - Import metadata from backup
     * @param {boolean} [options.export=false] - Export metadata to backup
     * @param {boolean} [options.instances=false] - Process instances collection
     * @param {boolean} [options.crons=false] - Process crons collection
     * @returns {void}
     * @memberof UnderpostDB
     */
    clusterMetadataBackupCallback(
      deployId = process.env.DEFAULT_DEPLOY_ID,
      host = process.env.DEFAULT_DEPLOY_HOST,
      path = process.env.DEFAULT_DEPLOY_PATH,
      options = {
        generate: false,
        itc: false,
        import: false,
        export: false,
        instances: false,
        crons: false,
      },
    ) {
      deployId = deployId ?? process.env.DEFAULT_DEPLOY_ID;
      host = host ?? process.env.DEFAULT_DEPLOY_HOST;
      path = path ?? process.env.DEFAULT_DEPLOY_PATH;

      logger.info('Starting cluster metadata backup operation', {
        deployId,
        host,
        path,
        options,
      });

      if (options.generate === true) {
        logger.info('Generating cluster metadata');
        UnderpostDB.API.clusterMetadataFactory(deployId, host, path);
      }

      if (options.instances === true) {
        const outputPath = './engine-private/instances';
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        const collection = 'instances';

        if (options.export === true) {
          logger.info('Exporting instances collection', { outputPath });
          shellExec(
            `node bin db --export --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        }

        if (options.import === true) {
          logger.info('Importing instances collection', { outputPath });
          shellExec(
            `node bin db --import --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        }
      }

      if (options.crons === true) {
        const outputPath = './engine-private/crons';
        if (!fs.existsSync(outputPath)) {
          fs.mkdirSync(outputPath, { recursive: true });
        }
        const collection = 'crons';

        if (options.export === true) {
          logger.info('Exporting crons collection', { outputPath });
          shellExec(
            `node bin db --export --collections ${collection} --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        }

        if (options.import === true) {
          logger.info('Importing crons collection', { outputPath });
          shellExec(
            `node bin db --import --drop --preserveUUID --out-path ${outputPath} --hosts ${host} --paths '${path}' ${deployId}`,
          );
        }
      }

      logger.info('Cluster metadata backup operation completed');
    },
  };
}

export default UnderpostDB;
