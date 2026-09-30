'use strict';

import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
// Named import: js-yaml's ESM build exports no default.
import { load } from 'js-yaml';

const readYaml = (file) => load(fs.readFileSync(file, 'utf8'));
const service = readYaml('./manifests/mongodb/headless-service.yaml');
const mongod = readYaml('./manifests/mongodb/statefulset.yaml').spec.template.spec.containers[0];

const POD_IP = '10.244.1.7';
const STALE_IP = '10.244.9.9';
const ahosts = (ip) => `${ip}      STREAM mongodb-0.mongodb-service.default.svc.cluster.local\n`;

const STUBS = {
  // Answers call N with answer-N, and repeats the last answer after that.
  getent: [
    '#!/bin/sh',
    'echo "$*" >> "$STUB/lookups"',
    'n=$(($(cat "$STUB/calls") + 1)); echo "$n" > "$STUB/calls"',
    '[ -f "$STUB/answer-$n" ] || n=$(ls "$STUB" | grep -c "^answer-")',
    'cat "$STUB/answer-$n"',
  ].join('\n'),
  sleep: '#!/bin/sh\nexit 0',
  mongod: '#!/bin/sh\necho "mongod $*"',
};

// Runs the container entrypoint with stub getent, sleep and mongod ahead of the real PATH.
const start = (answers) => {
  const stub = fs.mkdtempSync(path.join(os.tmpdir(), 'mongod-start-'));
  try {
    for (const [name, body] of Object.entries(STUBS)) fs.writeFileSync(path.join(stub, name), body, { mode: 0o755 });
    answers.forEach((answer, index) => fs.writeFileSync(path.join(stub, `answer-${index + 1}`), answer));
    fs.writeFileSync(path.join(stub, 'calls'), '0');
    fs.writeFileSync(path.join(stub, 'lookups'), '');
    const [command, ...commandArgs] = mongod.command;
    const result = spawnSync(command, [...commandArgs, ...mongod.args], {
      encoding: 'utf8',
      env: { PATH: `${stub}:${process.env.PATH}`, STUB: stub, POD_NAME: 'mongodb-0', POD_IP },
    });
    return {
      ...result,
      calls: Number(fs.readFileSync(path.join(stub, 'calls'), 'utf8')),
      lookups: fs.readFileSync(path.join(stub, 'lookups'), 'utf8').trim().split('\n'),
    };
  } finally {
    fs.removeSync(stub);
  }
};

describe('MongoDB member start', () => {
  it('publishes every member name before readiness', () => {
    expect(service.spec.publishNotReadyAddresses).to.equal(true);
  });

  it('reads the pod name and IP from the downward API', () => {
    const fieldOf = (name) => mongod.env.find((entry) => entry.name === name)?.valueFrom?.fieldRef?.fieldPath;
    expect(fieldOf('POD_NAME')).to.equal('metadata.name');
    expect(fieldOf('POD_IP')).to.equal('status.podIP');
  });

  it('starts mongod with its flags once its member name resolves to this pod', () => {
    const result = start([ahosts(POD_IP)]);
    expect(result.status).to.equal(0);
    expect(result.stdout.trim()).to.equal(`mongod ${mongod.args.join(' ')}`);
    expect(result.lookups).to.deep.equal(['ahosts mongodb-0.mongodb-service']);
  });

  it('waits while the name is missing or still points to the previous pod IP', () => {
    const result = start(['', ahosts(STALE_IP), ahosts(POD_IP)]);
    expect(result.status).to.equal(0);
    expect(result.calls).to.equal(3);
    expect(result.stdout).to.include('mongod --replSet rs0');
  });

  it('exits without mongod when the name never resolves to this pod', () => {
    const result = start([ahosts(STALE_IP)]);
    expect(result.status).to.equal(1);
    expect(result.calls).to.equal(60);
    expect(result.stdout).to.not.include('mongod');
    expect(result.stderr).to.include(`mongodb-0.mongodb-service does not resolve to ${POD_IP}`);
  });
});
