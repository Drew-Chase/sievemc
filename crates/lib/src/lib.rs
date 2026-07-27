pub mod fabric;
pub mod forge;

#[derive(thiserror::Error, Debug)]
pub enum SieveError {
    #[error(transparent)]
    IOError(#[from] std::io::Error),
    #[error("Missing schema property: {0}")]
    MissingSchemaProperty(String),
    #[error(transparent)]
    DeserializationError(#[from] serde_json::Error),
    #[error(transparent)]
    ZipError(#[from] zip::result::ZipError),
}

#[derive(Debug, Eq, PartialEq, Clone)]
pub enum Side {
    ClientOnly,
    ServerOnly,
    ClientAndServer,
}
