# sievemc_lib

Core library for inspecting Minecraft mod JARs and determining which side they run on — client, server, or both. Supports Fabric, NeoForge, and Forge.

## Installation

```toml
[dependencies]
sievemc_lib = "0.1"
```

## Overview

Two public entry points:

- **`get_mod_file_side`** — inspect a single JAR and return its [`Side`]
- **`get_many_mod_file_sides`** — scan a directory and return a `HashMap<PathBuf, Side>` for every recognised mod JAR; automatically switches to parallel processing when the file count exceeds the threshold (default 10, overridable via `SIEVEMC_MULTITHREAD_THREASHOLD`)

## Side variants

```rust
pub enum Side {
	ClientOnly,
	ServerOnly,
	ClientAndServer,
}
```

Files that are not recognised mod JARs (no `fabric.mod.json`, `neoforge.mods.toml`, or `mods.toml` inside the archive) are skipped and return `SieveError::FileMissingEntry`.

## Examples

### Inspect a single JAR

```rust
use sievemc::{get_mod_file_side, Side};

let side = get_mod_file_side("mods/sodium.jar") ?;
match side {
Side::ClientOnly      => println!("client-only"),
Side::ServerOnly      => println!("server-only"),
Side::ClientAndServer => println!("both sides"),
}
```

### Scan a directory

```rust
use sievemc::{get_many_mod_file_sides, Side};

let sides = get_many_mod_file_sides("mods/") ?;
for (path, side) in & sides {
println!("{:?}  {:?}", path, side);
}
```

The scan uses [`rayon`](https://docs.rs/rayon) for parallel processing when there are more files than the threshold.

### Filtering to one side

```rust
let client_mods: Vec<_ > = sides
.iter()
.filter( | (_, side)| {
* * side == Side::ClientOnly | | ** side == Side::ClientAndServer
})
.map( | (path, _) | path)
.collect();
```

## Error handling

All fallible functions return `Result<_, SieveError>`:

```rust
pub enum SieveError {
	IOError(std::io::Error),
	MissingSchemaProperty(String),
	FileMissingSchemaProperty(PathBuf, String),
	FileMissingEntry(PathBuf, String),
	DeserializationError(serde_json::Error),
	ZipError(zip::result::ZipError),
	Utf8Error(std::str::Utf8Error),
	TomlError(toml::de::Error),
}
```

## Detection logic

### Fabric (`fabric.mod.json`)

1. If an `environment` field is present: `"*"` → both, `"client"` → client, `"server"` → server.
2. Otherwise the `entrypoints` object keys are checked: presence of `"client"` and/or `"server"` sets the respective side; presence of `"main"` implies both.

### NeoForge / Forge (`*.mods.toml`)

Reads `dependencies.<modId>[].side` for the entry whose `modId` matches the loader name (`"neoforge"` or `"forge"`). Values are `"BOTH"`, `"CLIENT"`, or `"SERVER"` (case-insensitive).

## Environment variable

| Variable                         | Default | Description                                        |
|----------------------------------|---------|----------------------------------------------------|
| `SIEVEMC_MULTITHREAD_THREASHOLD` | `10`    | File count above which parallel processing is used |
