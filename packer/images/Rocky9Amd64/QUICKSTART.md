# Quick Start Guide - Rocky9 MAAS Image Build

## Prerequisites Check

Run these commands to verify your system is ready:

```bash
# Check hardware virtualization
egrep -c '(vmx|svm)' /proc/cpuinfo  # Should be > 0

# Check libvirt
systemctl status libvirtd

# Check QEMU
qemu-system-x86_64 --version

# Check Packer
packer version
```

## Build Commands

```bash
# From the engine root directory
cd /home/dd/engine

# Option 1: Build and Upload (recommended)
node bin baremetal --dev --packer-maas-image-build Rocky9Amd64

# Option 2: Upload Only (skip rebuild, use existing artifact)
node bin baremetal --dev --packer-maas-image-upload Rocky9Amd64

# Option 3: Manual build
cd packer/images/Rocky9Amd64
packer init .
PACKER_LOG=1 packer build .
```

## Build Process Timeline

- **Download ISO**: ~5-10 minutes (1.3GB)
- **VM Installation**: ~20-40 minutes
- **Post-processing**: ~5-10 minutes
- **Total**: ~30-60 minutes

## Output

The build produces:
- `rocky9.tar.gz` - The MAAS-ready image (~1.2GB)

## Upload to MAAS

After successful build, upload happens automatically. To re-upload:

```bash
# Option 1: Use the CLI (recommended, includes MAAS profile auto-detection)
node bin baremetal --dev --packer-maas-image-upload Rocky9Amd64

# Option 2: Use the upload script directly
./scripts/maas-upload-boot-resource.sh maas \
  custom/rocky9 \
  "Rocky 9 Custom" \
  amd64/generic \
  rhel/9 \
  tgz \
  packer/images/Rocky9Amd64/rocky9.tar.gz
```

### Upload-Only Flag Benefits

The `--packer-maas-image-upload` flag allows you to:
- ⚡ **Skip rebuild** - Saves 30-60 minutes
- 💾 **Reuse artifacts** - Uses existing 1.2GB tarball
- 🔄 **Retry uploads** - Re-upload if upload failed
- 🎯 **Test uploads** - Upload to different MAAS instances

## Common Issues

### "No checksum found"
✅ Fixed - ISO URL now uses Rocky-9-latest naming

### "qemu-system-x86_64 not found"  
✅ Fixed - Symlink created to /usr/libexec/qemu-kvm

### "OVMF_CODE.fd not found"
✅ Fixed - OVMF symlinks created

### Build hangs or times out
- Check system resources (RAM, CPU)
- Verify network connectivity
- Check logs: `packer_cache/` and console output

## Monitoring Build Progress

Watch the Packer output for:
```
==> qemu.rocky9: Downloading ISO...
==> qemu.rocky9: Starting HTTP server on port...
==> qemu.rocky9: Starting VM...
==> qemu.rocky9: Waiting for shutdown...
==> qemu.rocky9: Converting image...
```

## Clean Up After Build

```bash
# Remove build artifacts (keep only the tarball)
cd packer/images/Rocky9Amd64
rm -rf output-rocky9 packer_cache x86_64_VARS.fd

# Disconnect NBD devices if build failed
for i in {0..15}; do sudo qemu-nbd -d /dev/nbd${i} 2>/dev/null; done
```
