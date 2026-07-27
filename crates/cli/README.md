# sievemc_cli

Command-line tool for scanning a directory of Minecraft mod JARs and filtering them by side — client-only, server-only, or both. Output can be printed to the terminal, copied into directories, or written to zip archives.

## Installation

```sh
cargo install sievemc_cli
```

Or build from source:

```sh
git clone https://github.com/drew-chase/sievemc
cd sievemc
cargo build --release -p sievemc_cli
```

## Usage

```
sievemc_cli [OPTIONS] <INPUT>
```

`<INPUT>` is the path to the directory containing mod JARs. The directory is **not** scanned recursively.

## Options

| Flag            | Short | Values                             | Default    | Description                                          |
|-----------------|-------|------------------------------------|------------|------------------------------------------------------|
| `--output-type` |       | `terminal`, `directory`, `archive` | `terminal` | How results are output                               |
| `--output`      | `-o`  | path                               | —          | Output path (required for `directory` and `archive`) |
| `--side`        | `-s`  | `client`, `server`, `both`         | `both`     | Which side to include                                |

## Output modes

### `terminal` (default)

Prints a column-aligned table of mod paths and their detected sides to stdout. No `--output` path needed.

```sh
sievemc_cli /path/to/mods
```

Example output:

```
"sodium.jar"       ClientOnly
"lithium.jar"      ClientAndServer
"spark.jar"        ClientAndServer
```

Filter to one side:

```sh
sievemc_cli --side client /path/to/mods
```

### `directory`

Copies mod JARs into subdirectories at the output path.

- `--side both` creates `<output>/client/` and `<output>/server/` subdirectories; mods that run on both sides are copied into both.
- `--side client` or `--side server` copies matching mods directly into `<output>/`.

```sh
# Split into client/ and server/ subdirectories
sievemc_cli --output-type directory --output ./out --side both /path/to/mods

# Client mods only, flat output
sievemc_cli --output-type directory --output ./client-mods --side client /path/to/mods
```

### `archive`

Writes mod JARs into zip archives at the output path.

- `--side both` creates `<output>/client.zip` and `<output>/server.zip`; mods that run on both sides appear in both archives.
- `--side client` or `--side server` writes a single zip to `<output>`.

```sh
# Separate client.zip and server.zip
sievemc_cli --output-type archive --output ./dist --side both /path/to/mods

# Server archive only
sievemc_cli --output-type archive --output ./server-mods.zip --side server /path/to/mods
```

## Logging

The CLI uses [`tracing`](https://docs.rs/tracing) with all levels enabled (`TRACE` through `ERROR`). To quiet the output, set `RUST_LOG`:

```sh
RUST_LOG=warn sievemc_cli /path/to/mods
```

## Supported mod loaders

Fabric, NeoForge, and Forge. See the [library README](../lib/README.md) for detection details.
