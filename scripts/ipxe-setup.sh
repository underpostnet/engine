#!/bin/bash

# --- Configuration ---
# Set the target architecture you want to build for.
# Options: "aarch64" (for ARM64 servers/devices) or "x86_64" (for standard Intel/AMD servers)
TARGET_ARCH="${TARGET_ARCH:-aarch64}"

IPXE_SRC_DIR="/home/dd/ipxe"
EFI_FILENAME="ipxe.efi"

# --- Argument Parsing ---
TARGET_DIR_ARG=""
REBUILD=false
EMBED_SCRIPT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --rebuild)
      REBUILD=true
      shift # past argument
      ;;
    --target-arch)
      case "$2" in
        arm64)
          TARGET_ARCH="aarch64"
          ;;
        amd64)
          TARGET_ARCH="x86_64"
          ;;
        *)
          echo "Error: Unsupported architecture '$2'. Use 'arm64' or 'amd64'."
          exit 1
          ;;
      esac
      shift # past argument
      shift # past value
      ;;
    --embed-script)
      EMBED_SCRIPT="$2"
      shift # past argument
      shift # past value
      ;;
    *)
      if [ -z "$TARGET_DIR_ARG" ]; then
          TARGET_DIR_ARG="$1"
      fi
      shift # past argument
      ;;
  esac
done

# Use argument if provided, otherwise env var, otherwise current dir
TARGET_DIR="${TARGET_DIR_ARG:-${TARGET_DIR:-.}}"

# --- 1. Detect System Architecture ---
HOST_ARCH=$(uname -m)
echo "--- System Detection ---"
echo "Host Architecture:   $HOST_ARCH"
echo "Target Architecture: $TARGET_ARCH"
echo "Target Directory:    $TARGET_DIR"
echo "Rebuild Mode:        $REBUILD"
echo "Embed Script:        ${EMBED_SCRIPT:-none}"

# Determine iPXE build target based on requested architecture
if [ "$TARGET_ARCH" = "aarch64" ]; then
    BUILD_TARGET="bin-arm64-efi/ipxe.efi"
elif [ "$TARGET_ARCH" = "x86_64" ]; then
    BUILD_TARGET="bin-x86_64-efi/ipxe.efi"
else
    echo "Error: Unsupported target architecture '$TARGET_ARCH'"
    exit 1
fi

# Define the full path to the compiled binary
COMPILED_SRC_PATH="$IPXE_SRC_DIR/src/$BUILD_TARGET"

# Decide whether to build
DO_BUILD=false

if [ "$REBUILD" = true ]; then
    DO_BUILD=true
elif [ ! -f "$COMPILED_SRC_PATH" ]; then
    echo "Binary not found at $COMPILED_SRC_PATH. Initiating build..."
    DO_BUILD=true
else
    echo "Binary found at $COMPILED_SRC_PATH. Skipping build."
fi

if [ "$DO_BUILD" = true ]; then

    # Helper function for package manager
    if command -v dnf &> /dev/null; then
        PKG_MGR="dnf"
    else
        PKG_MGR="yum"
    fi

    # --- 2. Install Dependencies (RHEL/CentOS/Fedora) ---
    echo ""
    echo "--- Installing Build Dependencies ---"
    echo "Requesting sudo permissions..."

    COMMON_PKGS="git make binutils-devel xz-devel perl"

    # Logic to determine if we need native or cross-compilers
    if [ "$HOST_ARCH" = "$TARGET_ARCH" ]; then
        # Native compilation
        echo "Architecture match ($HOST_ARCH). Installing native GCC..."
        sudo $PKG_MGR install -y $COMMON_PKGS gcc
        CROSS_COMPILE_PREFIX=""

    elif [ "$HOST_ARCH" = "x86_64" ] && [ "$TARGET_ARCH" = "aarch64" ]; then
        # Cross-compilation: x86_64 host -> aarch64 target
        echo "Cross-compiling for $TARGET_ARCH on $HOST_ARCH..."
        # Note: Ensure EPEL repo is enabled on RHEL/CentOS for this package
        sudo $PKG_MGR install -y $COMMON_PKGS gcc-aarch64-linux-gnu
        CROSS_COMPILE_PREFIX="aarch64-linux-gnu-"

    else
        echo "Error: No automated path defined for Host: $HOST_ARCH -> Target: $TARGET_ARCH"
        echo "You may need to install specific cross-compilers manually."
        exit 1
    fi

    # --- 3. Clone iPXE Source ---
    echo ""
    echo "--- Downloading iPXE Source Code ---"
    if [ -d "$IPXE_SRC_DIR" ]; then
        echo "Directory $IPXE_SRC_DIR already exists. Pulling latest changes..."
        cd $IPXE_SRC_DIR
        git pull
    else
        git clone https://github.com/ipxe/ipxe.git $IPXE_SRC_DIR
        cd $IPXE_SRC_DIR
    fi

    # --- 4. Compile the Binary ---
    echo ""
    echo "--- Compiling $EFI_FILENAME for $TARGET_ARCH ---"
    cd src

    # Clean previous builds to ensure no arch mismatch
    make clean

    # Build with embedded script if provided
    if [ -n "$EMBED_SCRIPT" ]; then
        echo "Embedding script into iPXE binary..."
        if [ ! -f "$EMBED_SCRIPT" ]; then
            echo "Error: Embed script file not found: $EMBED_SCRIPT"
            exit 1
        fi
        echo "Running make for target: $BUILD_TARGET with EMBED=$EMBED_SCRIPT..."
        make CROSS_COMPILE=$CROSS_COMPILE_PREFIX EMBED="$EMBED_SCRIPT" $BUILD_TARGET
    else
        echo "Running make for target: $BUILD_TARGET..."
        make CROSS_COMPILE=$CROSS_COMPILE_PREFIX $BUILD_TARGET
    fi

    if [ $? -ne 0 ]; then
        echo "Error: Compilation failed."
        if [ -n "$CROSS_COMPILE_PREFIX" ]; then
            echo "Check that cross-compiler '$CROSS_COMPILE_PREFIX' is installed and in your PATH."
        fi
        exit 1
    fi
fi

# --- 5. Deploy Binary ---
echo ""
echo "--- Deploying Binary ---"

# Copy the file
if [ -f "$COMPILED_SRC_PATH" ]; then
    # Create target directory if it doesn't exist
    if [ ! -d "$TARGET_DIR" ]; then
        echo "Creating target directory: $TARGET_DIR"
        mkdir -p "$TARGET_DIR"
    fi

    echo "Copying $COMPILED_SRC_PATH to $TARGET_DIR/$EFI_FILENAME..."
    cp "$COMPILED_SRC_PATH" "$TARGET_DIR/$EFI_FILENAME"

    if [ $? -eq 0 ]; then
        echo "✓ Success!"
        echo "---------------------------------------------------"
        echo "Target: $TARGET_ARCH"
        echo "Source: $COMPILED_SRC_PATH"
        echo "Destination: $TARGET_DIR/$EFI_FILENAME"
        echo "---------------------------------------------------"
    else
        echo "Error: Failed to copy file to $TARGET_DIR"
        exit 1
    fi
else
    echo "Error: Compiled file not found at $COMPILED_SRC_PATH"
    exit 1
fi
