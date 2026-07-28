set windows-shell := ["powershell.exe", "-NoProfile", "-NoLogo", "-Command"]
set shell := ["bash", "-c"]

default:
    @just --list

[windows]
dist: build
    @New-Item -Type Directory target/dist -Force
    @Write-Host "Zipping Desktop"
    @Compress-Archive -Path target/release/sievemc.exe -DestinationPath target/dist/desktop.zip -Force
    @Write-Host "Zipping CLI"
    @Move-Item target/release/sievemc_cli.exe target/release/sievemc.exe -Force
    @Compress-Archive -Path target/release/sievemc.exe -DestinationPath target/dist/cli.zip -Force

build:
    @cargo build --workspace --release

clean:
    @cargo clean

cli args:
    @cargo run --package sievemc_cli -q -- {{ args }}

help:
    @cargo run --package sievemc_cli -q -- --help

gen-icon:
    @cargo tauri icon .\crates\desktop\src-tauri\icons\sievemc-icon.svg
