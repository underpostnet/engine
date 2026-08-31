'use strict';

import { expect } from 'chai';
import { PassThrough } from 'node:stream';
import winston from 'winston';
import { loggerFormatFactory, redactSensitiveText, serializeLogValue } from '../../src/server/ops/logger.js';

const renderLog = (message, metadata) => {
  const stream = new PassThrough();
  let output = '';
  stream.on('data', (chunk) => {
    output += chunk;
  });
  const logger = winston.createLogger({
    format: loggerFormatFactory('logger-redaction.test.js'),
    transports: [new winston.transports.Stream({ stream })],
  });
  metadata === undefined ? logger.info(message) : logger.info(message, metadata);
  logger.close();
  return output;
};

describe('central logger redaction', () => {
  it('filters common secret forms from free-form messages', () => {
    const rawToken = `ghp_${'A'.repeat(30)}`;
    const input = [
      'node bin host set GITHUB_TOKEN positional-secret',
      'GITHUB_TOKEN=environment-secret node bin db',
      'DB_PASS=database-secret',
      'curl --api-key flag-secret',
      'Authorization: Bearer bearer-secret',
      'https://user:url-secret@example.test/repo',
      '?session_id=query-secret&ok=true',
      `raw ${rawToken}`,
      '-----BEGIN PRIVATE KEY-----\nprivate-key-secret\n-----END PRIVATE KEY-----',
    ].join(' && ');
    const output = redactSensitiveText(input);

    for (const secret of [
      'positional-secret',
      'environment-secret',
      'database-secret',
      'flag-secret',
      'bearer-secret',
      'url-secret',
      'query-secret',
      'private-key-secret',
      rawToken,
    ])
      expect(output).to.not.include(secret);
    expect(output).to.include('GITHUB_TOKEN=[REDACTED]');
    expect(output).to.include('https://***@example.test/repo');
  });

  it('filters nested sensitive fields without mutating the source metadata', () => {
    const metadata = {
      githubToken: 'nested-secret',
      auth: { client_secret: 'client-secret', username: 'operator' },
      command: 'node bin host set API_KEY command-secret',
    };
    metadata.self = metadata;
    const output = serializeLogValue(metadata);

    expect(output).to.not.include('nested-secret');
    expect(output).to.not.include('client-secret');
    expect(output).to.not.include('command-secret');
    expect(output).to.include('operator');
    expect(output).to.include('[Circular]');
    expect(metadata.githubToken).to.equal('nested-secret');
  });

  it('applies the filter in the formatter used by every logger transport', () => {
    const output = renderLog('ssh node :: node bin host set GITHUB_TOKEN message-secret', {
      token_secret: 'metadata-secret',
      repository: 'https://user:url-secret@example.test/repo',
    });

    for (const secret of ['message-secret', 'metadata-secret', 'url-secret']) expect(output).to.not.include(secret);
    expect(output).to.include('[REDACTED]');
  });

  it('leaves ordinary operational context readable', () => {
    expect(redactSensitiveText('ssh operator@example.test :: uptime')).to.equal('ssh operator@example.test :: uptime');
  });

  it('filters Git fetch credentials from plain and escaped URLs', () => {
    const token = 'opaque-git-credential_123';
    for (const command of [
      `GIT_TERMINAL_PROMPT=0 git fetch --force "https://x-access-token:${token}@github.com/o/r" main`,
      `GIT_TERMINAL_PROMPT=0 git fetch --force "https:\\/\\/x-access-token:${token}@github.com\\/o\\/r" main`,
      `GIT_TERMINAL_PROMPT=0 git fetch --force "https\\://x-access-token\\:${token}\\@github.com\\/o\\/r" main`,
      `git fetch x-access-token:${token}@github.com`,
    ]) {
      const output = redactSensitiveText(command);
      expect(output).to.not.include(token);
      expect(output).to.match(/\*\*\*|\[REDACTED\]/);
    }
  });

  it('filters every database password form used by the db workflow', () => {
    for (const command of [
      'mariadb -u root -psecret database',
      'mariadb -u root -p "secret" database',
      'mariadb-dump --user=root --password=secret database',
      'mongosh -u root -p "secret"',
      'mongorestore --username root --password "secret"',
      'MYSQL_PWD=secret mariadb database',
      'mongodb://root:secret@mongo/database',
    ])
      expect(redactSensitiveText(command), command).to.not.include('secret');
  });
});
