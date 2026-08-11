using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace WinBridgeRecovery
{
    public sealed class UpdateWindow : Window
    {
        private const string CurrentVersion = "3.1.0";
        private const string ApiUrl = "https://api.github.com/repos/zemeng5208/winbridge-recovery/releases/latest";
        private const string InstallerName = "WinBridge-Recovery-Setup.exe";
        private readonly string _root;
        private readonly TextBlock _status = new TextBlock();
        private readonly ProgressBar _progress = new ProgressBar();
        private readonly Button _action = new Button();
        private ReleaseInfo _release;

        public UpdateWindow(string root, string iconPath)
        {
            _root = root;
            Title = "WinBridge Recovery Update";
            Width = 520;
            Height = 300;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            Background = Brushes.Transparent;
            if (File.Exists(iconPath)) Icon = LoadBitmap(iconPath);
            Content = BuildContent();
            UiWindowReveal.Attach(this);
            Loaded += delegate { UiWindowReveal.ApplyBackdrop(this, true); CheckForUpdates(); };
        }

        private UIElement BuildContent()
        {
            Border frame = new Border { Background = Brush("#F20B0E12"), BorderBrush = Brush("#FF3A424A"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(14), Padding = new Thickness(24) };
            StackPanel panel = new StackPanel();
            panel.Children.Add(new TextBlock { Text = "WinBridge Recovery", Foreground = Brushes.White, FontSize = 20, FontWeight = FontWeights.SemiBold });
            panel.Children.Add(new TextBlock { Text = "v" + CurrentVersion, Foreground = Brush("#FF8B98A3"), Margin = new Thickness(0, 4, 0, 20) });
            _status.Text = "Checking the official release...";
            _status.Foreground = Brush("#FFDDE4E9");
            _status.TextWrapping = TextWrapping.Wrap;
            _status.MinHeight = 48;
            panel.Children.Add(_status);
            _progress.Height = 6;
            _progress.Margin = new Thickness(0, 14, 0, 18);
            _progress.Minimum = 0;
            _progress.Maximum = 100;
            panel.Children.Add(_progress);
            StackPanel actions = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
            Button close = Button("Close");
            close.Click += delegate { Close(); };
            _action.Content = "Checking...";
            _action.Width = 150;
            _action.Height = 34;
            _action.Margin = new Thickness(10, 0, 0, 0);
            _action.IsEnabled = false;
            _action.Click += delegate { DownloadAndInstall(); };
            actions.Children.Add(close);
            actions.Children.Add(_action);
            panel.Children.Add(actions);
            frame.Child = panel;
            return frame;
        }

        private async void CheckForUpdates()
        {
            try
            {
                _release = await Task.Factory.StartNew<ReleaseInfo>(delegate { return ReadLatestRelease(); });
                Version current = new Version(CurrentVersion);
                Version latest = ParseVersion(_release.Version);
                if (latest <= current)
                {
                    _status.Text = "You already have the latest version.";
                    _action.Content = "Up to date";
                    return;
                }
                _status.Text = "Version " + latest + " is available. The installer will be verified before it runs.";
                _action.Content = "Download and install";
                _action.IsEnabled = true;
            }
            catch (Exception ex)
            {
                _status.Text = "Update check is temporarily unavailable: " + ex.Message;
                _action.Content = "Unavailable";
            }
        }

        private async void DownloadAndInstall()
        {
            _action.IsEnabled = false;
            _status.Text = "Downloading the verified installer...";
            try
            {
                string path = await Task.Factory.StartNew<string>(delegate { return DownloadInstaller(_release); });
                _progress.Value = 100;
                _status.Text = "Download verified. The installer will open after this launcher closes.";
                string helper = Path.Combine(_root, "LauncherUI", "WinBridgeUpdateBootstrapper.exe");
                if (!File.Exists(helper)) throw new FileNotFoundException("Update helper is missing.", helper);
                Process.Start(new ProcessStartInfo
                {
                    FileName = helper,
                    Arguments = "--wait-pid " + Process.GetCurrentProcess().Id + " --installer \"" + path + "\"",
                    UseShellExecute = true
                });
                Application.Current.Shutdown();
            }
            catch (Exception ex)
            {
                _status.Text = "Update failed safely: " + ex.Message;
                _action.Content = "Retry";
                _action.IsEnabled = true;
            }
        }

        private ReleaseInfo ReadLatestRelease()
        {
            string json = DownloadText(ApiUrl, 10000);
            Dictionary<string, object> root = new JavaScriptSerializer().DeserializeObject(json) as Dictionary<string, object>;
            if (root == null) throw new InvalidDataException("Invalid release metadata.");
            ReleaseInfo result = new ReleaseInfo { Version = Convert.ToString(root["tag_name"], CultureInfo.InvariantCulture) };
            object[] assets = root.ContainsKey("assets") ? root["assets"] as object[] : null;
            if (assets != null)
            {
                foreach (object value in assets)
                {
                    Dictionary<string, object> asset = value as Dictionary<string, object>;
                    if (asset == null || Convert.ToString(asset["name"]) != InstallerName) continue;
                    result.Url = Convert.ToString(asset["browser_download_url"]);
                    if (asset.ContainsKey("digest")) result.Digest = Convert.ToString(asset["digest"]);
                    break;
                }
            }
            if (string.IsNullOrWhiteSpace(result.Url)) throw new InvalidDataException("The release does not contain the installer.");
            return result;
        }

        private string DownloadInstaller(ReleaseInfo release)
        {
            string expected = (release.Digest ?? string.Empty).Replace("sha256:", string.Empty).Trim();
            if (expected.Length != 64)
                expected = DownloadText(release.Url + ".sha256", 8000).Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0];
            if (expected.Length != 64) throw new InvalidDataException("The official SHA-256 value is unavailable.");
            string folder = Path.Combine(_root, "LauncherUI", "State", "Updates");
            Directory.CreateDirectory(folder);
            string destination = Path.Combine(folder, "WinBridge-Recovery-Setup-" + ParseVersion(release.Version) + ".exe");
            List<string> urls = new List<string>();
            string mirror = ReadMirrorPrefix();
            if (!string.IsNullOrWhiteSpace(mirror)) urls.Add(mirror.TrimEnd('/') + "/" + release.Url);
            urls.Add(release.Url);
            Exception last = null;
            foreach (string url in urls)
            {
                try
                {
                    using (WebClient client = CreateClient()) client.DownloadFile(url, destination);
                    string actual = Sha256(destination);
                    if (!actual.Equals(expected, StringComparison.OrdinalIgnoreCase))
                    {
                        File.Delete(destination);
                        throw new InvalidDataException("SHA-256 verification failed.");
                    }
                    return destination;
                }
                catch (Exception ex) { last = ex; }
            }
            throw last ?? new WebException("No download source is available.");
        }

        private string ReadMirrorPrefix()
        {
            string path = Path.Combine(_root, "Config", "update.ini");
            if (!File.Exists(path)) return string.Empty;
            foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
                if (line.StartsWith("mirror_prefix=", StringComparison.OrdinalIgnoreCase))
                    return line.Substring("mirror_prefix=".Length).Trim();
            return string.Empty;
        }

        private static string DownloadText(string url, int timeout)
        {
            using (WebClient client = CreateClient())
            {
                client.Headers[HttpRequestHeader.UserAgent] = "WinBridge-Recovery/3.1";
                return client.DownloadString(url);
            }
        }

        private static WebClient CreateClient()
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            return new WebClient { Encoding = Encoding.UTF8 };
        }

        private static string Sha256(string path)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream stream = File.OpenRead(path))
            {
                byte[] hash = sha.ComputeHash(stream);
                StringBuilder text = new StringBuilder(64);
                foreach (byte value in hash) text.Append(value.ToString("x2"));
                return text.ToString();
            }
        }

        private static Version ParseVersion(string value)
        {
            string clean = (value ?? string.Empty).Trim().TrimStart('v', 'V').Split('-')[0];
            Version version;
            if (!Version.TryParse(clean, out version)) throw new InvalidDataException("Invalid release version: " + value);
            return version;
        }

        private static Button Button(string text)
        {
            return new Button { Content = text, Width = 90, Height = 34, Background = Brush("#FF1B2228"), Foreground = Brushes.White, BorderBrush = Brush("#FF45505A") };
        }

        private static BitmapImage LoadBitmap(string path)
        {
            BitmapImage image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.UriSource = new Uri(path); image.EndInit(); if (image.CanFreeze) image.Freeze(); return image;
        }

        private static Brush Brush(string value)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(value); if (brush.CanFreeze) brush.Freeze(); return brush;
        }

        private sealed class ReleaseInfo { public string Version; public string Url; public string Digest; }
    }
}
