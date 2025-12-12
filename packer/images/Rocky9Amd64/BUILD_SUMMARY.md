# Rocky9 MAAS Image Build - Complete Summary

## ✅ All Issues Fixed

### 1. ISO Checksum Error
- **Fixed**: Updated ISO URL to use `Rocky-9-latest-x86_64-boot.iso`
- **File**: `packer/images/Rocky9Amd64/rocky9.pkr.hcl`

### 2. Missing QEMU Binary  
- **Fixed**: Created symlink `/usr/bin/qemu-system-x86_64` → `/usr/libexec/qemu-kvm`
- **File**: `scripts/packer-setup.sh`

### 3. Missing OVMF Firmware
- **Fixed**: Created symlinks in `/usr/share/OVMF/`
- **File**: `scripts/packer-setup.sh`

### 4. Missing UEFI VARS File
- **Fixed**: Auto-create `x86_64_VARS.fd` from OVMF template
- **File**: `scripts/packer-setup.sh`

### 5. Missing Post-Processing Scripts
- **Fixed**: Created `fuse-nbd` and `fuse-tar-root` scripts
- **Location**: `packer/scripts/`

### 6. Wrong Scripts Path
- **Fixed**: Updated from `../scripts/` to `../../scripts/`
- **File**: `packer/images/Rocky9Amd64/rocky9.pkr.hcl`

### 7. MAAS CLI Upload Bug
- **Fixed**: Created `maas-upload-boot-resource.sh` using curl + OAuth
- **File**: `scripts/maas-upload-boot-resource.sh`

### 8. MAAS Profile Detection
- **Fixed**: Auto-detect profile from `maas list` output
- **File**: `src/cli/baremetal.js`

### 9. Workflow ID Migration
- **Fixed**: Changed from `rocky9cloud` to `Rocky9Amd64`
- **File**: `src/cli/baremetal.js`

### 10. Missing Upload-Only Option
- **Fixed**: Added `--packer-maas-image-upload` flag
- **Files**: `src/cli/baremetal.js`, `src/cli/index.js`

## 📁 Directory Structure

```
engine/
├── packer/
│   ├── images/
│   │   └── Rocky9Amd64/
│   │       ├── rocky9.pkr.hcl           (Packer template)
│   │       ├── http/
│   │       │   └── rocky9.ks.pkrtpl.hcl (Kickstart config)
│   │       ├── Makefile
│   │       ├── README.md
│   │       ├── QUICKSTART.md
│   │       ├── BUILD_SUMMARY.md         (this file)
│   │       ├── x86_64_VARS.fd          (ignored by git)
│   │       ├── output-rocky9/          (ignored by git)
│   │       ├── packer_cache/           (ignored by git)
│   │       └── rocky9.tar.gz           (ignored by git - 1.2GB)
│   └── scripts/
│       ├── fuse-nbd
│       ├── fuse-tar-root
│       └── maas-upload-boot-resource.sh
└── scripts/
    └── packer-setup.sh

## 🚀 Usage

### Build + Upload (30-60 minutes)
```bash
node bin baremetal --dev --packer-maas-image-build Rocky9Amd64
```

### Upload Only (< 5 minutes)
```bash
node bin baremetal --dev --packer-maas-image-upload Rocky9Amd64
```

### Manual Upload
```bash
./scripts/maas-upload-boot-resource.sh maas \
  custom/rocky9 \
  "Rocky 9 Custom" \
  amd64/generic \
  rhel/9 \
  tgz \
  packer/images/Rocky9Amd64/rocky9.tar.gz
```

## 📊 Build Output

- **ISO Download**: Rocky-9-latest-x86_64-boot.iso (~1.3GB)
- **QCOW2 Image**: output-rocky9/packer-rocky9 (~3.5GB)
- **Final Tarball**: rocky9.tar.gz (~1.2GB)

## 🔧 System Requirements

- Rocky Linux 9.x (or RHEL 9.x)
- Packer 1.11.0+
- QEMU/KVM with hardware virtualization
- 4GB+ RAM for build VM
- 10GB+ free disk space
- Network access to download ISO

## 📦 Dependencies Installed

Via `scripts/packer-setup.sh`:
- packer
- libvirt, libvirt-daemon
- qemu-kvm, qemu-img
- edk2-ovmf, edk2-aarch64
- libnbd, nbdkit, e2fsprogs
- virt-install, bridge-utils

## 🎯 Key Features

1. **Automatic Setup**: `packer-setup.sh` installs everything
2. **MAAS Profile Auto-Detection**: No manual configuration needed
3. **Upload-Only Mode**: Skip rebuild, upload existing artifacts
4. **Progress Indication**: Shows upload progress for large files
5. **Git-Friendly**: All large files ignored (6GB+ per build)
6. **OAuth Upload**: Bypasses buggy MAAS CLI

## 🔍 Troubleshooting

### Upload Taking Too Long
- Normal! 1.2GB upload can take 5-10 minutes depending on network
- Progress bar shows upload status
- 10-minute timeout prevents hanging

### Build Timeout
- Increase timeout in `rocky9.pkr.hcl`:
  ```hcl
  variable "timeout" {
    default = "2h"  # Increase from 1h
  }
  ```

### NBD Devices Busy
```bash
for i in {0..15}; do sudo qemu-nbd -d /dev/nbd${i} 2>/dev/null; done
```

### Clean Up Build Artifacts
```bash
cd packer/images/Rocky9Amd64
rm -rf output-rocky9 packer_cache x86_64_VARS.fd
```

## ✅ Verification

All systems ready:
```bash
# Check QEMU
qemu-system-x86_64 --version

# Check Packer
packer version

# Check MAAS
maas list

# Check OVMF
ls -l /usr/share/OVMF/OVMF_CODE.fd

# Check NBD
modinfo nbd
```
