# sievemc

A Rust workspace for detecting and filtering Minecraft mod JARs by side — client-only, server-only, or both. Supports Fabric, NeoForge, and Forge mod formats.

## Workspace crates

| Crate                                 | Description                                                                                            |
|---------------------------------------|--------------------------------------------------------------------------------------------------------|
| [`sievemc_lib`](crates/lib/README.md) | Core library — inspect a mod JAR and determine its side                                                |
| [`sievemc_cli`](crates/cli/README.md) | Command-line tool — scan a directory and output results to the terminal, a directory, or a zip archive |

## Supported mod loaders

| Loader   | Detection method                                                                              |
|----------|-----------------------------------------------------------------------------------------------|
| Fabric   | `fabric.mod.json` — `environment` field and/or `entrypoints` keys                             |
| NeoForge | `META-INF/neoforge.mods.toml` or `neoforge.mods.toml` — `dependencies.<modId>[neoforge].side` |
| Forge    | `META-INF/mods.toml` or `mods.toml` — `dependencies.<modId>[forge].side`                      |

## Quickstart

```sh
# Print all mods with their detected side
sievemc_cli /path/to/mods

# Copy client-only mods to a directory
sievemc_cli --output-type directory --output ./out --side client /path/to/mods

# Create separate client.zip and server.zip
sievemc_cli --output-type archive --output ./out --side both /path/to/mods
```
