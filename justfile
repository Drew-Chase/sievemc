set windows-shell := ["powershell.exe", "-NoProfile", "-NoLogo", "-Command"]
set shell := ["sh", "-c"]

cli_version := `uv --path ./crates/cli --current`
desktop_version := `uv --path ./crates/desktop --current`

# List all available recipes
default:
    @just --list

# Build distribution packages for Windows (OS and Docker)
[windows]
dist: dist-os dist-docker

# Build distribution packages for Linux
[linux]
dist: dist-os

# Build distribution packages for macOS
[macos]
dist: dist-os

# Create Windows distribution packages
[windows]
dist-os: build
    @New-Item -Type Directory target/dist -Force
    @Compress-Archive -Path target/release/sievemc.exe,target/release/sievemc_cli.exe -DestinationPath target/dist/sievemc-windows-x86_64-v{{ desktop_version }}.zip -Force
    @Write-Host "Zipping Desktop"
    @Compress-Archive -Path target/release/sievemc.exe -DestinationPath target/dist/sievemc-desktop-windows-x86_64-v{{ desktop_version }}.zip -Force
    @Write-Host "Zipping CLI"
    @Move-Item target/release/sievemc_cli.exe target/release/sievemc.exe -Force
    @Compress-Archive -Path target/release/sievemc.exe -DestinationPath target/dist/sievemc-cli-windows-x86_64-v{{ cli_version }}.zip -Force

# Create Linux distribution packages
[linux]
dist-os: build
    @mkdir -p target/dist
    @cd target/release && zip -j ../dist/sievemc-linux-x86_64-v{{ desktop_version }}.zip sievemc sievemc_cli
    @echo "Zipping Desktop"
    @cd target/release && zip -j ../dist/sievemc-desktop-linux-x86_64-v{{ desktop_version }}.zip sievemc
    @echo "Zipping CLI"
    @mv -f target/release/sievemc_cli target/release/sievemc
    @cd target/release && zip -j ../dist/sievemc-cli-linux-x86_64-v{{ cli_version }}.zip sievemc

# Create macOS distribution packages
[macos]
dist-os: build
    @mkdir -p target/dist
    @cd target/release && zip -j ../dist/sievemc-macos-x86_64-v{{ desktop_version }}.zip sievemc sievemc_cli
    @echo "Zipping Desktop"
    @cd target/release && zip -j ../dist/sievemc-desktop-macos-x86_64-v{{ desktop_version }}.zip sievemc
    @echo "Zipping CLI"
    @mv -f target/release/sievemc_cli target/release/sievemc
    @cd target/release && zip -j ../dist/sievemc-cli-macos-x86_64-v{{ cli_version }}.zip sievemc

# Build Linux distribution packages using Docker
[windows]
dist-docker:
    @docker build -t sievemc-build -f ./.docker/dist.dockerfile .
    @docker run --rm -v "${PWD}:/workspace" -v "${PWD}/target/docker/node_modules:/workspace/crates/desktop/node_modules" sievemc-build

    @New-Item -Type Directory target/dist -Force
    @Compress-Archive -Path target/docker/release/sievemc,target/docker/release/sievemc_cli -DestinationPath target/dist/sievemc-linux-x86_64-v{{ desktop_version }}.zip -Force
    @Write-Host "Zipping Desktop"
    @Compress-Archive -Path target/docker/release/sievemc -DestinationPath target/dist/sievemc-desktop-linux-x86_64-v{{ desktop_version }}.zip -Force
    @Write-Host "Zipping CLI"
    @Move-Item target/docker/release/sievemc_cli target/release/sievemc -Force
    @Compress-Archive -Path target/docker/release/sievemc -DestinationPath target/dist/sievemc-cli-linux-x86_64-v{{ cli_version }}.zip -Force

# Build CLI and desktop applications in release mode
build: install
    @cargo build --package sievemc_cli --release
    @cargo tauri build --no-bundle

# Clean build artifacts and dependencies
clean: && _clean_pnpm
    @cargo clean

# Run desktop application in development mode
dev: desktop

# Run desktop application in development mode (with installation)
desktop: install
    @cargo tauri dev --no-watch

# Install dependencies for the desktop application
[working-directory('./crates/desktop')]
install:
    @cargo install update-version
    @pnpm install --frozen-lockfile

# Clean pnpm artifacts
[working-directory('./crates/desktop')]
_clean_pnpm:
    @pnpm clean

# Run the CLI with the provided arguments
cli args:
    @cargo run --package sievemc_cli -q -- {{ args }}

# Display CLI help information
help:
    @cargo run --package sievemc_cli -q -- --help

# Generate application icon from SVG source
gen-icon:
    @cargo tauri icon .\crates\desktop\src-tauri\icons\sievemc-icon.svg
