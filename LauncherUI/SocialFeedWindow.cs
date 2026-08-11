using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Xml.Linq;

namespace WinBridgeRecovery
{
    public sealed class SocialFeedSettings
    {
        public bool IncludeTibo = true;
        public bool IncludeOpenAI = true;
        public bool IncludeChatGPT = true;
        public int MaximumPosts = 4;
        public int Hours = 48;
        public bool UseJinaFallback = true;

        public static SocialFeedSettings Load(string path)
        {
            SocialFeedSettings settings = new SocialFeedSettings();
            if (!File.Exists(path)) return settings;
            try
            {
                foreach (string raw in File.ReadAllLines(path))
                {
                    string[] pair = raw.Split(new[] { '=' }, 2);
                    if (pair.Length != 2) continue;
                    string key = pair[0].Trim();
                    string value = pair[1].Trim();
                    bool flag;
                    int number;
                    if (key == "include_tibo" && bool.TryParse(value, out flag)) settings.IncludeTibo = flag;
                    else if (key == "include_openai" && bool.TryParse(value, out flag)) settings.IncludeOpenAI = flag;
                    else if (key == "include_chatgpt" && bool.TryParse(value, out flag)) settings.IncludeChatGPT = flag;
                    else if (key == "maximum_posts" && int.TryParse(value, out number)) settings.MaximumPosts = Math.Max(1, Math.Min(10, number));
                    else if (key == "hours" && int.TryParse(value, out number)) settings.Hours = Math.Max(24, Math.Min(72, number));
                    else if (key == "use_jina_fallback" && bool.TryParse(value, out flag)) settings.UseJinaFallback = flag;
                }
            }
            catch { }
            return settings;
        }

        public void Save(string path)
        {
            string directory = Path.GetDirectoryName(path);
            if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
            File.WriteAllLines(path, new[]
            {
                "include_tibo=" + IncludeTibo.ToString(CultureInfo.InvariantCulture),
                "include_openai=" + IncludeOpenAI.ToString(CultureInfo.InvariantCulture),
                "include_chatgpt=" + IncludeChatGPT.ToString(CultureInfo.InvariantCulture),
                "maximum_posts=" + MaximumPosts.ToString(CultureInfo.InvariantCulture),
                "hours=" + Hours.ToString(CultureInfo.InvariantCulture),
                "use_jina_fallback=" + UseJinaFallback.ToString(CultureInfo.InvariantCulture)
            }, Encoding.UTF8);
        }
    }

    public sealed class SocialFeedWindow : Window
    {
        private readonly string _iconPath;
        private readonly string _cachePath;
        private readonly SocialFeedSettings _settings;
        private readonly StackPanel _timeline = new StackPanel();
        private readonly TextBlock _status = new TextBlock();
        private readonly Button _refresh = new Button();
        private readonly JavaScriptSerializer _serializer = new JavaScriptSerializer();
        private List<SocialFeedPost> _visiblePosts = new List<SocialFeedPost>();

        public SocialFeedWindow(string iconPath, string stateDirectory)
        {
            _iconPath = iconPath;
            _cachePath = Path.Combine(stateDirectory, "social-feed-cache.json");
            _settings = SocialFeedSettings.Load(Path.Combine(stateDirectory, "social-feed-settings.ini"));
            Title = "\u770B\u770B\u4ED6";
            Width = 650;
            Height = 710;
            MinWidth = 540;
            MinHeight = 560;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            Background = Brushes.Transparent;
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            if (File.Exists(iconPath)) Icon = LoadLocalBitmap(iconPath);
            Content = BuildContent();
            UiWindowReveal.Attach(this);
            Loaded += delegate
            {
                UiWindowReveal.ApplyBackdrop(this, false);
                ShowCachedFeed();
                RefreshFeed();
            };
        }

        private UIElement BuildContent()
        {
            Border frame = new Border
            {
                Background = Brush("#FF000000"),
                BorderBrush = Brush("#FF30363D"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                ClipToBounds = true,
                Effect = new DropShadowEffect { Color = Colors.Black, BlurRadius = 28, ShadowDepth = 8, Opacity = 0.58 }
            };
            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(52) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(44) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(BuildTitleBar());

            Grid toolbar = new Grid
            {
                Background = Brush("#FF080A0C")
            };
            toolbar.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            toolbar.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            _status.Text = "\u6B63\u5728\u51C6\u5907\u52A8\u6001\u2026";
            _status.Foreground = Brush("#FF8B98A5");
            _status.FontSize = 11;
            _status.Margin = new Thickness(16, 0, 0, 0);
            _status.VerticalAlignment = VerticalAlignment.Center;
            toolbar.Children.Add(_status);
            _refresh.Content = "\u5237\u65B0";
            _refresh.Width = 62;
            _refresh.Height = 28;
            _refresh.Margin = new Thickness(0, 0, 14, 0);
            _refresh.Background = Brushes.Transparent;
            _refresh.BorderBrush = Brushes.Transparent;
            _refresh.Foreground = Brush("#FF55B8FF");
            _refresh.Cursor = Cursors.Hand;
            _refresh.Click += delegate { RefreshFeed(); };
            Grid.SetColumn(_refresh, 1);
            toolbar.Children.Add(_refresh);
            Grid.SetRow(toolbar, 1);
            root.Children.Add(toolbar);

            ScrollViewer scroll = new ScrollViewer
            {
                Background = Brushes.Black,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Content = _timeline
            };
            scroll.Resources.Add(typeof(ScrollBar), UiScrollChrome.Create());
            Grid.SetRow(scroll, 2);
            root.Children.Add(scroll);
            frame.Child = root;
            return frame;
        }

        private UIElement BuildTitleBar()
        {
            Border bar = new Border
            {
                Background = Brushes.Black,
                BorderBrush = Brush("#FF30363D"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                CornerRadius = new CornerRadius(12, 12, 0, 0)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            StackPanel title = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(18, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            title.Children.Add(new TextBlock
            {
                Text = "\uD835\uDD4F",
                Foreground = Brushes.White,
                FontFamily = new FontFamily("Segoe UI Symbol"),
                FontSize = 20,
                Margin = new Thickness(0, 0, 12, 0)
            });
            title.Children.Add(new TextBlock
            {
                Text = "\u770B\u770B\u4ED6  \u2197",
                Foreground = Brushes.White,
                FontSize = 15,
                FontWeight = FontWeights.Bold,
                VerticalAlignment = VerticalAlignment.Center
            });
            title.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(title);
            Button close = new Button
            {
                Content = "\u00D7",
                Width = 48,
                Height = 51,
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                Foreground = Brush("#FFD6D9DB"),
                FontSize = 17,
                Cursor = Cursors.Hand
            };
            close.Click += delegate { Close(); };
            Grid.SetColumn(close, 1);
            grid.Children.Add(close);
            bar.Child = grid;
            return bar;
        }

        private void ShowCachedFeed()
        {
            SocialFeedCache cache = LoadCache();
            if (cache == null || cache.Posts == null || cache.Posts.Count == 0)
            {
                ShowMessage("\u6682\u65E0\u672C\u5730\u7F13\u5B58\uFF0C\u6B63\u5728\u8BFB\u53D6\u516C\u5F00\u52A8\u6001\u2026");
                return;
            }
            _visiblePosts = cache.Posts.OrderByDescending(p => p.PublishedAt).Take(_settings.MaximumPosts).ToList();
            RenderPosts(_visiblePosts);
            _status.Text = "\u5DF2\u663E\u793A\u672C\u5730\u7F13\u5B58 \u00B7 " + FormatAge(cache.SavedAt);
        }

        private void RefreshFeed()
        {
            if (!_refresh.IsEnabled) return;
            _refresh.IsEnabled = false;
            _status.Text = "\u6B63\u5728\u540C\u6B65 Tibo\u3001OpenAI \u548C ChatGPT\u2026";
            Task.Factory.StartNew(delegate { return FetchAllAccounts(); })
                .ContinueWith(delegate(Task<SocialFeedRefresh> task)
                {
                    Dispatcher.BeginInvoke(new Action(delegate
                    {
                        _refresh.IsEnabled = true;
                        if (task.IsFaulted || task.IsCanceled || task.Result == null || task.Result.Posts.Count == 0)
                        {
                            if (_visiblePosts.Count == 0)
                                ShowMessage("\u6B64\u9875\u9762\u6682\u65F6\u4E0D\u53EF\u8BBF\u95EE\u3002");
                            _status.Text = _visiblePosts.Count == 0
                                ? "\u5728\u7EBF\u6765\u6E90\u6682\u65F6\u4E0D\u53EF\u7528"
                                : "\u5728\u7EBF\u5237\u65B0\u5931\u8D25 \u00B7 \u7EE7\u7EED\u663E\u793A\u7F13\u5B58";
                            _status.Foreground = Brush("#FFFFB454");
                            return;
                        }
                        SocialFeedRefresh result = task.Result;
                        _visiblePosts = result.Posts
                            .OrderByDescending(p => p.PublishedAt)
                            .Take(_settings.MaximumPosts)
                            .ToList();
                        SaveCache(new SocialFeedCache { SavedAt = DateTime.Now, Posts = result.Posts.Take(24).ToList() });
                        RenderPosts(_visiblePosts);
                        _status.Text = "\u5DF2\u540C\u6B65 " + _visiblePosts.Count.ToString(CultureInfo.InvariantCulture) +
                            " \u6761 \u00B7 " + result.SourceSummary;
                        _status.Foreground = Brush("#FF72D89A");
                    }));
                });
        }

        private SocialFeedRefresh FetchAllAccounts()
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            List<SocialAccount> accounts = new List<SocialAccount>();
            if (_settings.IncludeTibo) accounts.Add(new SocialAccount("Tibo", "thsottiaux", "T", "#FF1495FF"));
            if (_settings.IncludeOpenAI) accounts.Add(new SocialAccount("OpenAI", "OpenAI", "O", "#FF10A37F"));
            if (_settings.IncludeChatGPT) accounts.Add(new SocialAccount("ChatGPT", "ChatGPT", "C", "#FF8B5CF6"));
            List<Task<SocialAccountResult>> tasks = new List<Task<SocialAccountResult>>();
            foreach (SocialAccount account in accounts)
            {
                SocialAccount captured = account;
                tasks.Add(Task.Factory.StartNew(delegate { return FetchAccount(captured); }));
            }
            Task.WaitAll(tasks.ToArray());
            SocialFeedRefresh refresh = new SocialFeedRefresh();
            List<string> sources = new List<string>();
            foreach (Task<SocialAccountResult> task in tasks)
            {
                SocialAccountResult result = task.Result;
                if (result == null) continue;
                refresh.Posts.AddRange(result.Posts);
                if (!string.IsNullOrWhiteSpace(result.Source)) sources.Add(result.Account.Handle + ":" + result.Source);
            }
            List<SocialFeedPost> allPosts = refresh.Posts
                .GroupBy(p => string.IsNullOrWhiteSpace(p.Link) ? p.AccountHandle + "|" + p.Text : p.Link)
                .Select(g => g.First())
                .OrderByDescending(p => p.PublishedAt)
                .ToList();
            DateTime earliest = DateTime.Now.AddHours(-_settings.Hours);
            refresh.Posts = allPosts
                .Where(p => p.PublishedAt >= earliest || p.TimeUnconfirmed)
                .ToList();
            if (refresh.Posts.Count < 3)
            {
                foreach (SocialFeedPost older in allPosts)
                {
                    if (refresh.Posts.Contains(older)) continue;
                    refresh.Posts.Add(older);
                    if (refresh.Posts.Count >= _settings.MaximumPosts) break;
                }
            }
            refresh.Posts = refresh.Posts
                .OrderByDescending(p => p.PublishedAt)
                .ToList();
            refresh.SourceSummary = sources.Count == 0 ? "\u65E0\u53EF\u7528\u6765\u6E90" : string.Join(" \u00B7 ", sources.ToArray());
            return refresh;
        }

        private SocialAccountResult FetchAccount(SocialAccount account)
        {
            string[] feeds =
            {
                "https://rss.xxu.do/twitter/user/" + account.Handle,
                "https://rsshub.app/twitter/user/" + account.Handle
            };
            for (int i = 0; i < feeds.Length; i++)
            {
                try
                {
                    string xml = Download(feeds[i], 9000);
                    SocialAccountResult parsed = ParseRss(account, xml);
                    if (parsed.Posts.Count > 0)
                    {
                        parsed.Source = i == 0 ? "RSS" : "RSS\u5907\u7528";
                        return parsed;
                    }
                }
                catch { }
            }
            if (_settings.UseJinaFallback)
            {
                try
                {
                    string markdown = Download("https://r.jina.ai/https://x.com/" + account.Handle, 12000);
                    SocialAccountResult parsed = ParseJina(account, markdown);
                    if (parsed.Posts.Count > 0)
                    {
                        parsed.Source = "Jina\u540E\u5907";
                        return parsed;
                    }
                }
                catch { }
            }
            return new SocialAccountResult(account);
        }

        private static string Download(string url, int timeout)
        {
            using (SocialTimeoutWebClient client = new SocialTimeoutWebClient(timeout))
            {
                client.Encoding = Encoding.UTF8;
                client.Headers[HttpRequestHeader.UserAgent] = "Mozilla/5.0 WinBridge-Recovery/3.1";
                return client.DownloadString(url);
            }
        }

        private static SocialAccountResult ParseRss(SocialAccount account, string xml)
        {
            XDocument document = XDocument.Parse(xml);
            XElement channel = document.Root == null ? null : document.Root.Element("channel");
            if (channel == null) throw new InvalidDataException("RSS channel missing.");
            SocialAccountResult result = new SocialAccountResult(account);
            XElement image = channel.Element("image");
            string avatar = image == null || image.Element("url") == null ? string.Empty : image.Element("url").Value.Trim();
            foreach (XElement item in channel.Elements("item"))
            {
                string description = Element(item, "description");
                string text = CleanText(string.IsNullOrWhiteSpace(description) ? Element(item, "title") : description);
                if (string.IsNullOrWhiteSpace(text)) continue;
                DateTime published;
                if (!DateTime.TryParse(Element(item, "pubDate"), CultureInfo.InvariantCulture,
                    DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeUniversal, out published))
                    published = DateTime.Now;
                result.Posts.Add(new SocialFeedPost
                {
                    AccountName = account.Name,
                    AccountHandle = account.Handle,
                    AccountInitial = account.Initial,
                    AccountColor = account.Color,
                    AvatarUrl = avatar,
                    Text = text,
                    Link = Element(item, "link"),
                    PublishedAt = published.ToLocalTime(),
                    Source = "RSS"
                });
            }
            return result;
        }

        private static SocialAccountResult ParseJina(SocialAccount account, string markdown)
        {
            SocialAccountResult result = new SocialAccountResult(account);
            Match avatarMatch = Regex.Match(markdown ?? string.Empty,
                "https://pbs\\.twimg\\.com/profile_images/[^\\s\\)]+", RegexOptions.IgnoreCase);
            string avatar = avatarMatch.Success ? avatarMatch.Value : string.Empty;
            MatchCollection bullets = Regex.Matches(markdown ?? string.Empty,
                "^\\*\\s+\\[!\\[Image[^\\]]*\\]\\([^\\)]*\\)\\]\\(https://x\\.com/[^\\)]+\\)\\s*(.+?)\\s*$",
                RegexOptions.IgnoreCase | RegexOptions.Multiline);
            int position = 0;
            foreach (Match match in bullets)
            {
                string text = CleanText(match.Groups[1].Value);
                if (text.Length < 12) continue;
                result.Posts.Add(new SocialFeedPost
                {
                    AccountName = account.Name,
                    AccountHandle = account.Handle,
                    AccountInitial = account.Initial,
                    AccountColor = account.Color,
                    AvatarUrl = avatar,
                    Text = text,
                    Link = "https://x.com/" + account.Handle,
                    PublishedAt = DateTime.Now.AddSeconds(-position),
                    Source = "Jina\u540E\u5907",
                    TimeUnconfirmed = true
                });
                position++;
                if (position >= 5) break;
            }
            return result;
        }

        private void RenderPosts(List<SocialFeedPost> posts)
        {
            _timeline.Children.Clear();
            if (posts == null || posts.Count == 0)
            {
                ShowMessage("\u6B64\u9875\u9762\u6682\u65F6\u4E0D\u53EF\u8BBF\u95EE\u3002");
                return;
            }
            foreach (SocialFeedPost post in posts) _timeline.Children.Add(BuildPost(post));
        }

        private Border BuildPost(SocialFeedPost post)
        {
            Border card = new Border
            {
                Background = Brushes.Black,
                BorderBrush = Brush("#FF2F3336"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(18, 15, 18, 14)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(52) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.Children.Add(BuildAvatar(post));
            StackPanel body = new StackPanel();
            StackPanel identity = new StackPanel { Orientation = Orientation.Horizontal };
            identity.Children.Add(new TextBlock { Text = post.AccountName, Foreground = Brushes.White, FontWeight = FontWeights.Bold, FontSize = 13 });
            identity.Children.Add(new TextBlock
            {
                Text = "  @" + post.AccountHandle + "  \u00B7  " +
                    (post.TimeUnconfirmed ? "\u65F6\u95F4\u672A\u786E\u8BA4" : FormatTime(post.PublishedAt)),
                Foreground = Brush("#FF71767B"),
                FontSize = 11
            });
            body.Children.Add(identity);
            body.Children.Add(new TextBlock
            {
                Text = post.Text,
                Foreground = Brush("#FFE7E9EA"),
                FontSize = 14,
                LineHeight = 21,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 7, 0, 0)
            });
            TextBlock translated = new TextBlock
            {
                Visibility = Visibility.Collapsed,
                Foreground = Brush("#FFDCEFFF"),
                Background = Brush("#FF0A171F"),
                TextWrapping = TextWrapping.Wrap,
                Padding = new Thickness(10),
                Margin = new Thickness(0, 9, 0, 0),
                FontSize = 13
            };
            body.Children.Add(translated);
            StackPanel actions = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 7, 0, 0) };
            Button translate = LinkButton("\u4E2D\u6587\u7FFB\u8BD1");
            translate.Click += delegate { TranslatePost(post.Text, translate, translated); };
            actions.Children.Add(translate);
            actions.Children.Add(new TextBlock { Text = "   ", FontSize = 10 });
            Button open = LinkButton("\u5728 X \u4E0A\u67E5\u770B \u2197");
            open.Click += delegate
            {
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(post.Link) { UseShellExecute = true }); }
                catch { }
            };
            actions.Children.Add(open);
            body.Children.Add(actions);
            Grid.SetColumn(body, 1);
            grid.Children.Add(body);
            card.Child = grid;
            card.MouseEnter += delegate { card.Background = Brush("#FF080A0C"); };
            card.MouseLeave += delegate { card.Background = Brushes.Black; };
            return card;
        }

        private UIElement BuildAvatar(SocialFeedPost post)
        {
            Grid host = new Grid { Width = 42, Height = 42, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };
            host.Children.Add(new System.Windows.Shapes.Ellipse { Fill = Brush(post.AccountColor), Width = 42, Height = 42 });
            host.Children.Add(new TextBlock
            {
                Text = post.AccountInitial,
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                FontSize = 17,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            });
            if (!string.IsNullOrWhiteSpace(post.AvatarUrl))
            {
                try
                {
                    BitmapImage image = new BitmapImage();
                    image.BeginInit();
                    image.CacheOption = BitmapCacheOption.OnLoad;
                    image.UriSource = new Uri(post.AvatarUrl, UriKind.Absolute);
                    image.EndInit();
                    host.Children.Add(new System.Windows.Shapes.Ellipse
                    {
                        Width = 42,
                        Height = 42,
                        Fill = new ImageBrush(image) { Stretch = Stretch.UniformToFill }
                    });
                }
                catch { }
            }
            return host;
        }

        private void TranslatePost(string text, Button button, TextBlock output)
        {
            button.IsEnabled = false;
            button.Content = "\u7FFB\u8BD1\u4E2D\u2026";
            output.Visibility = Visibility.Visible;
            output.Text = "\u6B63\u5728\u8BFB\u53D6\u4E2D\u6587\u7FFB\u8BD1\u2026";
            Task.Factory.StartNew(delegate { return TranslateToChinese(text); })
                .ContinueWith(delegate(Task<string> task)
                {
                    Dispatcher.BeginInvoke(new Action(delegate
                    {
                        if (task.IsFaulted || task.IsCanceled || string.IsNullOrWhiteSpace(task.Result))
                        {
                            output.Text = "\u7FFB\u8BD1\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\u3002";
                            button.Content = "\u91CD\u8BD5\u4E2D\u6587\u7FFB\u8BD1";
                            button.IsEnabled = true;
                        }
                        else
                        {
                            output.Text = "\u4E2D\u6587\u7FFB\u8BD1\n" + task.Result.Trim();
                            button.Content = "\u5DF2\u7FFB\u8BD1";
                        }
                    }));
                });
        }

        private static string TranslateToChinese(string text)
        {
            string url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=" +
                Uri.EscapeDataString((text ?? string.Empty).Substring(0, Math.Min(1800, (text ?? string.Empty).Length)));
            string json = Download(url, 15000);
            object[] root = new JavaScriptSerializer().DeserializeObject(json) as object[];
            object[] segments = root == null || root.Length == 0 ? null : root[0] as object[];
            if (segments == null) return string.Empty;
            StringBuilder output = new StringBuilder();
            foreach (object item in segments)
            {
                object[] segment = item as object[];
                if (segment != null && segment.Length > 0 && segment[0] != null)
                    output.Append(Convert.ToString(segment[0], CultureInfo.InvariantCulture));
            }
            return output.ToString();
        }

        private Button LinkButton(string text)
        {
            return new Button
            {
                Content = text,
                Height = 27,
                Padding = new Thickness(0),
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                Foreground = Brush("#FF1D9BF0"),
                FontSize = 11,
                Cursor = Cursors.Hand
            };
        }

        private void ShowMessage(string message)
        {
            _timeline.Children.Clear();
            _timeline.Children.Add(new TextBlock
            {
                Text = message,
                Foreground = Brush("#FF8B98A5"),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(36, 80, 36, 30),
                FontSize = 14
            });
        }

        private SocialFeedCache LoadCache()
        {
            try { return File.Exists(_cachePath) ? _serializer.Deserialize<SocialFeedCache>(File.ReadAllText(_cachePath, Encoding.UTF8)) : null; }
            catch { return null; }
        }

        private void SaveCache(SocialFeedCache cache)
        {
            try
            {
                string directory = Path.GetDirectoryName(_cachePath);
                if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
                string temporary = _cachePath + ".tmp";
                File.WriteAllText(temporary, _serializer.Serialize(cache), Encoding.UTF8);
                if (File.Exists(_cachePath)) File.Replace(temporary, _cachePath, null);
                else File.Move(temporary, _cachePath);
            }
            catch { }
        }

        private static string Element(XElement parent, string name)
        {
            XElement value = parent.Element(name);
            return value == null ? string.Empty : value.Value;
        }

        private static string CleanText(string value)
        {
            string text = WebUtility.HtmlDecode(value ?? string.Empty);
            text = Regex.Replace(text, "<br\\s*/?>", "\n", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, "</p>", "\n", RegexOptions.IgnoreCase);
            text = Regex.Replace(text, "<[^>]+>", string.Empty);
            text = Regex.Replace(text, "\\s*https://t\\.co/\\S+\\s*$", string.Empty, RegexOptions.IgnoreCase);
            return Regex.Replace(text, "\\n{3,}", "\n\n").Trim();
        }

        private static string FormatTime(DateTime value)
        {
            if (value.Date == DateTime.Now.Date) return "\u4ECA\u5929 " + value.ToString("HH:mm");
            return value.ToString("M\u6708d\u65E5 HH:mm");
        }

        private static string FormatAge(DateTime savedAt)
        {
            TimeSpan age = DateTime.Now - savedAt;
            if (age.TotalMinutes < 2) return "\u521A\u521A";
            if (age.TotalHours < 1) return ((int)age.TotalMinutes).ToString(CultureInfo.InvariantCulture) + "\u5206\u949F\u524D";
            return ((int)age.TotalHours).ToString(CultureInfo.InvariantCulture) + "\u5C0F\u65F6\u524D";
        }

        private static Brush Brush(string value)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(value);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }

        private static BitmapImage LoadLocalBitmap(string path)
        {
            BitmapImage image = new BitmapImage();
            image.BeginInit();
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.UriSource = new Uri(path, UriKind.Absolute);
            image.EndInit();
            if (image.CanFreeze) image.Freeze();
            return image;
        }

        private sealed class SocialAccount
        {
            public readonly string Name;
            public readonly string Handle;
            public readonly string Initial;
            public readonly string Color;
            public SocialAccount(string name, string handle, string initial, string color)
            {
                Name = name; Handle = handle; Initial = initial; Color = color;
            }
        }

        private sealed class SocialAccountResult
        {
            public readonly SocialAccount Account;
            public string Source = string.Empty;
            public readonly List<SocialFeedPost> Posts = new List<SocialFeedPost>();
            public SocialAccountResult(SocialAccount account) { Account = account; }
        }

        private sealed class SocialFeedRefresh
        {
            public List<SocialFeedPost> Posts = new List<SocialFeedPost>();
            public string SourceSummary = string.Empty;
        }
    }

    public sealed class SocialFeedCache
    {
        public DateTime SavedAt { get; set; }
        public List<SocialFeedPost> Posts { get; set; }
    }

    public sealed class SocialFeedPost
    {
        public string AccountName { get; set; }
        public string AccountHandle { get; set; }
        public string AccountInitial { get; set; }
        public string AccountColor { get; set; }
        public string AvatarUrl { get; set; }
        public string Text { get; set; }
        public string Link { get; set; }
        public DateTime PublishedAt { get; set; }
        public string Source { get; set; }
        public bool TimeUnconfirmed { get; set; }
    }

    internal sealed class SocialTimeoutWebClient : WebClient
    {
        private readonly int _timeout;
        public SocialTimeoutWebClient(int timeout) { _timeout = timeout; }
        protected override WebRequest GetWebRequest(Uri address)
        {
            WebRequest request = base.GetWebRequest(address);
            if (request != null)
            {
                request.Timeout = _timeout;
                HttpWebRequest http = request as HttpWebRequest;
                if (http != null) http.ReadWriteTimeout = _timeout;
            }
            return request;
        }
    }
}
