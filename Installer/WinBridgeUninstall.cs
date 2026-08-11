using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("WinBridge Recovery Uninstaller")]
[assembly: AssemblyDescription("Testing stage. Authorized recipients may test and perform secondary development. https://github.com/zemeng5208")]
[assembly: AssemblyCompany("https://github.com/zemeng5208")]
[assembly: AssemblyProduct("WinBridge Recovery")]
[assembly: AssemblyVersion("3.1.0.0")]
[assembly: AssemblyFileVersion("3.1.0.0")]

namespace WinBridgeUninstall
{
    internal static class UninstallEngine
    {
        internal const string ProductFolder = "WinBridge-Recovery";
        internal const string RegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\WinBridgeRecovery";

        internal static void Begin(string installRoot, string backupRoot, bool removeBackups, bool silent)
        {
            if (Process.GetProcessesByName("WinBridgeRecovery").Length > 0)
                throw new InvalidOperationException("Close WinBridge Recovery before uninstalling. ChatGPT itself may remain open.");

            installRoot = ValidateControlledPath(installRoot, "installation");
            if (removeBackups) backupRoot = ValidateBackupPath(backupRoot);

            string temporary = Path.Combine(
                Path.GetTempPath(),
                "WinBridgeUninstall-" + Guid.NewGuid().ToString("N") + ".exe");
            File.Copy(Process.GetCurrentProcess().MainModule.FileName, temporary, true);

            string arguments = "--cleanup" +
                " --parent " + Process.GetCurrentProcess().Id.ToString() +
                " --install-root " + Quote(installRoot) +
                " --backup-root " + Quote(backupRoot ?? string.Empty) +
                " --remove-backups " + (removeBackups ? "true" : "false") +
                " --silent " + (silent ? "true" : "false");
            Process.Start(new ProcessStartInfo
            {
                FileName = temporary,
                Arguments = arguments,
                WorkingDirectory = Path.GetTempPath(),
                UseShellExecute = false,
                CreateNoWindow = silent
            });
        }

        internal static int Cleanup(string[] args)
        {
            int parent = ParseInt(GetArgument(args, "--parent"));
            string installRoot = ValidateControlledPath(GetArgument(args, "--install-root"), "installation");
            string backupRoot = GetArgument(args, "--backup-root");
            bool removeBackups = ParseBool(GetArgument(args, "--remove-backups"));
            bool silent = ParseBool(GetArgument(args, "--silent"));

            WaitForExit(parent);
            string productRoot = Path.Combine(installRoot, ProductFolder);
            ValidateOwnedInstallation(productRoot);
            RemoveDesktopShortcutIfOwned(installRoot);
            RemoveUninstallRegistration();
            if (removeBackups && !string.IsNullOrWhiteSpace(backupRoot))
            {
                backupRoot = ValidateBackupPath(backupRoot);
                if (Directory.Exists(backupRoot)) Directory.Delete(backupRoot, true);
            }
            if (Directory.Exists(productRoot)) Directory.Delete(productRoot, true);
            string uninstaller = Path.Combine(installRoot, "Uninstall WinBridge Recovery.exe");
            if (File.Exists(uninstaller)) File.Delete(uninstaller);
            string certificate = Path.Combine(installRoot, "zemeng5208-Test-Code-Signing.cer");
            if (File.Exists(certificate)) File.Delete(certificate);

            if (!silent)
                MessageBox.Show("WinBridge Recovery was removed successfully.", "Uninstall complete", MessageBoxButtons.OK, MessageBoxIcon.Information);

            ScheduleSelfDelete(Process.GetCurrentProcess().MainModule.FileName);
            return 0;
        }

        internal static string ReadBackupRoot(string installRoot)
        {
            string config = Path.Combine(installRoot, ProductFolder, "Config", "storage.ini");
            if (!File.Exists(config)) return string.Empty;
            foreach (string raw in File.ReadAllLines(config))
            {
                string line = raw.Trim();
                if (line.StartsWith("backup_root=", StringComparison.OrdinalIgnoreCase))
                    return line.Substring("backup_root=".Length).Trim();
            }
            return string.Empty;
        }

        private static void ValidateOwnedInstallation(string productRoot)
        {
            string manifest = Path.Combine(productRoot, "Config", "install-manifest.txt");
            if (!File.Exists(manifest))
                throw new InvalidOperationException("Installation ownership marker is missing; refusing recursive removal.");
            string first = File.ReadAllLines(manifest)[0];
            if (!string.Equals(first, "product=WinBridge Recovery", StringComparison.Ordinal))
                throw new InvalidOperationException("Installation ownership marker is invalid; refusing recursive removal.");
            if ((File.GetAttributes(productRoot) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Installation path is a reparse point; refusing recursive removal.");
        }

        private static string ValidateControlledPath(string value, string label)
        {
            if (string.IsNullOrWhiteSpace(value) || !Path.IsPathRooted(value))
                throw new InvalidOperationException("The " + label + " path is invalid.");
            string full = Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar);
            string root = Path.GetPathRoot(full).TrimEnd(Path.DirectorySeparatorChar);
            if (string.Equals(full, root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Refusing to remove a drive root.");
            return full;
        }

        private static string ValidateBackupPath(string value)
        {
            string full = ValidateControlledPath(value, "backup");
            if (!string.Equals(Path.GetFileName(full), "CodexPluginRepairBackups", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The backup folder must be named CodexPluginRepairBackups.");
            return full;
        }

        private static void RemoveDesktopShortcutIfOwned(string installRoot)
        {
            string shortcutPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "WinBridge Recovery.lnk");
            if (!File.Exists(shortcutPath)) return;
            string target = ReadShortcutTarget(shortcutPath);
            if (!string.IsNullOrWhiteSpace(target) &&
                target.StartsWith(installRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                File.Delete(shortcutPath);
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

        private static void RemoveUninstallRegistration()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall", true))
            {
                if (key != null) key.DeleteSubKeyTree("WinBridgeRecovery", false);
            }
        }

        private static void WaitForExit(int processId)
        {
            if (processId <= 0) return;
            try
            {
                Process process = Process.GetProcessById(processId);
                process.WaitForExit(15000);
            }
            catch
            {
            }
            Thread.Sleep(300);
        }

        private static void ScheduleSelfDelete(string path)
        {
            string command = "/d /c ping 127.0.0.1 -n 2 > nul & del /f /q " + Quote(path);
            Process.Start(new ProcessStartInfo
            {
                FileName = Environment.GetEnvironmentVariable("COMSPEC") ?? "cmd.exe",
                Arguments = command,
                WorkingDirectory = Path.GetTempPath(),
                UseShellExecute = false,
                CreateNoWindow = true
            });
        }

        private static string GetArgument(string[] args, string name)
        {
            for (int i = 0; i + 1 < args.Length; i++)
                if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase)) return args[i + 1];
            return string.Empty;
        }

        private static int ParseInt(string value)
        {
            int result;
            return int.TryParse(value, out result) ? result : 0;
        }

        private static bool ParseBool(string value)
        {
            bool result;
            return bool.TryParse(value, out result) && result;
        }

        private static string Quote(string value)
        {
            return "\"" + (value ?? string.Empty).Replace("\"", "\\\"") + "\"";
        }
    }

    internal sealed class UninstallForm : Form
    {
        private readonly string _installRoot;
        private readonly string _backupRoot;
        private readonly CheckBox _removeBackups;

        internal UninstallForm(string installRoot)
        {
            _installRoot = installRoot;
            _backupRoot = UninstallEngine.ReadBackupRoot(installRoot);
            Text = "Uninstall WinBridge Recovery";
            Width = 580;
            Height = 330;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(12, 15, 18);
            ForeColor = Color.White;
            Font = new Font("Microsoft YaHei UI", 10F);
            MaximizeBox = false;

            Controls.Add(new Label { Text = "Remove WinBridge Recovery", Font = new Font(Font, FontStyle.Bold), AutoSize = true, Location = new Point(30, 28) });
            Controls.Add(new Label { Text = "Application files, settings, logs, mirrors, shortcuts, and uninstall registration will be removed.", ForeColor = Color.FromArgb(190, 200, 208), AutoSize = false, Width = 500, Height = 48, Location = new Point(30, 68) });
            Controls.Add(new Label { Text = "Install folder: " + _installRoot, AutoEllipsis = true, Width = 500, Height = 24, Location = new Point(30, 124) });
            Controls.Add(new Label { Text = "Backup folder: " + (string.IsNullOrWhiteSpace(_backupRoot) ? "Not configured" : _backupRoot), AutoEllipsis = true, Width = 500, Height = 24, Location = new Point(30, 154) });

            _removeBackups = new CheckBox
            {
                Text = "Also permanently remove all golden and recovery backups",
                AutoSize = true,
                ForeColor = Color.FromArgb(255, 185, 120),
                Location = new Point(30, 190),
                Enabled = !string.IsNullOrWhiteSpace(_backupRoot)
            };
            Controls.Add(_removeBackups);

            Button cancel = new Button { Text = "Cancel", Width = 100, Height = 36, Location = new Point(326, 232) };
            cancel.Click += delegate { Close(); };
            Controls.Add(cancel);
            Button remove = new Button { Text = "Uninstall", Width = 110, Height = 36, Location = new Point(438, 232), BackColor = Color.FromArgb(190, 62, 62), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            remove.FlatAppearance.BorderSize = 0;
            remove.Click += delegate { RemoveNow(); };
            Controls.Add(remove);
        }

        private void RemoveNow()
        {
            if (_removeBackups.Checked)
            {
                DialogResult answer = MessageBox.Show(
                    "This permanently deletes every backup in:\r\n" + _backupRoot + "\r\n\r\nContinue?",
                    "Delete backup data",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning);
                if (answer != DialogResult.Yes) return;
            }
            try
            {
                UninstallEngine.Begin(_installRoot, _backupRoot, _removeBackups.Checked, false);
                Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.ToString(), "Uninstall failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                if (args.Length > 0 && string.Equals(args[0], "--cleanup", StringComparison.OrdinalIgnoreCase))
                    return UninstallEngine.Cleanup(args);

                string installRoot = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
                bool silent = Array.Exists(args, delegate(string value) { return string.Equals(value, "--silent", StringComparison.OrdinalIgnoreCase); });
                if (silent)
                {
                    bool removeBackups = Array.Exists(args, delegate(string value) { return string.Equals(value, "--remove-backups", StringComparison.OrdinalIgnoreCase); });
                    UninstallEngine.Begin(installRoot, UninstallEngine.ReadBackupRoot(installRoot), removeBackups, true);
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new UninstallForm(installRoot));
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.ToString(), "Uninstall failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
