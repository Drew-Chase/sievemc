use crate::{Side, SieveError};
use serde::de::Error as _;
use std::fs::File;
use std::path::Path;

pub fn get_modfile_side(file: impl AsRef<Path>) -> Result<Side, SieveError> {
    let file = file.as_ref();
    let mut archive = zip::ZipArchive::new(File::open(file)?)?;
    let entry = archive.by_name("fabric.mod.json")?;
    let contents: serde_json::Value = serde_json::from_reader(entry)?;
    let side = get_schema_side(contents)?;
    Ok(side)
}

fn get_schema_side(schema: serde_json::Value) -> Result<Side, SieveError> {
    let entrypoints = schema
        .get("entrypoints")
        .ok_or_else(|| SieveError::MissingSchemaProperty("entrypoints".to_string()))?;

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

    let mut client = entrypoints.contains(&"client");
    let mut server = entrypoints.contains(&"server");
    if entrypoints.contains(&"main") {
        client = true;
        server = true;
    }

    if let Some(environment) = schema.get("environment").and_then(|v| v.as_str()) {
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
            _ => {}
        }
    }

    match (client, server) {
        (true, true) => Ok(Side::ClientAndServer),
        (true, false) => Ok(Side::ClientOnly),
        (false, true) => Ok(Side::ServerOnly),
        (false, false) => Err(SieveError::MissingSchemaProperty("entrypoints".to_string())),
    }
}

mod test {
    #[test]
    fn client_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_clientonly.jar");
        let side = get_modfile_side(path).unwrap();
        assert_eq!(side, Side::ClientOnly);
    }
    #[test]
    fn server_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_serveronly.jar");
        let side = get_modfile_side(path).unwrap();
        assert_eq!(side, Side::ServerOnly);
    }
    #[test]
    fn client_server_side() {
        use super::*;
        let path = Path::new("../../examples/fabric_client_server.jar");
        let side = get_modfile_side(path).unwrap();
        assert_eq!(side, Side::ClientAndServer);
    }
}
