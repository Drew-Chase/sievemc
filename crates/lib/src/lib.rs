use rayon::prelude::*;
use serde::de::Error as _;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::str::from_utf8;
use tracing::{debug, info, trace, warn};

#[derive(thiserror::Error, Debug)]
pub enum SieveError {
    #[error(transparent)]
    IOError(#[from] std::io::Error),
    #[error("Missing schema property: {0}")]
    MissingSchemaProperty(String),
    #[error("{0} missing schema property: {1}")]
    FileMissingSchemaProperty(PathBuf, String),
    #[error("{0} missing schema property: {1}")]
    FileMissingEntry(PathBuf, String),
    #[error(transparent)]
    DeserializationError(#[from] serde_json::Error),
    #[error(transparent)]
    ZipError(#[from] zip::result::ZipError),
    #[error(transparent)]
    Utf8Error(#[from] std::str::Utf8Error),
    #[error(transparent)]
    TomlError(#[from] toml::de::Error),
}

#[derive(Debug, Eq, PartialEq, Clone)]
pub enum Side {
    ClientOnly,
    ServerOnly,
    ClientAndServer,
}

const DEFAULT_MULTITHREAD_THRESHOLD: u8 = 10;
pub(crate) fn multithread_threashold() -> u8 {
    option_env!("SIEVEMC_MULTITHREAD_THREASHOLD")
        .map(|s| s.parse().unwrap_or(DEFAULT_MULTITHREAD_THRESHOLD))
        .unwrap_or(DEFAULT_MULTITHREAD_THRESHOLD)
}

pub fn get_many_mod_file_sides(
    directory: impl AsRef<Path>,
) -> Result<HashMap<PathBuf, Side>, SieveError> {
    let directory = directory.as_ref();
    info!("Scanning directory: {}", directory.display());

    let files: Vec<PathBuf> = std::fs::read_dir(directory)?
        .filter_map(|f| {
            if let Ok(f) = f {
                Some(f.path())
            } else {
                warn!("Failed to read directory entry, skipping");
                None
            }
        })
        .collect();

    debug!("Found {} files in directory", files.len());

    let threshold = multithread_threashold() as usize;
    let use_multithread = files.len() > threshold;
    trace!(
        "Multithread threshold: {}, use_multithread: {}",
        threshold,
        use_multithread
    );

    let sides = if use_multithread {
        info!("Using parallel processing for {} files", files.len());
        files
            .into_par_iter()
            .filter_map(|file| {
                trace!("Processing file (parallel): {}", file.display());
                match get_mod_file_side(&file) {
                    Ok(side) => {
                        debug!("Detected side {:?} for {}", side, file.display());
                        Some((file, side))
                    }
                    Err(e) => {
                        warn!("Skipping {}: {}", file.display(), e);
                        None
                    }
                }
            })
            .collect::<HashMap<_, _>>()
    } else {
        let mut sides: HashMap<PathBuf, Side> = HashMap::new();
        for file in files {
            trace!("Processing file: {}", file.display());
            let side = get_mod_file_side(&file).map_err(|e| match e {
                SieveError::MissingSchemaProperty(property) => {
                    SieveError::FileMissingSchemaProperty(file.clone(), property)
                }
                _ => e,
            })?;
            debug!("Detected side {:?} for {}", side, file.display());
            sides.insert(file, side);
        }
        sides
    };

    info!("Successfully processed {} mod files", sides.len());
    Ok(sides)
}

pub fn get_mod_file_side(file: impl AsRef<Path>) -> Result<Side, SieveError> {
    let file = file.as_ref();
    debug!("Inspecting mod file: {}", file.display());

    let mut archive = zip::ZipArchive::new(File::open(file)?)?;

    if let Ok(entry) = archive.by_name("fabric.mod.json") {
        trace!("Found fabric.mod.json in {}", file.display());
        let contents: serde_json::Value = serde_json::from_reader(entry)?;
        let side = get_json_schema_side(contents)?;
        info!("Fabric mod {}: {:?}", file.display(), side);
        Ok(side)
    } else if let Some(buf) = read_archive_entry(&mut archive, "META-INF/neoforge.mods.toml")
        .or_else(|| read_archive_entry(&mut archive, "neoforge.mods.toml"))
    {
        trace!("Found neoforge.mods.toml in {}", file.display());
        let value: toml::Value = toml::from_str(from_utf8(&buf)?)?;
        let side = get_loader_toml_side(value, "neoforge")?;
        info!("NeoForge mod {}: {:?}", file.display(), side);
        Ok(side)
    } else if let Some(buf) = read_archive_entry(&mut archive, "META-INF/mods.toml")
        .or_else(|| read_archive_entry(&mut archive, "mods.toml"))
    {
        trace!("Found mods.toml in {}", file.display());
        let value: toml::Value = toml::from_str(from_utf8(&buf)?)?;
        let side = get_loader_toml_side(value, "forge")?;
        info!("Forge mod {}: {:?}", file.display(), side);
        Ok(side)
    } else {
        warn!(
            "No recognized mod manifest found in {}",
            file.display()
        );
        Err(SieveError::FileMissingEntry(
            file.to_path_buf(),
            "fabric.mod.json, neoforge.mods.toml, or mods.toml".to_string(),
        ))
    }
}

fn read_archive_entry(archive: &mut zip::ZipArchive<File>, name: &str) -> Option<Vec<u8>> {
    let mut entry = archive.by_name(name).ok()?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).ok().map(|_| buf)
}

fn get_loader_toml_side(contents: toml::Value, loader: &str) -> Result<Side, SieveError> {
    let mod_id = contents
        .get("mods")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|m| m.get("modId"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| SieveError::MissingSchemaProperty("mods[0].modId".to_string()))?;

    trace!("Resolving side for mod_id={mod_id} loader={loader}");

    let side_str = contents
        .get("dependencies")
        .and_then(|v| v.get(mod_id))
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|dep| dep.get("modId").and_then(|v| v.as_str()) == Some(loader))
        })
        .and_then(|dep| dep.get("side"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            SieveError::MissingSchemaProperty(format!("dependencies.{mod_id}[{loader}].side"))
        })?;

    debug!("Side string for {mod_id}: \"{side_str}\"");

    match side_str.to_uppercase().as_str() {
        "BOTH" => Ok(Side::ClientAndServer),
        "CLIENT" => Ok(Side::ClientOnly),
        "SERVER" => Ok(Side::ServerOnly),
        _ => {
            warn!("Unknown side value \"{side_str}\" for {mod_id} ({loader})");
            Err(SieveError::MissingSchemaProperty(format!(
                "dependencies.{mod_id}[{loader}].side (unknown value: {side_str})"
            )))
        }
    }
}

fn get_json_schema_side(schema: serde_json::Value) -> Result<Side, SieveError> {
    let mut client = false;
    let mut server = false;

    if let Some(entrypoints) = schema.get("entrypoints") {
        let entrypoints: Vec<&str> = entrypoints
            .as_object()
            .ok_or_else(|| {
                SieveError::DeserializationError(serde_json::error::Error::custom(
                    "Failed to deserialize entrypoints as object",
                ))
            })?
            .keys()
            .map(String::as_str)
            .collect();

        trace!("Fabric entrypoints: {:?}", entrypoints);

        client = entrypoints.contains(&"client");
        server = entrypoints.contains(&"server");
        if entrypoints.contains(&"main") {
            debug!("Found \"main\" entrypoint — treating as client+server");
            client = true;
            server = true;
        }
    }

    if let Some(environment) = schema.get("environment").and_then(|v| v.as_str()) {
        debug!("Fabric environment field: \"{environment}\"");
        match environment {
            "*" => {
                client = true;
                server = true;
            }
            "client" => {
                client = true;
                server = false;
            }
            "server" => {
                client = false;
                server = true;
            }
            _ => {
                warn!("Unknown environment value: \"{environment}\"");
            }
        }
    }

    match (client, server) {
        (true, true) => Ok(Side::ClientAndServer),
        (true, false) => Ok(Side::ClientOnly),
        (false, true) => Ok(Side::ServerOnly),
        (false, false) => {
            warn!("Could not determine side: no entrypoints or environment field resolved");
            Err(SieveError::MissingSchemaProperty(
                "entrypoints or environment".to_string(),
            ))
        }
    }
}

mod test {
    #[test]
    fn client_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_clientonly.jar");
        let side = get_mod_file_side(path).unwrap();
        assert_eq!(side, Side::ClientOnly);
    }
    #[test]
    fn server_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_serveronly.jar");
        let side = get_mod_file_side(path).unwrap();
        assert_eq!(side, Side::ServerOnly);
    }
    #[test]
    fn client_server_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_client_server.jar");
        let side = get_mod_file_side(path).unwrap();
        assert_eq!(side, Side::ClientAndServer);
    }
}

#[cfg(test)]
mod neoforge_test {
    use super::*;

    fn parse_side(toml_str: &str, loader: &str) -> Result<Side, SieveError> {
        let value: toml::Value = toml::from_str(toml_str)?;
        get_loader_toml_side(value, loader)
    }

    #[test]
    fn neoforge_both_side() {
        let toml = r#"
modLoader="javafml"
[[mods]]
    modId="advanced_ae"
[[dependencies.advanced_ae]]
modId="neoforge"
type="required"
side="BOTH"
[[dependencies.advanced_ae]]
modId="minecraft"
type="required"
side="BOTH"
"#;
        assert_eq!(parse_side(toml, "neoforge").unwrap(), Side::ClientAndServer);
    }

    #[test]
    fn neoforge_client_side() {
        let toml = r#"
modLoader="javafml"
[[mods]]
modId="appleskin"
[[dependencies.appleskin]]
    modId="neoforge"
    type="required"
    side="CLIENT"
"#;
        assert_eq!(parse_side(toml, "neoforge").unwrap(), Side::ClientOnly);
    }

    #[test]
    fn forge_both_side() {
        let toml = r#"
modLoader="javafml"
[[mods]]
modId="xaerominimap"
[[dependencies.xaerominimap]]
modId="forge"
mandatory=true
side="BOTH"
[[dependencies.xaerominimap]]
modId="minecraft"
mandatory=true
side="BOTH"
"#;
        assert_eq!(parse_side(toml, "forge").unwrap(), Side::ClientAndServer);
    }
}
