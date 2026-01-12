---
id: installation
title: Server Installation
sidebar_label: Installation
sidebar_position: 2
---

# Server Installation

Complete guide to install your Hytale dedicated server.

## Download Server Files

### Option A: CDN Download (Recommended)

Download directly from the official CDN:

```bash
curl -L -o HytaleServer.jar https://cdn.hytale.com/HytaleServer.jar
```

### Option B: From Launcher

Copy from your Hytale launcher installation:

| System | Path |
|--------|------|
| **Windows** | `%appdata%\Hytale\install\release\package\game\latest` |
| **Linux** | `$XDG_DATA_HOME/Hytale/install/release/package/game/latest` |
| **macOS** | `~/Application Support/Hytale/install/release/package/game/latest` |

## Install Java 25

### Ubuntu/Debian

```bash
# Add Adoptium repository
sudo apt update
sudo apt install wget apt-transport-https
wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | sudo apt-key add -
echo "deb https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/adoptium.list

# Install Java 25
sudo apt update
sudo apt install temurin-25-jdk

# Verify
java -version
# Should show: OpenJDK 25.0.1 2025-10-21 LTS
```

### Windows

Download and install from [Adoptium](https://adoptium.net/temurin/releases/?version=25).

## Quick Start

```bash
# Create directory
mkdir hytale-server
cd hytale-server

# Download server
curl -L -o HytaleServer.jar https://cdn.hytale.com/HytaleServer.jar

# Start server
java -Xms4G -Xmx8G -jar HytaleServer.jar --port 5520
```

## Server Directory Structure

After first run, your directory will look like:

```
hytale-server/
├── HytaleServer.jar      # Main executable
├── server.log            # Log file
├── config/
│   ├── server.properties # Main configuration
│   ├── networking.json   # Network settings (QUIC)
│   └── gameplay.json     # Gameplay settings
└── worlds/
    └── Orbis/            # Default world
        ├── region/       # Chunk data
        ├── playerdata/   # Player data
        └── level.dat     # World metadata
```

## Recommended Start Script

### Linux (start.sh)

```bash
#!/bin/bash

MEMORY_MIN="4G"
MEMORY_MAX="8G"

java -Xms${MEMORY_MIN} -Xmx${MEMORY_MAX} \
     -XX:+UseG1GC \
     -XX:+ParallelRefProcEnabled \
     -XX:MaxGCPauseMillis=200 \
     -XX:+UnlockExperimentalVMOptions \
     -XX:+DisableExplicitGC \
     -XX:+AlwaysPreTouch \
     -jar HytaleServer.jar \
     --port 5520 \
     nogui
```

### Windows (start.bat)

```batch
@echo off
java -Xms4G -Xmx8G -XX:+UseG1GC -jar HytaleServer.jar --port 5520 nogui
pause
```

## Firewall Configuration

### Linux (ufw)

```bash
sudo ufw allow 5520/udp
sudo ufw reload
```

### Windows PowerShell

```powershell
New-NetFirewallRule -DisplayName "Hytale Server" -Direction Inbound -Protocol UDP -LocalPort 5520 -Action Allow
```

## First Run

On first start, the server will:

1. Generate configuration files in `config/`
2. Create the default world (Orbis)
3. Start listening on port 5520/UDP

:::tip Hot Reload
Hytale supports **hot-reloading** - when you edit scripts or config files, they reload automatically without restarting the server!
:::

## Next Steps

- [Configure your server](/docs/en/servers/setup/configuration)
- [Set up Docker hosting](/docs/en/servers/hosting/docker)
- [Configure permissions](/docs/en/servers/administration/permissions)
