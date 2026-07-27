use clap::Parser;
use std::fs::File;
use std::path::PathBuf;
use tracing::{debug, error, info, trace, warn};

#[derive(clap::Parser)]
#[clap(author, version, about)]
struct Arguments {
    /// How the output is stored.
    #[arg(long, value_enum, default_value_t = OutputType::Terminal)]
    pub output_type: OutputType,
    /// If the output type is set to `archive` or `directory`, this will be the output path.
    #[arg(
        short,
        long,
        required_if_eq("output_type", "directory"),
        required_if_eq("output_type", "archive")
    )]
    pub output: Option<PathBuf>,
    /// The side that we care about, if both, two outputs are created.
    #[arg(short, long, value_enum, default_value_t = Side::Both)]
    pub side: Side,
    /// The directory containing the mod jars.  This will NOT search recursively.
    pub input: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, clap::ValueEnum)]
enum OutputType {
    Directory,
    Terminal,
    Archive,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, clap::ValueEnum)]
enum Side {
    Client,
    Server,
    Both,
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;
    tracing_subscriber::fmt::fmt()
        .with_max_level(tracing::Level::TRACE)
        .init();
    let args = Arguments::parse();

    info!(
        input = %args.input,
        output_type = ?args.output_type,
        side = ?args.side,
        "Starting sievemc"
    );

    let files = sievemc::get_many_mod_file_sides(args.input)?;
    if files.is_empty() {
        error!("No mod files exist in the input directory");
        std::process::exit(1);
    }

    info!("Detected {} mod files", files.len());

    match args.output_type {
        OutputType::Directory => {
            if let Some(path) = args.output {
                debug!(path = %path.display(), "Creating output directory");
                std::fs::create_dir_all(&path)?;
                if args.side == Side::Both {
                    let client_dir = path.join("client");
                    let server_dir = path.join("server");
                    debug!(
                        client = %client_dir.display(),
                        server = %server_dir.display(),
                        "Creating client/server subdirectories"
                    );
                    std::fs::create_dir_all(&client_dir)?;
                    std::fs::create_dir_all(&server_dir)?;
                    for (file, side) in files {
                        let filename = file.file_name().expect("Unable to get filename").to_string_lossy().to_string();
                        trace!(file = %file.display(), side = ?side, "Processing file");
                        if side == sievemc::Side::ClientOnly
                            || side == sievemc::Side::ClientAndServer
                        {
                            let dest = client_dir.join(&filename);
                            debug!(src = %file.display(), dest = %dest.display(), "Copying to client dir");
                            std::fs::copy(&file, dest)?;
                        }
                        if side == sievemc::Side::ServerOnly
                            || side == sievemc::Side::ClientAndServer
                        {
                            let dest = server_dir.join(&filename);
                            debug!(src = %file.display(), dest = %dest.display(), "Copying to server dir");
                            std::fs::copy(&file, dest)?;
                        }
                    }
                } else if args.side == Side::Client {
                    for (file, side) in files {
                        trace!(file = %file.display(), side = ?side, "Processing file");
                        if side == sievemc::Side::ClientOnly
                            || side == sievemc::Side::ClientAndServer
                        {
                            let dest = path.join(&file);
                            debug!(src = %file.display(), dest = %dest.display(), "Copying client mod");
                            std::fs::copy(&file, dest)?;
                        } else {
                            warn!(file = %file.display(), side = ?side, "Skipping non-client mod");
                        }
                    }
                } else if args.side == Side::Server {
                    for (file, side) in files {
                        trace!(file = %file.display(), side = ?side, "Processing file");
                        if side == sievemc::Side::ServerOnly
                            || side == sievemc::Side::ClientAndServer
                        {
                            let dest = path.join(&file);
                            debug!(src = %file.display(), dest = %dest.display(), "Copying server mod");
                            std::fs::copy(&file, dest)?;
                        } else {
                            warn!(file = %file.display(), side = ?side, "Skipping non-server mod");
                        }
                    }
                }
                info!(path = %path.display(), "Directory output complete");
            }
        }
        OutputType::Archive => {
            if let Some(path) = args.output {
                std::fs::create_dir_all(&path)?;
                let write_entry =
                    |writer: &mut zip::ZipWriter<File>, file: &PathBuf| -> color_eyre::Result<()> {
                        let options = zip::write::SimpleFileOptions::default()
                            .compression_method(zip::CompressionMethod::Stored);
                        let name = file
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| file.to_string_lossy().to_string());
                        trace!(file = %file.display(), entry = %name, "Writing zip entry");
                        writer.start_file(name, options)?;
                        let mut file_reader = File::open(file)?;
                        std::io::copy(&mut file_reader, writer)?;
                        Ok(())
                    };

                if args.side == Side::Both {
                    let client_zip = path.join("client.zip");
                    let server_zip = path.join("server.zip");
                    debug!(client = %client_zip.display(), server = %server_zip.display(), "Creating archives");
                    let mut client_writer = zip::ZipWriter::new(File::create(&client_zip)?);
                    let mut server_writer = zip::ZipWriter::new(File::create(&server_zip)?);
                    for (file, side) in &files {
                        trace!(file = %file.display(), side = ?side, "Processing file for archive");
                        if *side == sievemc::Side::ClientOnly
                            || *side == sievemc::Side::ClientAndServer
                        {
                            debug!(file = %file.display(), "Adding to client archive");
                            write_entry(&mut client_writer, file)?;
                        }
                        if *side == sievemc::Side::ServerOnly
                            || *side == sievemc::Side::ClientAndServer
                        {
                            debug!(file = %file.display(), "Adding to server archive");
                            write_entry(&mut server_writer, file)?;
                        }
                    }
                    client_writer.finish()?;
                    server_writer.finish()?;
                    info!(client = %client_zip.display(), server = %server_zip.display(), "Archive output complete");
                } else if args.side == Side::Client {
                    debug!(path = %path.display(), "Creating client archive");
                    let mut writer = zip::ZipWriter::new(File::create(&path)?);
                    for (file, side) in &files {
                        trace!(file = %file.display(), side = ?side, "Processing file for archive");
                        if *side == sievemc::Side::ClientOnly
                            || *side == sievemc::Side::ClientAndServer
                        {
                            debug!(file = %file.display(), "Adding to client archive");
                            write_entry(&mut writer, file)?;
                        } else {
                            warn!(file = %file.display(), side = ?side, "Skipping non-client mod");
                        }
                    }
                    writer.finish()?;
                    info!(path = %path.display(), "Client archive complete");
                } else if args.side == Side::Server {
                    debug!(path = %path.display(), "Creating server archive");
                    let mut writer = zip::ZipWriter::new(File::create(&path)?);
                    for (file, side) in &files {
                        trace!(file = %file.display(), side = ?side, "Processing file for archive");
                        if *side == sievemc::Side::ServerOnly
                            || *side == sievemc::Side::ClientAndServer
                        {
                            debug!(file = %file.display(), "Adding to server archive");
                            write_entry(&mut writer, file)?;
                        } else {
                            warn!(file = %file.display(), side = ?side, "Skipping non-server mod");
                        }
                    }
                    writer.finish()?;
                    info!(path = %path.display(), "Server archive complete");
                }
            }
        }
        OutputType::Terminal => {
            debug!(side = ?args.side, "Filtering mods for terminal output");
            let filtered: Vec<_> = files
                .iter()
                .filter(|(_, side)| match args.side {
                    Side::Both => true,
                    Side::Client => {
                        **side == sievemc::Side::ClientOnly
                            || **side == sievemc::Side::ClientAndServer
                    }
                    Side::Server => {
                        **side == sievemc::Side::ServerOnly
                            || **side == sievemc::Side::ClientAndServer
                    }
                })
                .collect();
            trace!("Filtered to {} mods for display", filtered.len());
            let max_width = filtered
                .iter()
                .map(|(p, _)| format!("{p:?}").len())
                .max()
                .unwrap_or(0);
            for (file, side) in filtered {
                println!("{:<max_width$}  {side:?}", format!("{file:?}"));
            }
        }
    }

    Ok(())
}
