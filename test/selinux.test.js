'use strict';

import { expect } from 'chai';
import SELinuxService, {
  runSELinuxCommands,
  selinuxContainerSharedContextCommandsFactory,
  selinuxEnforcingCommandsFactory,
  selinuxFileContextCommandFactory,
  selinuxRestoreconCommandFactory,
  selinuxSshContextCommandsFactory,
  selinuxSshPortCommandsFactory,
  shellArgumentFactory,
} from '../src/server/selinux.js';

describe('SELinux utilities', () => {
  it('provides one canonical class API with named factory aliases', () => {
    expect(SELinuxService.selinuxEnforcingCommandsFactory).to.equal(selinuxEnforcingCommandsFactory);
    expect(SELinuxService.runSELinuxCommands).to.equal(runSELinuxCommands);
    expect(SELinuxService.shellArgumentFactory).to.equal(shellArgumentFactory);
  });

  it('quotes shell arguments and restores policy contexts', () => {
    expect(shellArgumentFactory("/home/o'hara/.ssh")).to.equal("'/home/o'\"'\"'hara/.ssh'");
    const command = selinuxRestoreconCommandFactory(['/root/.ssh', '/etc/sudoers.d/90_admin']);
    expect(command).to.include("restorecon -RF '/root/.ssh'");
    expect(command).to.include("restorecon -RF '/etc/sudoers.d/90_admin'");
  });

  it('shares container-mounted host paths with a persistent container_file_t mapping', () => {
    const commands = selinuxContainerSharedContextCommandsFactory(['/etc/kubernetes', '/var/lib/etcd']);
    expect(commands).to.have.length(3);
    expect(commands[0]).to.include("semanage fcontext -a -t container_file_t '/etc/kubernetes(/.*)?'");
    expect(commands[0]).to.include("semanage fcontext -m -t container_file_t '/etc/kubernetes(/.*)?'");
    expect(commands[1]).to.include("container_file_t '/var/lib/etcd(/.*)?'");
    expect(commands[2]).to.include("restorecon -RF '/etc/kubernetes'");
    expect(() => selinuxContainerSharedContextCommandsFactory([])).to.throw(TypeError);
  });

  it('requires both a path and a type for file context mappings', () => {
    expect(() => selinuxFileContextCommandFactory('', { type: 'container_file_t' })).to.throw(TypeError);
    expect(() => selinuxFileContextCommandFactory('/var/lib/etcd', {})).to.throw(TypeError);
  });

  it('adds persistent mappings only for non-standard SSH homes', () => {
    expect(selinuxSshContextCommandsFactory({ sshDirectory: '/home/admin/.ssh' })).to.have.length(1);
    expect(selinuxSshContextCommandsFactory({ sshDirectory: '/srv/admin/.ssh' })[0]).to.include(
      'semanage fcontext -a -t ssh_home_t',
    );
  });

  it('restores requested contexts before activating Enforcing mode', () => {
    const commands = selinuxEnforcingCommandsFactory({ restorePaths: ['/var/lib/containerd'] });
    expect(commands[1]).to.include('touch /.autorelabel');
    expect(commands[2]).to.include('restorecon');
    expect(commands[3]).to.include('setenforce 1');
  });

  it('maps only custom SSH ports and validates the port range', () => {
    expect(selinuxSshPortCommandsFactory({ port: 22 })).to.deep.equal([]);
    expect(selinuxSshPortCommandsFactory({ port: 2222 })[0]).to.include(
      'semanage port -a -t ssh_port_t -p tcp 2222',
    );
    expect(() => selinuxSshPortCommandsFactory({ port: 70000 })).to.throw(RangeError);
  });

  it('executes generated commands with an injected executor', () => {
    const executed = [];
    runSELinuxCommands(['one', 'two'], { execute: (command) => executed.push(command) });
    expect(executed).to.deep.equal(['one', 'two']);
  });
});
