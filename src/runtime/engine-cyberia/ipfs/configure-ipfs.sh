#!/bin/sh
# Kubo /container-init.d hook — runs after `ipfs init`, before the daemon starts.
# Compose equivalent of the Addresses/Datastore config in manifests/ipfs
# configmap.yaml (configure-ipfs.sh). Binds the RPC API (5001) and gateway
# (8080) to all interfaces so the engine and ipfs-cluster containers can reach
# the daemon at http://ipfs:5001 (ipfs-client.js IPFS_API_URL).
set -e

ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
ipfs config --json Swarm.ConnMgr.HighWater 2000
ipfs config --json Datastore.BloomFilterSize 1048576
ipfs config Datastore.StorageMax 100GB
