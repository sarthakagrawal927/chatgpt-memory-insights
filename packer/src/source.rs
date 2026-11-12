use std::fs::Metadata;
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Identity and timestamps captured from the validated file used to parse a
/// transcript. `session_id` is internal receipt filtering metadata.
#[derive(Clone, Debug, Serialize)]
pub struct SourceFile {
    pub path: PathBuf,
    pub device: u64,
    pub inode: u64,
    pub size: i64,
    #[serde(rename = "modifiedSeconds")]
    pub modified_seconds: i64,
    #[serde(rename = "modifiedNanoseconds")]
    pub modified_nanoseconds: i64,
    #[serde(rename = "changedSeconds")]
    pub changed_seconds: i64,
    #[serde(rename = "changedNanoseconds")]
    pub changed_nanoseconds: i64,
    #[serde(skip)]
    pub session_id: String,
}

impl SourceFile {
    pub fn from_metadata(path: &Path, metadata: &Metadata, session_id: String) -> Self {
        let path = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
        #[cfg(unix)]
        let (
            device,
            inode,
            modified_seconds,
            modified_nanoseconds,
            changed_seconds,
            changed_nanoseconds,
        ) = (
            metadata.dev(),
            metadata.ino(),
            metadata.mtime(),
            metadata.mtime_nsec(),
            metadata.ctime(),
            metadata.ctime_nsec(),
        );
        // Non-Unix receipts retain the schema, using zero for unavailable Unix
        // device/inode and ctime fields. Creation time is not Unix change time.
        #[cfg(not(unix))]
        let (
            device,
            inode,
            modified_seconds,
            modified_nanoseconds,
            changed_seconds,
            changed_nanoseconds,
        ) = {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok());
            (
                0,
                0,
                modified.map_or(0, |time| time.as_secs() as i64),
                modified.map_or(0, |time| time.subsec_nanos() as i64),
                0,
                0,
            )
        };
        Self {
            path,
            device,
            inode,
            size: metadata.len() as i64,
            modified_seconds,
            modified_nanoseconds,
            changed_seconds,
            changed_nanoseconds,
            session_id,
        }
    }
}
