//! Optional "Open with" registration for the portable Windows build.
//!
//! A portable exe has no installer, so Windows doesn't know it can open
//! Markdown files. `register()` adds Mowl to the "Open with" list of `.md`,
//! `.markdown` and `.mdx` (per-user, under HKCU — no admin rights); `unregister()`
//! removes its entries again. Windows never lets a program make itself the
//! *default* — the user still picks "Always" in the Open-with dialog once.
//!
//! The registration proper is a ProgID (`Mowl.Markdown`) listed under each
//! extension's `OpenWithProgids`. An `Applications\<exe>` key is written on top
//! for the friendly name, but only as a best effort: on some machines that
//! parent key is admin-only (created by an elevated installer) and a normal
//! user cannot add to it.
//!
//! On other platforms the feature is reported as unavailable.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct OpenWithStatus {
    /// Only Windows has this feature.
    pub available: bool,
    /// Registered, and pointing at the running executable.
    pub registered: bool,
}

#[cfg(windows)]
mod imp {
    use std::io;
    use std::path::{Path, PathBuf};

    use anyhow::Context;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    use super::OpenWithStatus;

    const PROG_ID: &str = "Mowl.Markdown";
    const EXTENSIONS: [&str; 3] = [".md", ".markdown", ".mdx"];

    fn hkcu() -> RegKey {
        RegKey::predef(HKEY_CURRENT_USER)
    }

    fn command_line(exe: &Path) -> String {
        format!("\"{}\" \"%1\"", exe.display())
    }

    /// The executable inside a `"C:\path\mowl.exe" "%1"` command line.
    fn command_exe(command: &str) -> Option<PathBuf> {
        let rest = command.trim().strip_prefix('"')?;
        Some(PathBuf::from(&rest[..rest.find('"')?]))
    }

    /// Executable launched by the `shell\open\command` under `key_path`.
    fn open_command_exe(root: &RegKey, key_path: &str) -> Option<PathBuf> {
        let key = root
            .open_subkey(format!(r"{key_path}\shell\open\command"))
            .ok()?;
        command_exe(&key.get_value::<String, _>("").ok()?)
    }

    /// Executable the Markdown ProgID currently launches, if registered.
    fn registered_exe(root: &RegKey) -> Option<PathBuf> {
        open_command_exe(root, &format!(r"Software\Classes\{PROG_ID}"))
    }

    fn app_key_path(name: &str) -> String {
        format!(r"Software\Classes\Applications\{name}")
    }

    fn same_path(a: &Path, b: &Path) -> bool {
        a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy())
    }

    fn file_name(exe: &Path) -> anyhow::Result<String> {
        exe.file_name()
            .and_then(|n| n.to_str())
            .map(str::to_string)
            .context("executable has no file name")
    }

    fn ignore_missing(res: io::Result<()>) -> io::Result<()> {
        match res {
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            other => other,
        }
    }

    /// Delete `Applications\<name>` — but only if it launches one of `owners`,
    /// so an entry made by someone else (an installer, Scoop) is never touched.
    /// Best effort: the parent key may not be writable.
    fn remove_app_key(root: &RegKey, name: &str, owners: &[&Path]) {
        let path = app_key_path(name);
        if let Some(target) = open_command_exe(root, &path) {
            if owners.iter().any(|o| same_path(o, &target)) {
                let _ = root.delete_subkey_all(path);
            }
        }
    }

    /// Best effort: friendly name + supported types under `Applications\<exe>`.
    fn write_app_key(root: &RegKey, app_exe: &str, command: &str) -> io::Result<()> {
        let (app, _) = root.create_subkey(app_key_path(app_exe))?;
        app.set_value("FriendlyAppName", &"Mowl")?;
        let (open, _) = app.create_subkey(r"shell\open\command")?;
        open.set_value("", &command)?;
        let (supported, _) = app.create_subkey("SupportedTypes")?;
        for ext in EXTENSIONS {
            supported.set_value(ext, &"")?;
        }
        Ok(())
    }

    pub fn status() -> OpenWithStatus {
        let registered = match (registered_exe(&hkcu()), std::env::current_exe()) {
            (Some(reg), Ok(exe)) => same_path(&reg, &exe),
            _ => false,
        };
        OpenWithStatus {
            available: true,
            registered,
        }
    }

    pub fn register() -> anyhow::Result<OpenWithStatus> {
        let root = hkcu();
        let exe = std::env::current_exe()?;
        let app_exe = file_name(&exe)?;
        let command = command_line(&exe);

        // A copy that was moved or renamed leaves its Applications\<name> key
        // behind; drop it so the "Open with" list doesn't grow stale entries.
        if let Some(old) = registered_exe(&root) {
            if let Ok(old_name) = file_name(&old) {
                remove_app_key(&root, &old_name, &[&old]);
            }
        }

        let (prog, _) = root
            .create_subkey(format!(r"Software\Classes\{PROG_ID}"))
            .context("create the Markdown file type")?;
        prog.set_value("", &"Mowl Markdown Document")?;
        let (icon, _) = prog.create_subkey("DefaultIcon")?;
        icon.set_value("", &format!("\"{}\",0", exe.display()))?;
        let (open, _) = prog.create_subkey(r"shell\open\command")?;
        open.set_value("", &command)?;

        for ext in EXTENSIONS {
            let (ids, _) = root
                .create_subkey(format!(r"Software\Classes\{ext}\OpenWithProgids"))
                .with_context(|| format!("add Mowl to the {ext} \"Open with\" list"))?;
            ids.set_value(PROG_ID, &"")?;
        }

        let _ = write_app_key(&root, &app_exe, &command);
        Ok(status())
    }

    pub fn unregister() -> anyhow::Result<OpenWithStatus> {
        let root = hkcu();
        let exe = std::env::current_exe()?;
        let old = registered_exe(&root);

        for ext in EXTENSIONS {
            if let Ok(ids) = root.open_subkey_with_flags(
                format!(r"Software\Classes\{ext}\OpenWithProgids"),
                KEY_WRITE,
            ) {
                ignore_missing(ids.delete_value(PROG_ID))?;
            }
        }
        ignore_missing(root.delete_subkey_all(format!(r"Software\Classes\{PROG_ID}")))?;

        let mut owners: Vec<&Path> = vec![&exe];
        if let Some(old) = old.as_deref() {
            owners.push(old);
        }
        for owner in owners.clone() {
            if let Ok(name) = file_name(owner) {
                remove_app_key(&root, &name, &owners);
            }
        }
        Ok(status())
    }

    /// The exe was moved (portable, so it happens): if the registration points
    /// at a file that no longer exists, re-point it at this copy. A registration
    /// whose target still exists belongs to another copy and is left alone.
    pub fn repair_stale() {
        let Some(old) = registered_exe(&hkcu()) else { return };
        let Ok(exe) = std::env::current_exe() else { return };
        if !same_path(&old, &exe) && !old.exists() {
            let _ = register();
        }
    }
}

#[cfg(windows)]
pub use imp::{register, repair_stale, status, unregister};

#[cfg(not(windows))]
pub fn status() -> OpenWithStatus {
    OpenWithStatus {
        available: false,
        registered: false,
    }
}

#[cfg(not(windows))]
pub fn register() -> anyhow::Result<OpenWithStatus> {
    anyhow::bail!("\"Open with\" registration is only available on Windows")
}

#[cfg(not(windows))]
pub fn unregister() -> anyhow::Result<OpenWithStatus> {
    register()
}

#[cfg(not(windows))]
pub fn repair_stale() {}
