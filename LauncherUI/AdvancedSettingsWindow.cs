using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;

namespace WinBridgeRecovery
{
    public sealed class AdvancedSettingsWindow : Window
    {
        private readonly string _root;
        private readonly string _iconPath;
        private readonly LauncherGeneralSettings _general;
        private readonly LauncherThemeSettings _theme;
        private readonly SocialFeedSettings _feed;
        private readonly LauncherLanguageSettings _language;
        private readonly bool _feedAvailable;
        private readonly Action<LauncherGeneralSettings> _applyGeneral;
        private readonly Action<LauncherThemeSettings> _applyTheme;
        private readonly Action _openGames;
        private readonly Action _openFeed;
        private readonly StackPanel _sections = new StackPanel();
        private readonly string _feedPath;

        public AdvancedSettingsWindow(
            string root,
            string iconPath,
            LauncherGeneralSettings general,
            LauncherThemeSettings theme,
            Action<LauncherGeneralSettings> applyGeneral,
            Action<LauncherThemeSettings> applyTheme,
            Action openGames,
            Action openFeed)
        {
            _root = root;
            _iconPath = iconPath;
            _general = general;
            _theme = theme;
            _applyGeneral = applyGeneral;
            _applyTheme = applyTheme;
            _openGames = openGames;
            _openFeed = openFeed;
            _feedPath = Path.Combine(root, "LauncherUI", "State", "social-feed-settings.ini");
            _feed = SocialFeedSettings.Load(_feedPath);
            _language = LauncherLanguageSettings.Load(root);
            _feedAvailable = SocialFeedWindow.ProbeAvailability();
            if (!_feedAvailable && !File.Exists(_feedPath)) _feed.Enabled = false;

            Title = L("window.settings");
            Width = 430;
            Height = 760;
            MinWidth = 400;
            MinHeight = 620;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            Background = Brushes.Transparent;
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            if (File.Exists(iconPath)) Icon = LoadBitmap(iconPath);
            Content = BuildContent();
            UiWindowReveal.Attach(this);
            Loaded += delegate { UiWindowReveal.ApplyBackdrop(this, true); };
        }

        private UIElement BuildContent()
        {
            Border frame = new Border
            {
                Background = Brush("#F20B0E12"),
                BorderBrush = Brush("#FF343A40"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(14),
                ClipToBounds = true,
                Effect = new DropShadowEffect { Color = Colors.Black, BlurRadius = 30, ShadowDepth = 8, Opacity = 0.62 }
            };
            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(52) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(BuildTitleBar());

            ScrollViewer scroll = new ScrollViewer
            {
                Background = Brush("#E50B0E12"),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
            };
            scroll.Resources.Add(typeof(ScrollBar), UiScrollChrome.Create());
            _sections.Margin = new Thickness(14, 12, 14, 18);
            BuildSections();
            scroll.Content = _sections;
            Grid.SetRow(scroll, 1);
            root.Children.Add(scroll);
            frame.Child = root;
            return frame;
        }

        private UIElement BuildTitleBar()
        {
            Border bar = new Border
            {
                Background = Brush("#F70B0E12"),
                BorderBrush = Brush("#FF2C3238"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                CornerRadius = new CornerRadius(14, 14, 0, 0)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            StackPanel brand = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(16, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (File.Exists(_iconPath))
            {
                Image icon = new Image { Source = LoadBitmap(_iconPath), Width = 27, Height = 27, Margin = new Thickness(0, 0, 10, 0) };
                RenderOptions.SetBitmapScalingMode(icon, BitmapScalingMode.HighQuality);
                brand.Children.Add(icon);
            }
            brand.Children.Add(new TextBlock
            {
                Text = Title,
                Foreground = Brush("#FFF4F6F8"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });
            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(brand);
            Button close = IconButton("\u00D7", L("button.close"));
            close.Click += delegate { Close(); };
            Grid.SetColumn(close, 1);
            grid.Children.Add(close);
            bar.Child = grid;
            return bar;
        }

        private void BuildSections()
        {
            string languageName = L("language." + _language.Code);
            DisclosureSection general = Section("\u2637", L("section.general"),
                L(_general.AutoCloseAfterSuccess ? "summary.general.on" : "summary.general.off", languageName), true);
            general.Body.Children.Add(LanguageRow());
            general.Body.Children.Add(ToggleRow(
                L("row.autoClose"),
                L("desc.autoClose"),
                _general.AutoCloseAfterSuccess,
                delegate(bool value) { _general.AutoCloseAfterSuccess = value; SaveGeneral(); }));
            _sections.Children.Add(general.Root);

            DisclosureSection window = Section("\u25A3", L("section.window"), L("summary.window"), false);
            window.Body.Children.Add(ToggleRow(
                L("row.keepOpenGames"),
                L("desc.keepOpenGames"),
                _general.KeepOpenWhileGaming,
                delegate(bool value) { _general.KeepOpenWhileGaming = value; SaveGeneral(); }));
            window.Body.Children.Add(ReadOnlyRow(
                L("row.exitCleanup"),
                L("status.enabled"),
                L("desc.exitCleanup")));
            _sections.Children.Add(window.Root);

            DisclosureSection appearance = Section("\u25C9", L("section.appearance"),
                L(string.Equals(_theme.Theme, "glass", StringComparison.OrdinalIgnoreCase) ? "theme.glass" : "theme.classic"), false);
            appearance.Body.Children.Add(SegmentedThemeRow());
            appearance.Body.Children.Add(SliderRow(
                L("row.panelOpacity"),
                L("desc.panelOpacity"),
                _theme.PanelOpacity,
                delegate(double value) { _theme.PanelOpacity = value; SaveTheme(); }));
            appearance.Body.Children.Add(SliderRow(
                L("row.tintStrength"),
                L("desc.tintStrength"),
                _theme.TintStrength,
                delegate(double value) { _theme.TintStrength = value; SaveTheme(); }));
            appearance.Body.Children.Add(ToggleRow(
                L("row.reduceMotion"),
                L("desc.reduceMotion"),
                _theme.ReduceMotion,
                delegate(bool value) { _theme.ReduceMotion = value; SaveTheme(); }));
            _sections.Children.Add(appearance.Root);

            DisclosureSection storage = Section("\u25A4", L("section.storage"),
                L("summary.storage",
                    _general.LogSessionLimit.ToString(CultureInfo.InvariantCulture),
                    (_general.MaxLogBytes / 1024 / 1024).ToString(CultureInfo.InvariantCulture),
                    L("unit.mb")), false);
            storage.Body.Children.Add(ChoiceRow(
                L("row.backupRetention"),
                new[] { "1", "2", "3" },
                _general.BackupRetentionLimit.ToString(CultureInfo.InvariantCulture),
                delegate(string value) { int number; if (int.TryParse(value, out number)) { _general.BackupRetentionLimit = number; SaveGeneral(); } }));
            storage.Body.Children.Add(ChoiceRow(
                L("row.logSessions"),
                new[] { "10", "20", "30" },
                _general.LogSessionLimit.ToString(CultureInfo.InvariantCulture),
                delegate(string value) { int number; if (int.TryParse(value, out number)) { _general.LogSessionLimit = number; SaveGeneral(); } }));
            storage.Body.Children.Add(ChoiceRow(
                L("row.uiLogLines"),
                new[] { "180", "260", "400" },
                _general.UiLogLineLimit.ToString(CultureInfo.InvariantCulture),
                delegate(string value) { int number; if (int.TryParse(value, out number)) { _general.UiLogLineLimit = number; SaveGeneral(); } }));
            storage.Body.Children.Add(ReadOnlyRow(L("row.logTotalLimit"), L("status.maxLogSize", "10", L("unit.mb")), L("desc.logTotalLimit")));
            storage.Body.Children.Add(CommandRow(L("button.openLogs"), delegate { OpenPath(Path.Combine(_root, "Logs")); }));
            _sections.Children.Add(storage.Root);

            if (_feedAvailable)
            {
                int sourceCount = (_feed.IncludeTibo ? 1 : 0) + (_feed.IncludeOpenAI ? 1 : 0) + (_feed.IncludeChatGPT ? 1 : 0);
                DisclosureSection feed = Section("\u2601", L("section.activity"),
                    L("summary.activity", sourceCount.ToString(CultureInfo.InvariantCulture), _feed.MaximumPosts.ToString(CultureInfo.InvariantCulture)), false);
                feed.Body.Children.Add(ToggleRow(L("row.enableActivity"), L("desc.enableActivity"), _feed.Enabled,
                    delegate(bool value) { _feed.Enabled = value; SaveFeed(); }));
                feed.Body.Children.Add(ToggleRow(L("feed.tibo"), L("feed.tibo.description"), _feed.IncludeTibo,
                    delegate(bool value) { _feed.IncludeTibo = value; SaveFeed(); }));
                feed.Body.Children.Add(ToggleRow(L("feed.openai"), L("feed.openai.description"), _feed.IncludeOpenAI,
                    delegate(bool value) { _feed.IncludeOpenAI = value; SaveFeed(); }));
                feed.Body.Children.Add(ToggleRow(L("feed.chatgpt"), L("feed.chatgpt.description"), _feed.IncludeChatGPT,
                    delegate(bool value) { _feed.IncludeChatGPT = value; SaveFeed(); }));
                feed.Body.Children.Add(ChoiceRow(L("row.activityItems"), new[] { "1", "2", "3", "4", "5", "6", "7", "8", "9", "10" },
                    _feed.MaximumPosts.ToString(CultureInfo.InvariantCulture),
                    delegate(string value) { int number; if (int.TryParse(value, out number)) { _feed.MaximumPosts = number; SaveFeed(); } }));
                feed.Body.Children.Add(ToggleRow(
                    L("row.readerFallback"),
                    L("desc.readerFallback"),
                    _feed.UseJinaFallback,
                    delegate(bool value) { _feed.UseJinaFallback = value; SaveFeed(); }));
                feed.Body.Children.Add(CommandRow(L("button.openActivity"), delegate { if (_feed.Enabled) _openFeed(); }));
                _sections.Children.Add(feed.Root);
            }

            DisclosureSection games = Section("\u25C8", L("section.games"), L("summary.games"), false);
            games.Body.Children.Add(ReadOnlyRow(L("status.installed"), L("games.value"), L("desc.games")));
            games.Body.Children.Add(CommandRow(L("button.chooseGame"), _openGames));
            _sections.Children.Add(games.Root);

            DisclosureSection about = Section("\u24D8", L("section.about"), L("summary.about", "v3.1.1"), false);
            about.Body.Children.Add(ReadOnlyRow(L("row.currentVersion"), "3.1.1", L("desc.about")));
            about.Body.Children.Add(CommandRow(L("button.checkUpdate"), OpenUpdateCenter));
            about.Body.Children.Add(new TextBlock
            {
                Text = L("disclaimer"),
                Foreground = Brush("#FF7F8A95"),
                FontSize = 10,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(2, 10, 2, 4)
            });
            _sections.Children.Add(about.Root);
        }

        private DisclosureSection Section(string glyph, string title, string summary, bool expanded)
        {
            Border root = new Border
            {
                Background = Brush("#B8101419"),
                BorderBrush = Brush("#FF2A3037"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Margin = new Thickness(0, 0, 0, 8),
                ClipToBounds = true
            };
            StackPanel stack = new StackPanel();
            Grid header = new Grid
            {
                Height = 50,
                Background = Brush("#D812161B"),
                Cursor = Cursors.Hand
            };
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(34) });
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
            header.Children.Add(new TextBlock
            {
                Text = glyph,
                Foreground = Brush("#FFE8EDF1"),
                FontSize = 15,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            });
            TextBlock heading = new TextBlock
            {
                Text = title,
                Foreground = Brush("#FFF1F4F6"),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(heading, 1);
            header.Children.Add(heading);
            TextBlock state = new TextBlock
            {
                Text = summary,
                Foreground = Brush("#FF89939D"),
                FontSize = 10,
                Margin = new Thickness(8, 0, 4, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(state, 2);
            header.Children.Add(state);
            TextBlock arrow = new TextBlock
            {
                Text = expanded ? "\u2303" : "\u2304",
                Foreground = Brush("#FF8F9AA5"),
                FontSize = 14,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(arrow, 3);
            header.Children.Add(arrow);
            StackPanel body = new StackPanel
            {
                Visibility = expanded ? Visibility.Visible : Visibility.Collapsed,
                Margin = new Thickness(14, 12, 14, 12)
            };
            header.MouseLeftButtonUp += delegate
            {
                bool show = body.Visibility != Visibility.Visible;
                body.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
                arrow.Text = show ? "\u2303" : "\u2304";
            };
            stack.Children.Add(header);
            stack.Children.Add(body);
            root.Child = stack;
            return new DisclosureSection { Root = root, Body = body };
        }

        private UIElement ToggleRow(string title, string description, bool initial, Action<bool> changed)
        {
            Grid row = BaseRow();
            StackPanel copy = RowCopy(title, description);
            row.Children.Add(copy);
            StackPanel switchGroup = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            TextBlock state = new TextBlock
            {
                Text = L(initial ? "status.on" : "status.off"),
                Foreground = initial ? Brush("#FF55E7B0") : Brush("#FF8B949D"),
                FontSize = 10,
                FontWeight = FontWeights.SemiBold,
                Width = 20,
                VerticalAlignment = VerticalAlignment.Center
            };
            ToggleButton toggle = new ToggleButton
            {
                Width = 46,
                Height = 24,
                IsChecked = initial,
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                Cursor = Cursors.Hand,
                FocusVisualStyle = null,
                Template = CreateSwitchTemplate(),
                ToolTip = L(initial ? "status.enabled" : "status.disabled")
            };
            toggle.Checked += delegate
            {
                state.Text = L("status.on");
                state.Foreground = Brush("#FF55E7B0");
                toggle.ToolTip = L("status.enabled");
                changed(true);
            };
            toggle.Unchecked += delegate
            {
                state.Text = L("status.off");
                state.Foreground = Brush("#FF8B949D");
                toggle.ToolTip = L("status.disabled");
                changed(false);
            };
            switchGroup.Children.Add(state);
            switchGroup.Children.Add(toggle);
            Grid.SetColumn(switchGroup, 1);
            row.Children.Add(switchGroup);
            return row;
        }

        private static ControlTemplate CreateSwitchTemplate()
        {
            ControlTemplate template = new ControlTemplate(typeof(ToggleButton));
            FrameworkElementFactory grid = new FrameworkElementFactory(typeof(Grid));
            FrameworkElementFactory track = new FrameworkElementFactory(typeof(Border));
            track.Name = "Track";
            track.SetValue(Border.BackgroundProperty, Brush("#FF242A30"));
            track.SetValue(Border.BorderBrushProperty, Brush("#FF4A535C"));
            track.SetValue(Border.BorderThicknessProperty, new Thickness(1));
            track.SetValue(Border.CornerRadiusProperty, new CornerRadius(12));
            grid.AppendChild(track);
            FrameworkElementFactory thumb = new FrameworkElementFactory(typeof(Border));
            thumb.Name = "Thumb";
            thumb.SetValue(FrameworkElement.WidthProperty, 18.0);
            thumb.SetValue(FrameworkElement.HeightProperty, 18.0);
            thumb.SetValue(FrameworkElement.MarginProperty, new Thickness(3));
            thumb.SetValue(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Left);
            thumb.SetValue(FrameworkElement.VerticalAlignmentProperty, VerticalAlignment.Center);
            thumb.SetValue(Border.BackgroundProperty, Brush("#FFF3F6F8"));
            thumb.SetValue(Border.CornerRadiusProperty, new CornerRadius(9));
            thumb.SetValue(UIElement.EffectProperty, new DropShadowEffect
            {
                Color = Colors.Black,
                BlurRadius = 4,
                ShadowDepth = 1,
                Opacity = 0.35
            });
            grid.AppendChild(thumb);
            template.VisualTree = grid;
            Trigger checkedTrigger = new Trigger
            {
                Property = ToggleButton.IsCheckedProperty,
                Value = true
            };
            checkedTrigger.Setters.Add(new Setter(Border.BackgroundProperty, Brush("#FF23B989"), "Track"));
            checkedTrigger.Setters.Add(new Setter(Border.BorderBrushProperty, Brush("#FF58E7B4"), "Track"));
            checkedTrigger.Setters.Add(new Setter(FrameworkElement.HorizontalAlignmentProperty, HorizontalAlignment.Right, "Thumb"));
            template.Triggers.Add(checkedTrigger);
            Trigger hoverTrigger = new Trigger
            {
                Property = UIElement.IsMouseOverProperty,
                Value = true
            };
            hoverTrigger.Setters.Add(new Setter(Border.BorderBrushProperty, Brush("#FF89959F"), "Track"));
            template.Triggers.Add(hoverTrigger);
            return template;
        }

        private UIElement ReadOnlyRow(string title, string value, string description)
        {
            Grid row = BaseRow();
            row.Children.Add(RowCopy(title, description));
            Border chip = new Border
            {
                Background = Brush("#FF1D2228"),
                BorderBrush = Brush("#FF3B424A"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(10, 5, 10, 5),
                VerticalAlignment = VerticalAlignment.Center
            };
            chip.Child = new TextBlock { Text = value, Foreground = Brush("#FFDCE2E7"), FontSize = 10 };
            Grid.SetColumn(chip, 1);
            row.Children.Add(chip);
            return row;
        }

        private UIElement LanguageRow()
        {
            Grid row = BaseRow();
            row.Children.Add(RowCopy(
                L("language.title"),
                L("language.description")));
            string[] codes = { "zh", "en", "fr", "es", "ru", "ar" };
            string[] languageKeys = { "language.zh", "language.en", "language.fr", "language.es", "language.ru", "language.ar" };
            string[] names = new string[languageKeys.Length];
            for (int i = 0; i < languageKeys.Length; i++) names[i] = L(languageKeys[i]);
            int selected = Array.IndexOf(codes, _language.Code);
            if (selected < 0) selected = 1;

            Button selector = new Button
            {
                Width = 112,
                Height = 28,
                Background = Brush("#FF1D2228"),
                Foreground = Brush("#FFF0F3F5"),
                BorderBrush = Brush("#FF48515A"),
                BorderThickness = new Thickness(1),
                FontSize = 10,
                Cursor = Cursors.Hand,
                FocusVisualStyle = null,
                Content = names[selected] + "  \u2304",
                Template = CreateSelectorTemplate()
            };

            ContextMenu menu = new ContextMenu
            {
                Width = 112,
                Background = Brush("#FF11161B"),
                Foreground = Brush("#FFF0F3F5"),
                BorderBrush = Brush("#FF48515A"),
                BorderThickness = new Thickness(1),
                Placement = PlacementMode.Bottom,
                Template = CreateContextMenuTemplate()
            };
            for (int i = 0; i < codes.Length; i++)
            {
                string nextCode = codes[i];
                string nextName = names[i];
                MenuItem item = new MenuItem
                {
                    Header = nextName,
                    Width = 106,
                    Height = 30,
                    Foreground = Brush("#FFE7ECEF"),
                    Background = Brushes.Transparent,
                    Padding = new Thickness(12, 7, 12, 7),
                    Template = CreateMenuItemTemplate()
                };
                item.Click += delegate
                {
                    if (String.Equals(_language.Code, nextCode, StringComparison.OrdinalIgnoreCase)) return;
                    _language.Code = nextCode;
                    _language.Save(_root);
                    selector.Content = nextName + "  \u2304";
                    MessageBox.Show(this, L("language.restart.message"), L("language.restart.title"), MessageBoxButton.OK, MessageBoxImage.Information);
                };
                menu.Items.Add(item);
            }
            selector.ContextMenu = menu;
            selector.Click += delegate
            {
                selector.ContextMenu.PlacementTarget = selector;
                selector.ContextMenu.IsOpen = true;
            };
            Grid.SetColumn(selector, 1);
            row.Children.Add(selector);
            return row;
        }

        private static ControlTemplate CreateSelectorTemplate()
        {
            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory frame = new FrameworkElementFactory(typeof(Border));
            frame.Name = "Frame";
            frame.SetBinding(Border.BackgroundProperty, new Binding("Background") { RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent) });
            frame.SetBinding(Border.BorderBrushProperty, new Binding("BorderBrush") { RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent) });
            frame.SetBinding(Border.BorderThicknessProperty, new Binding("BorderThickness") { RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent) });
            frame.SetValue(Border.CornerRadiusProperty, new CornerRadius(7));
            FrameworkElementFactory content = new FrameworkElementFactory(typeof(ContentPresenter));
            content.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Center);
            content.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            content.SetValue(ContentPresenter.ContentProperty, new TemplateBindingExtension(ContentControl.ContentProperty));
            frame.AppendChild(content);
            template.VisualTree = frame;
            Trigger hover = new Trigger { Property = UIElement.IsMouseOverProperty, Value = true };
            hover.Setters.Add(new Setter(Border.BackgroundProperty, Brush("#FF252C33"), "Frame"));
            hover.Setters.Add(new Setter(Border.BorderBrushProperty, Brush("#FF697580"), "Frame"));
            template.Triggers.Add(hover);
            return template;
        }

        private static ControlTemplate CreateMenuItemTemplate()
        {
            ControlTemplate template = new ControlTemplate(typeof(MenuItem));
            FrameworkElementFactory frame = new FrameworkElementFactory(typeof(Border));
            frame.Name = "MenuFrame";
            frame.SetBinding(Border.BackgroundProperty, new Binding("Background") { RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent) });
            frame.SetValue(Border.CornerRadiusProperty, new CornerRadius(5));
            frame.SetValue(Border.PaddingProperty, new Thickness(10, 5, 10, 5));
            FrameworkElementFactory content = new FrameworkElementFactory(typeof(ContentPresenter));
            content.SetValue(ContentPresenter.ContentSourceProperty, "Header");
            content.SetValue(ContentPresenter.HorizontalAlignmentProperty, HorizontalAlignment.Left);
            content.SetValue(ContentPresenter.VerticalAlignmentProperty, VerticalAlignment.Center);
            content.SetBinding(System.Windows.Documents.TextElement.ForegroundProperty, new Binding("Foreground") { RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent) });
            frame.AppendChild(content);
            template.VisualTree = frame;
            Trigger highlighted = new Trigger { Property = MenuItem.IsHighlightedProperty, Value = true };
            highlighted.Setters.Add(new Setter(Border.BackgroundProperty, Brush("#FF26313A"), "MenuFrame"));
            template.Triggers.Add(highlighted);
            return template;
        }

        private static ControlTemplate CreateContextMenuTemplate()
        {
            ControlTemplate template = new ControlTemplate(typeof(ContextMenu));
            FrameworkElementFactory frame = new FrameworkElementFactory(typeof(Border));
            frame.SetValue(Border.BackgroundProperty, Brush("#FF11161B"));
            frame.SetValue(Border.BorderBrushProperty, Brush("#FF48515A"));
            frame.SetValue(Border.BorderThicknessProperty, new Thickness(1));
            frame.SetValue(Border.CornerRadiusProperty, new CornerRadius(8));
            frame.SetValue(Border.PaddingProperty, new Thickness(2));
            frame.SetValue(UIElement.EffectProperty, new DropShadowEffect
            {
                BlurRadius = 16,
                ShadowDepth = 5,
                Opacity = 0.42,
                Color = Colors.Black
            });
            frame.AppendChild(new FrameworkElementFactory(typeof(ItemsPresenter)));
            template.VisualTree = frame;
            return template;
        }

        private string L(string key, params object[] args)
        {
            return LauncherLocale.Format(_language.Code, key, args);
        }

        private UIElement ChoiceRow(string title, string[] values, string selected, Action<string> changed)
        {
            Grid row = BaseRow();
            row.Children.Add(RowCopy(title, string.Empty));
            StackPanel choices = new StackPanel { Orientation = Orientation.Horizontal };
            foreach (string value in values)
            {
                Button button = new Button
                {
                    Content = value,
                    MinWidth = 38,
                    Height = 26,
                    Margin = new Thickness(3, 0, 0, 0),
                    Background = value == selected ? Brush("#FFDCE3E9") : Brush("#FF1D2228"),
                    Foreground = value == selected ? Brush("#FF101419") : Brush("#FFD0D6DC"),
                    BorderBrush = Brush("#FF414952"),
                    BorderThickness = new Thickness(1),
                    Cursor = Cursors.Hand,
                    FontSize = 10
                };
                string captured = value;
                button.Click += delegate
                {
                    foreach (Button sibling in choices.Children)
                    {
                        bool active = Convert.ToString(sibling.Content) == captured;
                        sibling.Background = active ? Brush("#FFDCE3E9") : Brush("#FF1D2228");
                        sibling.Foreground = active ? Brush("#FF101419") : Brush("#FFD0D6DC");
                    }
                    changed(captured);
                };
                choices.Children.Add(button);
            }
            Grid.SetColumn(choices, 1);
            row.Children.Add(choices);
            return row;
        }

        private UIElement SegmentedThemeRow()
        {
            Grid row = BaseRow();
            row.Children.Add(RowCopy(L("row.glassBackground"), L("desc.glassBackground")));
            StackPanel choices = new StackPanel { Orientation = Orientation.Horizontal };
            Button glass = SmallChoice(L("theme.system"), string.Equals(_theme.Theme, "glass", StringComparison.OrdinalIgnoreCase));
            Button classic = SmallChoice(L("theme.black"), !string.Equals(_theme.Theme, "glass", StringComparison.OrdinalIgnoreCase));
            glass.Click += delegate
            {
                _theme.Theme = "glass"; SetChoice(glass, true); SetChoice(classic, false); SaveTheme();
            };
            classic.Click += delegate
            {
                _theme.Theme = "classic"; SetChoice(glass, false); SetChoice(classic, true); SaveTheme();
            };
            choices.Children.Add(glass);
            choices.Children.Add(classic);
            Grid.SetColumn(choices, 1);
            row.Children.Add(choices);
            return row;
        }

        private UIElement SliderRow(string title, string description, double value, Action<double> changed)
        {
            Grid row = new Grid { Margin = new Thickness(0, 3, 0, 12) };
            row.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            row.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            Grid head = BaseRow();
            head.Margin = new Thickness(0);
            head.Children.Add(RowCopy(title, description));
            TextBlock valueText = new TextBlock
            {
                Text = Math.Round(value * 100).ToString(CultureInfo.InvariantCulture),
                Foreground = Brush("#FFB8C1C9"),
                FontSize = 10,
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(valueText, 1);
            head.Children.Add(valueText);
            row.Children.Add(head);
            Slider slider = new Slider
            {
                Minimum = 0.2,
                Maximum = 1,
                Value = value,
                Margin = new Thickness(2, 7, 2, 0),
                Height = 20,
                Cursor = Cursors.Hand
            };
            slider.ValueChanged += delegate
            {
                valueText.Text = Math.Round(slider.Value * 100).ToString(CultureInfo.InvariantCulture);
                changed(slider.Value);
            };
            Grid.SetRow(slider, 1);
            row.Children.Add(slider);
            return row;
        }

        private UIElement CommandRow(string title, Action action)
        {
            Button button = new Button
            {
                Content = title,
                Height = 32,
                HorizontalContentAlignment = HorizontalAlignment.Left,
                Padding = new Thickness(12, 0, 12, 0),
                Margin = new Thickness(0, 4, 0, 6),
                Background = Brush("#FF181D22"),
                Foreground = Brush("#FFE3E8EC"),
                BorderBrush = Brush("#FF3A424A"),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand,
                FontSize = 11
            };
            button.Click += delegate { action(); };
            return button;
        }

        private static Grid BaseRow()
        {
            Grid row = new Grid { Margin = new Thickness(0, 2, 0, 10) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            return row;
        }

        private static StackPanel RowCopy(string title, string description)
        {
            StackPanel copy = new StackPanel { Margin = new Thickness(0, 0, 12, 0) };
            copy.Children.Add(new TextBlock { Text = title, Foreground = Brush("#FFE8ECEF"), FontSize = 11, FontWeight = FontWeights.Medium });
            if (!string.IsNullOrWhiteSpace(description))
                copy.Children.Add(new TextBlock { Text = description, Foreground = Brush("#FF78838D"), FontSize = 9, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 3, 0, 0) });
            return copy;
        }

        private static Button SmallChoice(string text, bool selected)
        {
            Button button = new Button
            {
                Content = text,
                MinWidth = 54,
                Height = 27,
                Margin = new Thickness(3, 0, 0, 0),
                BorderBrush = Brush("#FF414952"),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand,
                FontSize = 10
            };
            SetChoice(button, selected);
            return button;
        }

        private static void SetChoice(Button button, bool selected)
        {
            button.Background = selected ? Brush("#FFDCE3E9") : Brush("#FF1D2228");
            button.Foreground = selected ? Brush("#FF101419") : Brush("#FFD0D6DC");
        }

        private static Button IconButton(string glyph, string tooltip)
        {
            return new Button
            {
                Content = glyph,
                ToolTip = tooltip,
                Width = 48,
                Height = 51,
                Background = Brushes.Transparent,
                BorderBrush = Brushes.Transparent,
                Foreground = Brush("#FFD6DCE1"),
                FontSize = 17,
                Cursor = Cursors.Hand
            };
        }

        private void SaveGeneral()
        {
            _applyGeneral(_general.Clone());
        }

        private void SaveTheme()
        {
            _applyTheme(_theme.Clone());
        }

        private void SaveFeed()
        {
            try { _feed.Save(_feedPath); } catch { }
        }

        private void OpenUpdateCenter()
        {
            UpdateWindow window = new UpdateWindow(_root, _iconPath);
            window.Owner = this;
            window.Show();
        }

        private static void OpenPath(string path)
        {
            try
            {
                if (path.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
                else
                {
                    if (!Directory.Exists(path)) Directory.CreateDirectory(path);
                    Process.Start(new ProcessStartInfo("explorer.exe", "\"" + path + "\"") { UseShellExecute = true });
                }
            }
            catch { }
        }

        private static BitmapImage LoadBitmap(string path)
        {
            BitmapImage image = new BitmapImage();
            image.BeginInit();
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.UriSource = new Uri(path, UriKind.Absolute);
            image.EndInit();
            if (image.CanFreeze) image.Freeze();
            return image;
        }

        private static Brush Brush(string value)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(value);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }

        private sealed class DisclosureSection
        {
            public Border Root;
            public StackPanel Body;
        }
    }
}
