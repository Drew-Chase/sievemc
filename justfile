set windows-shell := ["powershell.exe", "-NoProfile", "-NoLogo", "-Command"]
set shell := ["sh", "-c"]
cli_version:=`uv --path ./crates/cli --current`
desktop_version:=`uv --path ./crates/desktop --current`

default:
    @just --list

dist: dist-os dist-docker

[windows]
dist-os: build
    @New-Item -Type Directory target/dist -Force
    @Compress-Archive -Path target/release/sievemc.exe,target/release/sievemc_cli.exe -DestinationPath target/dist/sievemc-windows-x86_64-v{{desktop_version}}.zip -Force
    @Write-Host "Zipping Desktop"
    @Compress-Archive -Path target/release/sievemc.exe -DestinationPath target/dist/sievemc-desktop-windows-x86_64-v{{desktop_version}}.zip -Force
    @Write-Host "Zipping CLI"
    @Move-Item target/release/sievemc_cli.exe target/release/sievemc.exe -Force
    @Compress-Archive -Path target/release/sievemc.exe -DestinationPath target/dist/sievemc-cli-windows-x86_64-v{{cli_version}}.zip -Force

[linux]
dist-os: build
    @mkdir -p target/dist
    @cd target/release && zip -j ../dist/sievemc-linux-x86_64-v{{desktop_version}}.zip sievemc sievemc_cli
    @echo "Zipping Desktop"
    @cd target/release && zip -j ../dist/sievemc-desktop-linux-x86_64-v{{desktop_version}}.zip sievemc
    @echo "Zipping CLI"
    @mv -f target/release/sievemc_cli target/release/sievemc
    @cd target/release && zip -j ../dist/sievemc-cli-linux-x86_64-v{{cli_version}}.zip sievemc

[macos]
dist-os: build
    @mkdir -p target/dist
    @cd target/release && zip -j ../dist/sievemc-macos-x86_64-v{{desktop_version}}.zip sievemc sievemc_cli
    @echo "Zipping Desktop"
    @cd target/release && zip -j ../dist/sievemc-desktop-macos-x86_64-v{{desktop_version}}.zip sievemc
    @echo "Zipping CLI"
    @mv -f target/release/sievemc_cli target/release/sievemc
    @cd target/release && zip -j ../dist/sievemc-cli-macos-x86_64-v{{cli_version}}.zip sievemc

[windows]
dist-docker:
    @docker build -t sievemc-build -f ./.docker/dist.dockerfile .
    @docker run --rm -v "${PWD}:/workspace" -v "${PWD}/target/docker/node_modules:/workspace/crates/desktop/node_modules" sievemc-build

    @New-Item -Type Directory target/dist -Force
    @Compress-Archive -Path target/docker/release/sievemc,target/docker/release/sievemc_cli -DestinationPath target/dist/sievemc-linux-x86_64-v{{desktop_version}}.zip -Force
    @Write-Host "Zipping Desktop"
    @Compress-Archive -Path target/docker/release/sievemc -DestinationPath target/dist/sievemc-desktop-linux-x86_64-v{{desktop_version}}.zip -Force
    @Write-Host "Zipping CLI"
    @Move-Item target/docker/release/sievemc_cli target/release/sievemc -Force
    @Compress-Archive -Path target/docker/release/sievemc -DestinationPath target/dist/sievemc-cli-linux-x86_64-v{{cli_version}}.zip -Force

build: install
    @cargo build --package sievemc_cli --release
    @cargo tauri build --no-bundle

clean: && _clean_pnpm
    @cargo clean

dev:desktop
desktop:install
    @cargo tauri dev --no-watch

[working-directory: './crates/desktop']
install:
    @cargo install update-version
    @pnpm upgrade
    @pnpm i

[working-directory: './crates/desktop']
_clean_pnpm:
    @pnpm clean

cli args:
    @cargo run --package sievemc_cli -q -- {{ args }}

help:
    @cargo run --package sievemc_cli -q -- --help

gen-icon:
    @cargo tauri icon .\crates\desktop\src-tauri\icons\sievemc-icon.svg
