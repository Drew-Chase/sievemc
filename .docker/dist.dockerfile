from rust:1-bookworm
label authors="Drew Chase"

env CARGO_BUILD_BUILD_DIR=/workspace/target/docker/tools
env CARGO_TARGET_DIR=/workspace/target/docker

# Tauri Linux prerequisites (glib/gtk/webkit) + pkg-config + build tooling.
# See https://tauri.app/start/prerequisites/#linux
run apt-get update && apt-get install -y --no-install-recommends \
        pkg-config \
        libssl-dev \
        libglib2.0-dev \
        libgtk-3-dev \
        libwebkit2gtk-4.1-dev \
        librsvg2-dev \
        libayatana-appindicator3-dev \
        libxdo-dev \
        curl \
        wget \
        file \
        zip \
    && rm -rf /var/lib/apt/lists/*
# Node 22 from NodeSource — Debian's own nodejs is v18, but pnpm requires >= v22.13
run curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
run npm i -g pnpm
run curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | sh
run cargo binstall -y just
run cargo binstall -y update-version
run cargo binstall -y tauri-cli

workdir /workspace

cmd just build