// The privilege boundary of the bare-metal commands: host changes run as root through the process boundary,
// the trees the commands own are written with the file system API, and clipboard instructions never run. The
// shell harness answers every command; the NFS and TFTP roots, the home and the ISO mount are scratch paths.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import clipboard from 'clipboardy';
import fs from 'fs-extra';
import os from 'node:os';
import nodePath from 'node:path';
import zlib from 'node:zlib';
import Underpost from '../../../src/index.js';
import { privilegedCommand, shellHarness } from '../../support/shell-harness.js';

const WORKFLOW = 'rpi4mbarm64-chroot-rocky9';
const elevated = (call) => /^'?sudo'? /.test(call);

let harness;
let scratch;
let home;
/** The host changes of a run: the commands that ran as root. */
const hostChanges = () => harness.calls.filter(elevated).map(privilegedCommand);

beforeEach(() => {
  scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'underpost-baremetal-'));
  home = nodePath.join(scratch, 'home');
  fs.outputFileSync(nodePath.join(home, '.ssh', 'id_rsa.pub'), 'ssh-ed25519 AAAA operator@host\n');
  vi.stubEnv('CI', 'true');
  vi.stubEnv('NFS_EXPORT_PATH', nodePath.join(scratch, 'nfs'));
  vi.stubEnv('TFTP_ROOT', nodePath.join(scratch, 'tftp'));
  vi.stubEnv('MAAS_ADMIN_USERNAME', 'admin');
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  vi.spyOn(Underpost.wireguard, 'localRole').mockReturnValue('');
  vi.spyOn(Underpost.baremetal, 'getHostArch').mockReturnValue({ alias: 'amd64', name: 'x86_64' });
});
afterEach(() => {
  harness?.restore();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.removeSync(scratch);
});

const baremetal = (options) => Underpost.baremetal.callback(WORKFLOW, { dev: true, ...options });

describe('the MAAS control server', () => {
  it('installs as root, with the public key of the user that runs the command', async () => {
    harness = shellHarness();
    await baremetal({ controlServerInstall: true });
    expect(hostChanges()[0]).toBe(`SSH_PUBLIC_KEY_FILE='${home}/.ssh/id_rsa.pub' bash './scripts/maas-setup.sh'`);
    expect(harness.calls.filter((call) => !elevated(call) && call.includes('maas-setup'))).toEqual([]);
  });

  it('keeps the exit code of a failed setup', async () => {
    harness = shellHarness([{ match: 'maas-setup.sh', code: 3, stderr: 'maas init failed' }]);
    await expect(baremetal({ controlServerInstall: true })).rejects.toMatchObject({ code: 3 });
  });

  it('uninstalls the snap and the system data as root, and the snap data of the user as the user', async () => {
    fs.outputFileSync(nodePath.join(home, 'snap', 'maas', 'current', '.maascli.db'), '');
    harness = shellHarness();
    await baremetal({ controlServerUninstall: true });
    expect(hostChanges()).toEqual([
      'snap stop maas.pebble',
      'snap stop maas',
      'snap remove maas --purge',
      "rm -rf -- '/var/snap/maas'",
      "rm -rf -- '/etc/maas'",
      "rm -rf -- '/var/lib/maas'",
      "rm -rf -- '/var/log/maas'",
    ]);
    expect(fs.existsSync(nodePath.join(home, 'snap', 'maas'))).toBe(false);
  });

  it('restarts and stops the snap as root, with no nested sudo in a root process', async () => {
    harness = shellHarness();
    await baremetal({ controlServerRestart: true });
    await baremetal({ controlServerStop: true });
    expect(hostChanges()).toEqual(['snap restart maas', 'snap stop maas']);
    harness.restore();

    harness = shellHarness([], { uid: 0 });
    await baremetal({ controlServerRestart: true });
    expect(harness.calls.filter((call) => call.includes('snap'))).toEqual(['snap restart maas']);
    expect(harness.ran('sudo')).toBe(false);
  });

  it('delegates a database operation to the MAAS database provider', async () => {
    harness = shellHarness();
    const database = vi.spyOn(Underpost.baremetal, 'maasDatabase').mockReturnValue({ status: {} });
    await baremetal({ controlServerDbStatus: true });
    expect(database).toHaveBeenCalledWith('controlServerDbStatus', expect.objectContaining({ dev: true }));
    expect(hostChanges()).toEqual([]);
  });

  it('runs the MAAS CLI with the profile of root', () => {
    harness = shellHarness([{ match: 'machines read', stdout: '[]' }]);
    expect(Underpost.baremetal.maasCliExec('machines read')).toEqual([]);
    expect(hostChanges()).toEqual(['maas admin machines read']);
  });
});

describe('the NFS root', () => {
  // The build is followed by the MAAS reads of commissioning, which this stub stops.
  const afterBuild = () =>
    vi.spyOn(Underpost.baremetal, 'maasCliExec').mockImplementation(() => {
      throw new Error('after the NFS build');
    });

  it('builds as root in the rootful Podman storage, and gives the tree to the user before the chroot', async () => {
    afterBuild();
    harness = shellHarness();
    await expect(baremetal({ nfsBuild: true })).rejects.toThrow('after the NFS build');
    const unprivileged = harness.calls.filter((call) => !elevated(call));
    expect(
      unprivileged.filter((call) =>
        /^(podman|mount|umount|chroot|rm|install|chown|chmod|dnf|debootstrap)\s/.test(call),
      ),
    ).toEqual([]);
    const commands = hostChanges();
    const order = [
      /^\[ ! -d '.*\/nfs\/rpi4mbarm64-chroot-rocky9' \] \|\| find .* -exec rm -rf -- \{\} \+$/,
      /^install -d -m 0755 '.*\/nfs\/rpi4mbarm64-chroot-rocky9'$/,
      /^podman pull --arch=arm64 /,
      /^podman create --replace --arch=arm64 --name chroot-source /,
      /^set -o pipefail; podman export chroot-source \| tar -x -C /,
      /^podman rm --ignore chroot-source$/,
      /^podman create --replace --name extract /,
      /^podman cp extract:\/usr\/bin\/qemu-aarch64-static /,
      /^podman rm --ignore extract$/,
      /^dnf -y install 'iptables-legacy' 'debootstrap' /,
      /find .* -xdev -exec chown -h \d+:\d+ \{\} \+ && find .* -type d -exec chmod 0755/,
      /^mount --bind \/proc /,
      /^install -D -m 0644 -o root -g root '\/etc\/resolv\.conf' /,
      /^chroot '.*' \/usr\/bin\/qemu-aarch64-static \/bin\/bash <<'EOF'/,
    ].map((pattern) => commands.findIndex((command) => pattern.test(command)));
    expect(
      order.every((index) => index >= 0),
      commands.join('\n'),
    ).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('removes the temporary container and fails when the export fails', async () => {
    afterBuild();
    harness = shellHarness([{ match: 'podman export', code: 1, stderr: 'export failed' }]);
    await expect(baremetal({ nfsBuild: true })).rejects.toMatchObject({ code: 1 });
    expect(harness.ran('podman rm --ignore chroot-source')).toBe(true);
    expect(harness.ran('chroot ')).toBe(false);
  });

  it('removes nothing without an absolute NFS export root', async () => {
    vi.stubEnv('NFS_EXPORT_PATH', '');
    harness = shellHarness();
    await expect(baremetal({ nfsBuild: true })).rejects.toThrow(/NFS_EXPORT_PATH must name an absolute directory/);
    expect(harness.ran('rm -rf')).toBe(false);
  });

  it('copies the chroot command to the clipboard and runs nothing', async () => {
    const copied = vi.spyOn(clipboard, 'writeSync').mockImplementation(() => {});
    harness = shellHarness();
    await baremetal({ nfsSh: true });
    expect(copied).toHaveBeenCalledWith(
      `sudo chroot ${scratch}/nfs/${WORKFLOW} /usr/bin/qemu-aarch64-static /bin/bash`,
    );
    expect(harness.ran('chroot')).toBe(false);
    expect(hostChanges()).toEqual([]);
  });
});

describe('the boot files', () => {
  it('extracts the ISO kernel with the file system API between a mount and an unmount as root', () => {
    const root = `${scratch}/nfs/${WORKFLOW}`;
    const mountPoint = `${root}/mnt-iso-amd64`;
    const isoPath = '/var/tmp/live-iso/rocky.iso';
    const existsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((target) => target === isoPath || existsSync(target));
    harness = shellHarness([
      {
        // sudo creates the directories, the mount shows the ISO files, and the unmount takes them away.
        match: (command) => {
          if (/^install -d /.test(command)) fs.ensureDirSync(/'([^']+)'$/.exec(command)[1]);
          if (/^mount -o loop/.test(command)) {
            fs.outputFileSync(`${mountPoint}/images/pxeboot/vmlinuz`, 'kernel');
            fs.outputFileSync(`${mountPoint}/images/pxeboot/initrd.img`, 'initrd');
          }
          if (/^umount /.test(command)) fs.emptyDirSync(mountPoint);
          return false;
        },
      },
      { match: 'mountpoint -q', code: 1 },
    ]);
    const files = Underpost.baremetal.downloadISO({
      architecture: 'amd64',
      nfsHostPath: root,
      isoUrl: 'https://example.com/rocky.iso',
      osIdLike: 'rhel centos fedora',
    });
    expect(fs.readFileSync(files['vmlinuz-efi'], 'utf8')).toBe('kernel');
    expect(fs.readFileSync(files['initrd.img'], 'utf8')).toBe('initrd');
    expect(fs.existsSync(mountPoint)).toBe(false);
    expect(hostChanges()).toEqual([
      expect.stringMatching(/^install -d -m 0755 -o \d+ -g \d+ '.*\/iso-extract'$/),
      expect.stringMatching(/^install -d -m 0755 -o \d+ -g \d+ '.*\/mnt-iso-amd64'$/),
      expect.stringMatching(/^mount -o loop,ro '\/var\/tmp\/live-iso\/rocky\.iso' /),
      expect.stringMatching(/^umount '.*\/mnt-iso-amd64'$/),
    ]);
  });

  it('copies the kernel files into the TFTP tree and decompresses a gzip kernel natively', () => {
    const resources = `${scratch}/maas/uefi/arm64`;
    for (const file of ['bootaa64.efi', 'grubaa64.efi']) fs.outputFileSync(`${resources}/${file}`, file);
    fs.outputFileSync(`${scratch}/boot/vmlinuz`, zlib.gzipSync('raw kernel image'));
    fs.outputFileSync(`${scratch}/boot/initrd.img`, 'initrd');
    const tftpRootPath = `${scratch}/tftp/rpi4mb`;
    fs.ensureDirSync(`${tftpRootPath}/pxe`);
    harness = shellHarness([{ match: /^file /, stdout: 'gzip compressed data, max compression' }]);
    Underpost.baremetal.updateKernelFiles({
      resourcesPath: resources,
      tftpRootPath,
      kernelFilesPaths: { 'vmlinuz-efi': `${scratch}/boot/vmlinuz`, 'initrd.img': `${scratch}/boot/initrd.img` },
    });
    expect(fs.readFileSync(`${tftpRootPath}/pxe/vmlinuz-efi`, 'utf8')).toBe('raw kernel image');
    expect(fs.readdirSync(`${tftpRootPath}/pxe`).sort()).toEqual([
      'bootaa64.efi',
      'grubaa64.efi',
      'initrd.img',
      'vmlinuz-efi',
    ]);
    expect(hostChanges()).toEqual([]);
  });
});
