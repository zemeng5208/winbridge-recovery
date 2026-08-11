using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("WinBridge Recovery Setup")]
[assembly: AssemblyDescription("Testing stage. Authorized recipients may test and perform secondary development. https://github.com/zemeng5208")]
[assembly: AssemblyCompany("https://github.com/zemeng5208")]
[assembly: AssemblyProduct("WinBridge Recovery")]
[assembly: AssemblyVersion("3.1.0.0")]
[assembly: AssemblyFileVersion("3.1.0.0")]

namespace WinBridgeSetup
{
    internal static class InstallEngine
    {
        internal const string ProductFolder = "WinBridge-Recovery";
        internal const string BackupFolder = "CodexPluginRepairBackups";
        internal const string RegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\WinBridgeRecovery";

        internal static string DefaultInstallRoot()
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "WinBridge");
        }

        internal static string DefaultBackupRoot(string installRoot)
        {
            try
            {
                DriveInfo drive = new DriveInfo("D:\\");
                if (drive.IsReady) return Path.Combine(drive.RootDirectory.FullName, BackupFolder);
            }
            catch
            {
            }
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "WinBridgeData",
                BackupFolder);
        }

        internal static void ExistingInstallationPaths(out string installRoot, out string backupRoot)
        {
            installRoot = string.Empty;
            backupRoot = string.Empty;
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RegistryPath, false))
                {
                    if (key != null) installRoot = Convert.ToString(key.GetValue("InstallLocation"));
                }
            }
            catch
            {
                installRoot = string.Empty;
            }

            if (string.IsNullOrWhiteSpace(installRoot)) return;
            try
            {
                string configDirectory = Path.Combine(installRoot, ProductFolder, "Config");
                backupRoot = ReadConfigurationValue(Path.Combine(configDirectory, "storage.ini"), "backup_root");
                if (string.IsNullOrWhiteSpace(backupRoot))
                    backupRoot = ReadConfigurationValue(Path.Combine(configDirectory, "install-manifest.txt"), "backup_root");
            }
            catch
            {
                backupRoot = string.Empty;
            }
        }

        private static string ReadConfigurationValue(string path, string name)
        {
            if (!File.Exists(path)) return string.Empty;
            string prefix = name + "=";
            foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
                if (line.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    return line.Substring(prefix.Length).Trim();
            return string.Empty;
        }

        internal static void Install(
            string installRoot,
            string backupRoot,
            Action<int, string> progress,
            bool registerSystem)
        {
            if (Process.GetProcessesByName("WinBridgeRecovery").Length > 0)
                throw new InvalidOperationException("Close WinBridge Recovery before installing. ChatGPT itself may remain open.");

            installRoot = ValidateInstallRoot(installRoot);
            backupRoot = ValidateBackupRoot(backupRoot);
            if (PathsOverlap(installRoot, backupRoot))
                throw new InvalidOperationException("The backup folder must be outside the installation folder.");

            Directory.CreateDirectory(installRoot);
            Directory.CreateDirectory(backupRoot);
            EnsureNoReparsePoints(installRoot);
            EnsureNoReparsePoints(backupRoot);
            string resourceName = FindPayloadResource();
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
            {
                if (payload == null) throw new InvalidOperationException("Installer payload is unavailable.");
                using (ZipArchive archive = new ZipArchive(payload, ZipArchiveMode.Read, false))
                {
                    int total = Math.Max(1, archive.Entries.Count);
                    int completed = 0;
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        ExtractEntry(entry, installRoot);
                        completed++;
                        if (progress != null)
                            progress(Math.Min(88, completed * 88 / total), string.IsNullOrEmpty(entry.Name) ? "Creating folders..." : "Installing: " + entry.Name);
                    }
                }
            }

            string productRoot = Path.Combine(installRoot, ProductFolder);
            WriteStorageConfiguration(productRoot, installRoot, backupRoot);
            WriteInstallManifest(productRoot, installRoot, backupRoot);
            if (registerSystem)
            {
                CreateDesktopShortcut(productRoot);
                RegisterUninstaller(installRoot, productRoot);
            }
            if (progress != null) progress(100, "Installation completed. The desktop shortcut is ready.");
        }

        internal static string ValidateInstallRoot(string value)
        {
            return ValidateControlledPath(value, "installation");
        }

        internal static string ValidateBackupRoot(string value)
        {
            string full = ValidateControlledPath(value, "backup");
            if (!string.Equals(Path.GetFileName(full), BackupFolder, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The backup folder must be named " + BackupFolder + ".");
            return full;
        }

        private static string ValidateControlledPath(string value, string label)
        {
            if (string.IsNullOrWhiteSpace(value) || !Path.IsPathRooted(value))
                throw new InvalidOperationException("Choose an absolute " + label + " path.");
            string full = Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar);
            string root = Path.GetPathRoot(full).TrimEnd(Path.DirectorySeparatorChar);
            if (string.Equals(full, root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("A drive root cannot be used as the " + label + " folder.");
            return full;
        }

        private static bool PathsOverlap(string left, string right)
        {
            string a = left.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string b = right.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            return a.StartsWith(b, StringComparison.OrdinalIgnoreCase) || b.StartsWith(a, StringComparison.OrdinalIgnoreCase);
        }

        private static string FindPayloadResource()
        {
            foreach (string name in Assembly.GetExecutingAssembly().GetManifestResourceNames())
                if (name.EndsWith("payload.zip", StringComparison.OrdinalIgnoreCase)) return name;
            throw new InvalidOperationException("Installer payload is missing.");
        }

        private static void ExtractEntry(ZipArchiveEntry entry, string destinationRoot)
        {
            string root = Path.GetFullPath(destinationRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
            string destination = Path.GetFullPath(Path.Combine(root, relative));
            if (!destination.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The installer payload contains an invalid path.");

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(destination);
                EnsureNoReparsePoints(destination);
                return;
            }
            string parent = Path.GetDirectoryName(destination);
            if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
            EnsureNoReparsePoints(parent);
            using (Stream input = entry.Open())
            using (FileStream output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                input.CopyTo(output);
                output.Flush(true);
            }
        }

        private static void EnsureNoReparsePoints(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            string full = Path.GetFullPath(path);
            string root = Path.GetPathRoot(full);
            string current = root;
            string relative = full.Substring(root.Length);
            foreach (string part in relative.Split(new[] { Path.DirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries))
            {
                current = Path.Combine(current, part);
                if (Directory.Exists(current) &&
                    (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidOperationException("Reparse points are not allowed in installation or backup paths: " + current);
            }
        }

        private static void WriteStorageConfiguration(string productRoot, string installRoot, string backupRoot)
        {
            string configDirectory = Path.Combine(productRoot, "Config");
            Directory.CreateDirectory(configDirectory);
            string[] lines =
            {
                "# Generated by WinBridge Recovery Setup.",
                "schema=1",
                "install_root=" + installRoot,
                "backup_root=" + backupRoot,
                "generated_utc=" + DateTime.UtcNow.ToString("o")
            };
            File.WriteAllLines(Path.Combine(configDirectory, "storage.ini"), lines, new UTF8Encoding(false));
        }

        private static void WriteInstallManifest(string productRoot, string installRoot, string backupRoot)
        {
            string configDirectory = Path.Combine(productRoot, "Config");
            string[] files = Directory.GetFiles(productRoot, "*", SearchOption.AllDirectories);
            Array.Sort(files, StringComparer.OrdinalIgnoreCase);
            string[] lines = new string[files.Length + 5];
            lines[0] = "product=WinBridge Recovery";
            lines[1] = "version=3.1.0";
            lines[2] = "install_root=" + installRoot;
            lines[3] = "backup_root=" + backupRoot;
            lines[4] = "installed_utc=" + DateTime.UtcNow.ToString("o");
            for (int i = 0; i < files.Length; i++)
                lines[i + 5] = "file=" + files[i].Substring(productRoot.Length).TrimStart(Path.DirectorySeparatorChar);
            File.WriteAllLines(Path.Combine(configDirectory, "install-manifest.txt"), lines, new UTF8Encoding(false));
        }

        private static void CreateDesktopShortcut(string productRoot)
        {
            string launcher = Path.Combine(productRoot, "LauncherUI", "WinBridgeRecovery.exe");
            if (!File.Exists(launcher)) throw new FileNotFoundException("Launcher file is missing.", launcher);
            string shortcutPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "WinBridge Recovery.lnk");
            if (File.Exists(shortcutPath))
            {
                string existingTarget = ReadShortcutTarget(shortcutPath);
                if (string.IsNullOrWhiteSpace(existingTarget) ||
                    !existingTarget.StartsWith(productRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("A desktop shortcut named WinBridge Recovery.lnk already exists and is not owned by this installation.");
            }
            CreateShortcut(shortcutPath, launcher, Path.GetDirectoryName(launcher), launcher + ",0", "WinBridge Recovery");
        }

        private static string ReadShortcutTarget(string shortcutPath)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return string.Empty;
            object shell = null;
            object shortcut = null;
            try
            {
                shell = Activator.CreateInstance(shellType);
                shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                return Convert.ToString(shortcut.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, shortcut, null));
            }
            finally
            {
                if (shortcut != null && Marshal.IsComObject(shortcut)) Marshal.FinalReleaseComObject(shortcut);
                if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
            }
        }

        private static void CreateShortcut(string shortcutPath, string target, string workingDirectory, string icon, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) throw new InvalidOperationException("Windows shortcut service is unavailable.");
            object shell = null;
            object shortcut = null;
            try
            {
                shell = Activator.CreateInstance(shellType);
                shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                Type shortcutType = shortcut.GetType();
                shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { target });
                shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
                shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { icon });
                shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            finally
            {
                if (shortcut != null && Marshal.IsComObject(shortcut)) Marshal.FinalReleaseComObject(shortcut);
                if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
            }
        }

        private static void RegisterUninstaller(string installRoot, string productRoot)
        {
            string uninstaller = Path.Combine(installRoot, "Uninstall WinBridge Recovery.exe");
            if (!File.Exists(uninstaller)) throw new FileNotFoundException("Uninstaller file is missing.", uninstaller);
            string launcher = Path.Combine(productRoot, "LauncherUI", "WinBridgeRecovery.exe");
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RegistryPath))
            {
                key.SetValue("DisplayName", "WinBridge Recovery");
                key.SetValue("DisplayVersion", "3.1.0");
                key.SetValue("Publisher", "WinBridge Recovery");
                key.SetValue("InstallLocation", installRoot);
                key.SetValue("DisplayIcon", launcher + ",0");
                key.SetValue("UninstallString", "\"" + uninstaller + "\"");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }
    }

    internal sealed class SetupForm : Form
    {
        private readonly TextBox _installPath;
        private readonly TextBox _backupPath;
        private readonly Label _status;
        private readonly ProgressBar _progress;
        private readonly Button _install;
        private bool _installed;
        private bool _backupWasEdited;

        internal SetupForm(bool updateMode, string installRoot, string backupRoot)
        {
            Text = "WinBridge Recovery Setup";
            Width = 700;
            Height = 450;
            MinimumSize = new Size(700, 450);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(12, 15, 18);
            ForeColor = Color.White;
            Font = new Font("Microsoft YaHei UI", 10F);
            MaximizeBox = false;

            Controls.Add(new Label { Text = "WinBridge Recovery", Font = new Font(Font.FontFamily, 20F, FontStyle.Bold), AutoSize = true, Location = new Point(34, 26) });
            Controls.Add(new Label { Text = "A self-contained installer for Windows 11. Choose where the app and its backups are stored.", ForeColor = Color.FromArgb(182, 194, 202), AutoSize = true, Location = new Point(38, 72) });
            Controls.Add(new Label { Text = "Testing build by zemeng5208  |  github.com/zemeng5208", ForeColor = Color.FromArgb(135, 215, 180), AutoSize = true, Location = new Point(38, 92) });

            Controls.Add(new Label { Text = "Installation folder", AutoSize = true, Location = new Point(38, 116) });
            string initialInstallRoot = string.IsNullOrWhiteSpace(installRoot) ? InstallEngine.DefaultInstallRoot() : installRoot;
            string initialBackupRoot = string.IsNullOrWhiteSpace(backupRoot) ? InstallEngine.DefaultBackupRoot(initialInstallRoot) : backupRoot;
            _installPath = new TextBox { Text = initialInstallRoot, Location = new Point(40, 142), Width = 510, Height = 28, BackColor = Color.FromArgb(26, 31, 36), ForeColor = Color.White, BorderStyle = BorderStyle.FixedSingle };
            Controls.Add(_installPath);
            Button browseInstall = new Button { Text = "Browse", Location = new Point(562, 140), Width = 92, Height = 30 };
            browseInstall.Click += delegate { BrowseInstall(); };
            Controls.Add(browseInstall);

            Controls.Add(new Label { Text = "Golden backup folder", AutoSize = true, Location = new Point(38, 188) });
            _backupPath = new TextBox { Text = initialBackupRoot, Location = new Point(40, 214), Width = 510, Height = 28, BackColor = Color.FromArgb(26, 31, 36), ForeColor = Color.White, BorderStyle = BorderStyle.FixedSingle };
            _backupPath.TextChanged += delegate { if (_backupPath.Focused) _backupWasEdited = true; };
            Controls.Add(_backupPath);
            Button browseBackup = new Button { Text = "Browse", Location = new Point(562, 212), Width = 92, Height = 30 };
            browseBackup.Click += delegate { BrowseBackup(); };
            Controls.Add(browseBackup);

            Controls.Add(new Label { Text = "Existing valid backups in the selected folder are preserved and reused only after version and hash validation.", ForeColor = Color.FromArgb(135, 215, 180), AutoSize = true, Location = new Point(40, 256) });

            _status = new Label { Text = updateMode ? "Ready to update the existing installation." : "Ready to install.", ForeColor = Color.FromArgb(115, 222, 237), AutoEllipsis = true, Location = new Point(40, 292), Width = 614, Height = 24 };
            Controls.Add(_status);
            _progress = new ProgressBar { Location = new Point(40, 322), Width = 614, Height = 12, Style = ProgressBarStyle.Continuous, Minimum = 0, Maximum = 100 };
            Controls.Add(_progress);

            _install = new Button { Text = updateMode ? "Update" : "Install", Location = new Point(534, 354), Width = 120, Height = 38, BackColor = Color.FromArgb(40, 182, 136), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            _install.FlatAppearance.BorderSize = 0;
            _install.Click += delegate { if (_installed) Close(); else InstallNow(); };
            Controls.Add(_install);
        }

        private void BrowseInstall()
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Choose the WinBridge Recovery installation folder";
                dialog.SelectedPath = Directory.Exists(_installPath.Text) ? _installPath.Text : Path.GetDirectoryName(_installPath.Text);
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    _installPath.Text = dialog.SelectedPath;
                    if (!_backupWasEdited) _backupPath.Text = InstallEngine.DefaultBackupRoot(dialog.SelectedPath);
                }
            }
        }

        private void BrowseBackup()
        {
            using (FolderBrowserDialog dialog = new FolderBrowserDialog())
            {
                dialog.Description = "Choose a parent folder for " + InstallEngine.BackupFolder;
                dialog.SelectedPath = Directory.Exists(_backupPath.Text) ? _backupPath.Text : Path.GetDirectoryName(_backupPath.Text);
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    string selected = dialog.SelectedPath;
                    if (!string.Equals(Path.GetFileName(selected.TrimEnd(Path.DirectorySeparatorChar)), InstallEngine.BackupFolder, StringComparison.OrdinalIgnoreCase))
                        selected = Path.Combine(selected, InstallEngine.BackupFolder);
                    _backupPath.Text = selected;
                    _backupWasEdited = true;
                }
            }
        }

        private void InstallNow()
        {
            _install.Enabled = false;
            try
            {
                InstallEngine.Install(_installPath.Text, _backupPath.Text, delegate(int value, string message)
                {
                    _progress.Value = value;
                    _status.Text = message;
                    Application.DoEvents();
                }, true);
                _installed = true;
                _install.Text = "Close";
                _install.Enabled = true;
                MessageBox.Show("Installation completed. Use the ChatGPT desktop shortcut to start the launcher.", "WinBridge Recovery", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                _status.Text = "Installation failed: " + ex.Message;
                _install.Enabled = true;
                MessageBox.Show(ex.ToString(), "Installation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    internal static class Program
    {
        private static string GetArgument(string[] args, string name)
        {
            for (int i = 0; i + 1 < args.Length; i++)
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase)) return args[i + 1];
            return string.Empty;
        }

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                bool silent = Array.Exists(args, delegate(string value) { return string.Equals(value, "--silent", StringComparison.OrdinalIgnoreCase); });
                bool updateMode = Array.Exists(args, delegate(string value) { return string.Equals(value, "--update", StringComparison.OrdinalIgnoreCase); });
                string existingInstallRoot = string.Empty;
                string existingBackupRoot = string.Empty;
                if (updateMode) InstallEngine.ExistingInstallationPaths(out existingInstallRoot, out existingBackupRoot);
                if (silent)
                {
                    string installRoot = GetArgument(args, "--install-root");
                    string backupRoot = GetArgument(args, "--backup-root");
                    if (updateMode && string.IsNullOrWhiteSpace(installRoot)) installRoot = existingInstallRoot;
                    if (updateMode && string.IsNullOrWhiteSpace(backupRoot)) backupRoot = existingBackupRoot;
                    bool testMode = Array.Exists(args, delegate(string value) { return string.Equals(value, "--test-mode", StringComparison.OrdinalIgnoreCase); });
                    InstallEngine.Install(installRoot, backupRoot, null, !testMode);
                    return 0;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new SetupForm(updateMode, existingInstallRoot, existingBackupRoot));
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.ToString(), "Installation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
