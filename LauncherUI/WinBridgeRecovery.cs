using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Xml.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Shell;
using System.Windows.Threading;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("WinBridge Recovery")]
[assembly: System.Reflection.AssemblyDescription("Testing stage. Authorized recipients may test and perform secondary development. https://github.com/zemeng5208")]
[assembly: System.Reflection.AssemblyCompany("https://github.com/zemeng5208")]
[assembly: System.Reflection.AssemblyProduct("WinBridge Recovery")]
[assembly: System.Reflection.AssemblyVersion("3.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("3.0.0.0")]

namespace WinBridgeRecovery
{
    internal static class UiButtonChrome
    {
        public static ControlTemplate Create()
        {
            ControlTemplate template = new ControlTemplate(typeof(Button));
            FrameworkElementFactory border = new FrameworkElementFactory(typeof(Border));
            border.SetBinding(Border.BackgroundProperty, ParentBinding("Background"));
            border.SetBinding(Border.BorderBrushProperty, ParentBinding("BorderBrush"));
            border.SetBinding(Border.BorderThicknessProperty, ParentBinding("BorderThickness"));
            border.SetBinding(Border.PaddingProperty, ParentBinding("Padding"));
            border.SetValue(Border.CornerRadiusProperty, new CornerRadius(4));
            border.SetValue(Border.SnapsToDevicePixelsProperty, true);

            FrameworkElementFactory content = new FrameworkElementFactory(typeof(ContentPresenter));
            content.SetBinding(ContentPresenter.ContentProperty, ParentBinding("Content"));
            content.SetBinding(ContentPresenter.ContentTemplateProperty, ParentBinding("ContentTemplate"));
            content.SetBinding(
                ContentPresenter.HorizontalAlignmentProperty,
                ParentBinding("HorizontalContentAlignment"));
            content.SetBinding(
                ContentPresenter.VerticalAlignmentProperty,
                ParentBinding("VerticalContentAlignment"));
            content.SetValue(ContentPresenter.RecognizesAccessKeyProperty, true);
            border.AppendChild(content);
            template.VisualTree = border;
            return template;
        }

        private static Binding ParentBinding(string path)
        {
            return new Binding(path)
            {
                RelativeSource = new RelativeSource(RelativeSourceMode.TemplatedParent)
            };
        }
    }

    internal static class UiScrollChrome
    {
        public static Style Create()
        {
            const string xaml =
                "<Style xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' " +
                "xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' TargetType='{x:Type ScrollBar}'>" +
                "<Setter Property='Width' Value='9'/>" +
                "<Setter Property='Background' Value='Transparent'/>" +
                "<Setter Property='Template'><Setter.Value>" +
                "<ControlTemplate TargetType='{x:Type ScrollBar}'>" +
                "<Grid Background='Transparent'>" +
                "<Track x:Name='PART_Track' IsDirectionReversed='True' Focusable='False'>" +
                "<Track.DecreaseRepeatButton><RepeatButton Command='{x:Static ScrollBar.PageUpCommand}' " +
                "Background='Transparent' BorderThickness='0'/></Track.DecreaseRepeatButton>" +
                "<Track.Thumb><Thumb Margin='2,1'>" +
                "<Thumb.Template><ControlTemplate TargetType='{x:Type Thumb}'>" +
                "<Border Background='#4A6C76' BorderBrush='#718F98' BorderThickness='1' CornerRadius='4'/>" +
                "</ControlTemplate></Thumb.Template></Thumb></Track.Thumb>" +
                "<Track.IncreaseRepeatButton><RepeatButton Command='{x:Static ScrollBar.PageDownCommand}' " +
                "Background='Transparent' BorderThickness='0'/></Track.IncreaseRepeatButton>" +
                "</Track></Grid></ControlTemplate>" +
                "</Setter.Value></Setter></Style>";
            return (Style)XamlReader.Parse(xaml);
        }
    }

    internal static class UiWindowReveal
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct Margins
        {
            public int Left;
            public int Right;
            public int Top;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct AccentPolicy
        {
            public int AccentState;
            public int AccentFlags;
            public int GradientColor;
            public int AnimationId;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct WindowCompositionAttributeData
        {
            public int Attribute;
            public IntPtr Data;
            public int SizeOfData;
        }

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(
            IntPtr window,
            int attribute,
            ref int value,
            int valueSize);

        [DllImport("dwmapi.dll")]
        private static extern int DwmExtendFrameIntoClientArea(
            IntPtr window,
            ref Margins margins);

        [DllImport("user32.dll")]
        private static extern int SetWindowCompositionAttribute(
            IntPtr window,
            ref WindowCompositionAttributeData data);

        public static void ApplyBackdrop(Window window, bool glass)
        {
            IntPtr handle = new WindowInteropHelper(window).Handle;
            if (handle == IntPtr.Zero) return;
            HwndSource source = HwndSource.FromHwnd(handle);
            if (source != null && source.CompositionTarget != null)
                source.CompositionTarget.BackgroundColor =
                    glass ? Colors.Transparent : Colors.Black;
            try
            {
                int backdrop = glass ? 3 : 1;
                DwmSetWindowAttribute(handle, 38, ref backdrop, sizeof(int));
                int dark = 1;
                DwmSetWindowAttribute(handle, 20, ref dark, sizeof(int));
                int corners = glass ? 2 : 1;
                DwmSetWindowAttribute(handle, 33, ref corners, sizeof(int));

                AccentPolicy accent = new AccentPolicy
                {
                    AccentState = glass ? 4 : 0,
                    AccentFlags = glass ? 2 : 0,
                    GradientColor = glass
                        ? unchecked((int)0x5A211B18)
                        : 0,
                    AnimationId = 0
                };
                int size = Marshal.SizeOf(typeof(AccentPolicy));
                IntPtr memory = Marshal.AllocHGlobal(size);
                try
                {
                    Marshal.StructureToPtr(accent, memory, false);
                    WindowCompositionAttributeData data =
                        new WindowCompositionAttributeData
                        {
                            Attribute = 19,
                            Data = memory,
                            SizeOfData = size
                        };
                    SetWindowCompositionAttribute(handle, ref data);
                }
                finally
                {
                    Marshal.FreeHGlobal(memory);
                }
            }
            catch
            {
            }
        }

        public static void Attach(Window window)
        {
            Attach(window, true);
        }

        public static void Attach(Window window, bool centerOnReveal)
        {
            window.BorderBrush = Brushes.Black;
            window.BorderThickness = new Thickness(0);
            WindowChrome.SetWindowChrome(
                window,
                new WindowChrome
                {
                    CaptionHeight = 0,
                    CornerRadius = new CornerRadius(18),
                    GlassFrameThickness = new Thickness(0),
                    ResizeBorderThickness = window.ResizeMode == ResizeMode.NoResize
                        ? new Thickness(0)
                        : new Thickness(6),
                    UseAeroCaptionButtons = false
                });
            window.WindowStartupLocation = WindowStartupLocation.Manual;
            window.Left = -32000;
            window.Top = -32000;
            window.Opacity = 0;
            window.SourceInitialized += delegate
            {
                HwndSource source = HwndSource.FromHwnd(
                    new WindowInteropHelper(window).Handle);
                if (source != null && source.CompositionTarget != null)
                    source.CompositionTarget.BackgroundColor = Colors.Black;
                try
                {
                    int black = 0x000000;
                    DwmSetWindowAttribute(
                        new WindowInteropHelper(window).Handle,
                        34,
                        ref black,
                        sizeof(int));
                    int roundCorners = 2;
                    DwmSetWindowAttribute(
                        new WindowInteropHelper(window).Handle,
                        33,
                        ref roundCorners,
                        sizeof(int));
                }
                catch
                {
                }
            };
            window.Loaded += delegate
            {
                window.Dispatcher.BeginInvoke(
                    DispatcherPriority.Render,
                    new Action(delegate
                    {
                        if (window.IsVisible)
                        {
                            window.UpdateLayout();
                            if (centerOnReveal)
                            {
                                Rect workArea = SystemParameters.WorkArea;
                                window.Left = workArea.Left +
                                    Math.Max(0, (workArea.Width - window.ActualWidth) / 2);
                                window.Top = workArea.Top +
                                    Math.Max(0, (workArea.Height - window.ActualHeight) / 2);
                            }
                            window.Opacity = 1;
                            window.Activate();
                        }
                    }));
            };
        }
    }

    public sealed class LauncherWindow : Window
    {
        private readonly string _root;
        private readonly bool _demoMode;
        private readonly bool _diagnoseMode;
        private readonly SolidColorBrush _bg = MutableBrush("#000000");
        private readonly SolidColorBrush _surface = MutableBrush("#11161A");
        private readonly SolidColorBrush _surface2 = MutableBrush("#161C20");
        private readonly SolidColorBrush _line = MutableBrush("#2A3339");
        private readonly SolidColorBrush _text = MutableBrush("#F1F5F6");
        private readonly SolidColorBrush _muted = MutableBrush("#95A1A8");
        private readonly SolidColorBrush _titleSurface = MutableBrush("#000000");
        private readonly SolidColorBrush _railSurface = MutableBrush("#0E1316");
        private readonly SolidColorBrush _logSurface = MutableBrush("#000000");
        private readonly SolidColorBrush _footerSurface = MutableBrush("#0D1114");
        private readonly SolidColorBrush _particleSurface = MutableBrush("#000000");
        private readonly SolidColorBrush _trackSurface = MutableBrush("#293136");
        private readonly SolidColorBrush _centerLabelSurface = MutableBrush("#D9000000");
        private readonly Brush _cyan = BrushFrom("#36C7D9");
        private readonly Brush _green = BrushFrom("#31D17C");
        private readonly Brush _amber = BrushFrom("#F2B84B");
        private readonly Brush _coral = BrushFrom("#FF746C");

        private Process _process;
        private MinesweeperGameWindow _minesweeperGame;
        private SnakeGameWindow _snakeGame;
        private GameSelectionWindow _gameSelector;
        private ThemeSettingsWindow _themeWindow;
        private AdvancedSettingsWindow _settingsWindow;
        private GeneralSettingsWindow _generalWindow;
        private SocialFeedWindow _socialFeedWindow;
        private LauncherThemeSettings _themeSettings;
        private LauncherGeneralSettings _generalSettings;
        private LauncherLanguageSettings _languageSettings;
        private bool _closingAfterSuccess;
        private bool _launchCompleted;
        private bool _stopRequested;
        private double _targetProgress = 3;
        private double _displayProgress = 3;
        private int _activeStageIndex;

        private TextBlock _heading;
        private TextBlock _subheading;
        private TextBlock _percent;
        private TextBlock _footerStatus;
        private Border _progressFill;
        private Grid _progressTrack;
        private RichTextBox _log;
        private StackPanel _stagePanel;
        private ParticleFlow _particles;
        private DispatcherTimer _progressTimer;
        private DispatcherTimer _heartbeatTimer;
        private DispatcherTimer _demoTimer;
        private DispatcherTimer _closeTimer;
        private DispatcherTimer _logFlushTimer;
        private int _demoIndex;
        private DateTime _engineStartUtc;
        private DateTime _lastOutputUtc;
        private string _baseSubheading = "初始化启动环境";
        private readonly List<StageView> _stages = new List<StageView>();
        private readonly Dictionary<string, PluginView> _plugins =
            new Dictionary<string, PluginView>(StringComparer.OrdinalIgnoreCase);
        private readonly Queue<string> _pendingOutput = new Queue<string>();
        private readonly object _pendingOutputLock = new object();
        private readonly LauncherProcessSession _processSession;
        private bool _skipClosePrompt;

        public LauncherWindow(string root, bool demoMode, bool diagnoseMode)
        {
            _root = root;
            _demoMode = demoMode;
            _diagnoseMode = diagnoseMode;
            _processSession = LauncherProcessSession.Start(_root);
            _themeSettings = LauncherThemeSettings.Load(_root);
            _generalSettings = LauncherGeneralSettings.Load(_root);
            _languageSettings = LauncherLanguageSettings.Load(_root);
            ApplyThemePalette();

            Title = "WinBridge Recovery";
            Width = 1120;
            Height = 760;
            MinWidth = 920;
            MinHeight = 660;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            Background = _bg;
            Foreground = _text;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            if (File.Exists(iconPath))
                Icon = LoadBitmap(iconPath);

            Content = BuildWindow();
            UiWindowReveal.Attach(this);
            Loaded += OnLoaded;
            Closing += OnClosing;
        }

        private UIElement BuildWindow()
        {
            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });

            root.Children.Add(BuildTitleBar());
            Grid.SetRow(BuildMainRegionAndAttach(root), 1);
            Border footer = BuildFooter();
            Grid.SetRow(footer, 2);
            root.Children.Add(footer);

            return root;
        }

        private UIElement BuildTitleBar()
        {
            Border bar = new Border
            {
                Background = _titleSurface,
                BorderBrush = _line,
                BorderThickness = new Thickness(0, 0, 0, 1)
            };

            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            bar.Child = grid;

            StackPanel brand = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(16, 0, 0, 0)
            };

            Border mark = new Border
            {
                Width = 38,
                Height = 38,
                CornerRadius = new CornerRadius(8),
                Background = Brushes.Transparent,
                Margin = new Thickness(0, 0, 10, 0)
            };
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            if (File.Exists(iconPath))
            {
                Image brandIcon = new Image
                {
                    Source = LoadBitmap(iconPath),
                    Width = 36,
                    Height = 36,
                    Stretch = Stretch.Uniform,
                    SnapsToDevicePixels = true,
                    UseLayoutRounding = true
                };
                RenderOptions.SetBitmapScalingMode(
                    brandIcon, BitmapScalingMode.HighQuality);
                mark.Child = brandIcon;
            }
            brand.Children.Add(mark);
            brand.Children.Add(new TextBlock
            {
                Text = "WinBridge Recovery",
                Foreground = _text,
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });

            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(brand);

            StackPanel actions = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            Button minimize = TitleButton("—");
            minimize.Click += delegate { WindowState = WindowState.Minimized; };
            Button close = TitleButton("×");
            close.Click += delegate { Close(); };
            actions.Children.Add(minimize);
            actions.Children.Add(close);
            Grid.SetColumn(actions, 1);
            grid.Children.Add(actions);

            return bar;
        }

        private UIElement BuildMainRegionAndAttach(Grid root)
        {
            Grid body = new Grid();
            body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(205) });
            body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            Border rail = new Border
            {
                Background = _railSurface,
                BorderBrush = _line,
                BorderThickness = new Thickness(0, 0, 1, 0)
            };
            _stagePanel = new StackPanel { Margin = new Thickness(0, 18, 0, 0) };
            rail.Child = _stagePanel;
            AddStage("1", L("系统预检", "System check", "Vérification système", "Comprobación del sistema", "Проверка системы", "فحص النظام"));
            AddStage("2", L("插件完整性", "Plugin integrity", "Intégrité des extensions", "Integridad de complementos", "Целостность плагинов", "سلامة المكونات"));
            AddStage("3", L("运行时", "Runtime", "Environnement", "Entorno de ejecución", "Среда выполнения", "بيئة التشغيل"));
            AddStage("4", L("插件注册", "Plugin registration", "Enregistrement", "Registro de complementos", "Регистрация плагинов", "تسجيل المكونات"));
            AddStage("5", L("启动应用", "Launch app", "Lancer l'application", "Iniciar aplicación", "Запуск приложения", "تشغيل التطبيق"));
            body.Children.Add(rail);

            Grid main = new Grid { Margin = new Thickness(26, 20, 26, 18) };
            main.RowDefinitions.Add(new RowDefinition { Height = new GridLength(182) });
            main.RowDefinitions.Add(new RowDefinition { Height = new GridLength(150) });
            main.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            main.Children.Add(BuildProgressRegion());

            Grid pluginRegion = BuildPluginRegion();
            Grid.SetRow(pluginRegion, 1);
            main.Children.Add(pluginRegion);

            Border logRegion = BuildLogRegion();
            Grid.SetRow(logRegion, 2);
            main.Children.Add(logRegion);

            Grid.SetColumn(main, 1);
            body.Children.Add(main);
            Grid.SetRow(body, 1);
            root.Children.Add(body);
            return body;
        }

        private UIElement BuildProgressRegion()
        {
            Grid region = new Grid();
            region.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            region.RowDefinitions.Add(new RowDefinition { Height = new GridLength(14) });
            region.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            Grid headline = new Grid();
            headline.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            headline.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            StackPanel copy = new StackPanel();
            _heading = new TextBlock
            {
                Text = _diagnoseMode
                    ? L("正在执行只读诊断", "Running read-only diagnostics", "Diagnostic en lecture seule", "Diagnóstico de solo lectura", "Диагностика только для чтения", "تشخيص للقراءة فقط")
                    : L("准备 ChatGPT Desktop", "Preparing ChatGPT Desktop", "Préparation de ChatGPT Desktop", "Preparando ChatGPT Desktop", "Подготовка ChatGPT Desktop", "جار تجهيز ChatGPT Desktop"),
                Foreground = _text,
                FontSize = 24,
                FontWeight = FontWeights.SemiBold
            };
            _subheading = new TextBlock
            {
                Text = L("初始化启动环境", "Initializing launch environment", "Initialisation de l'environnement", "Inicializando el entorno", "Инициализация среды", "تهيئة بيئة التشغيل"),
                Foreground = _muted,
                FontSize = 12,
                Margin = new Thickness(0, 6, 0, 0)
            };
            copy.Children.Add(_heading);
            copy.Children.Add(_subheading);
            headline.Children.Add(copy);

            _percent = new TextBlock
            {
                Text = "3%",
                Foreground = _text,
                FontSize = 38,
                FontWeight = FontWeights.Light,
                VerticalAlignment = VerticalAlignment.Bottom
            };
            Grid.SetColumn(_percent, 1);
            headline.Children.Add(_percent);
            region.Children.Add(headline);

            _progressTrack = new Grid
            {
                Height = 7,
                Margin = new Thickness(0, 2, 0, 0),
                Background = _trackSurface,
                ClipToBounds = true
            };
            _progressFill = new Border
            {
                HorizontalAlignment = HorizontalAlignment.Left,
                Background = new LinearGradientBrush(
                    ColorFrom("#31D17C"),
                    ColorFrom("#36C7D9"),
                    0)
            };
            _progressTrack.Children.Add(_progressFill);
            _progressTrack.SizeChanged += delegate { UpdateProgressFill(); };
            Grid.SetRow(_progressTrack, 1);
            region.Children.Add(_progressTrack);

            Border particleFrame = new Border
            {
                Background = _particleSurface,
                BorderBrush = _line,
                BorderThickness = new Thickness(1, 0, 1, 1),
                ClipToBounds = true
            };
            Grid particleGrid = new Grid();
            _particles = new ParticleFlow(ParticleTheme.NeonBlack());
            particleGrid.Children.Add(_particles);
            TextBlock centerLabel = new TextBlock
            {
                Text = L("安全检查与更新感知修复", "Safe checks and update-aware recovery", "Contrôles sûrs et récupération adaptative", "Comprobaciones seguras y recuperación adaptable", "Безопасная проверка и восстановление", "فحص آمن وإصلاح متوافق مع التحديثات"),
                Foreground = BrushFrom("#DCEBED"),
                FontSize = 13,
                FontWeight = FontWeights.Medium,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Padding = new Thickness(14, 6, 14, 6),
                Background = _centerLabelSurface
            };
            particleGrid.Children.Add(centerLabel);
            particleFrame.Child = particleGrid;
            Grid.SetRow(particleFrame, 2);
            region.Children.Add(particleFrame);

            return region;
        }

        private Grid BuildPluginRegion()
        {
            Grid region = new Grid { Margin = new Thickness(0, 16, 0, 16) };
            region.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            region.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            region.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            AddPlugin(
                region, 0, "Browser",
                "Plugin-Browser.png", "B");
            AddPlugin(
                region, 1, "Chrome",
                "Plugin-Chrome.png", "C");
            AddPlugin(
                region, 2, "Computer Use",
                "Plugin-Computer-Use.png", "CU");
            return region;
        }

        private Border BuildLogRegion()
        {
            Border border = new Border
            {
                Background = _logSurface,
                BorderBrush = _line,
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(5)
            };

            Grid grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(34) });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            Grid header = new Grid
            {
                Background = _surface2
            };
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            header.Children.Add(new TextBlock
            {
                Text = L("实时日志", "Live log", "Journal en direct", "Registro en vivo", "Журнал", "السجل المباشر"),
                Foreground = _text,
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 0, 0)
            });
            TextBlock hint = new TextBlock
            {
                Text = L("保存在启动器 Logs 目录", "Saved in the launcher's Logs folder", "Enregistré dans le dossier Logs", "Guardado en la carpeta Logs", "Сохраняется в папке Logs", "يحفظ في مجلد Logs"),
                Foreground = _muted,
                FontSize = 10,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0)
            };
            Grid.SetColumn(hint, 1);
            header.Children.Add(hint);
            grid.Children.Add(header);

            _log = new RichTextBox
            {
                IsReadOnly = true,
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                Foreground = BrushFrom("#E4ECF1"),
                FontFamily = new FontFamily("Cascadia Code, Cascadia Mono, Consolas"),
                FontSize = 11.5,
                Padding = new Thickness(10, 8, 10, 8),
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
            };
            _log.Document.PageWidth = 3000;
            _log.Document.LineHeight = 18;
            _log.Resources.Add(typeof(ScrollBar), UiScrollChrome.Create());
            Grid.SetRow(_log, 1);
            grid.Children.Add(_log);
            border.Child = grid;
            return border;
        }

        private Border BuildFooter()
        {
            Border footer = new Border
            {
                Background = _footerSurface,
                BorderBrush = _line,
                BorderThickness = new Thickness(0, 1, 0, 0)
            };

            Grid grid = new Grid { Margin = new Thickness(16, 0, 12, 0) };
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            StackPanel status = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            Ellipse dot = new Ellipse
            {
                Width = 8,
                Height = 8,
                Fill = _green,
                Margin = new Thickness(0, 0, 8, 0)
            };
            _footerStatus = new TextBlock
            {
                Text = _demoMode
                    ? L("演示模式，不会修改系统", "Demo mode; no system changes", "Mode démo, sans modification", "Modo demo, sin cambios", "Демо без изменений", "وضع تجريبي بلا تغييرات")
                    : (_diagnoseMode
                        ? L("只读诊断，不会执行修复", "Read-only diagnostics", "Diagnostic en lecture seule", "Diagnóstico de solo lectura", "Диагностика без изменений", "تشخيص للقراءة فقط")
                        : L("自动修复模式", "Automatic recovery mode", "Mode de récupération automatique", "Modo de recuperación automática", "Автоматическое восстановление", "وضع الإصلاح التلقائي")),
                Foreground = _muted,
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Center
            };
            Button settings = ActionButton("\u2699", false);
            settings.Width = 34;
            settings.MinWidth = 34;
            settings.Height = 32;
            settings.Padding = new Thickness(0);
            settings.Margin = new Thickness(0, 0, 14, 0);
            settings.Background = Brushes.Transparent;
            settings.BorderBrush = Brushes.Transparent;
            settings.BorderThickness = new Thickness(0);
            settings.Content = BuildSettingsGearIcon();
            settings.ToolTip = L("设置", "Settings", "Paramètres", "Configuración", "Настройки", "الإعدادات");
            System.Windows.Automation.AutomationProperties.SetName(
                settings, L("设置", "Settings", "Paramètres", "Configuración", "Настройки", "الإعدادات"));
            settings.Click += delegate { OpenSettingsMenu(); };
            status.Children.Add(settings);
            status.Children.Add(dot);
            status.Children.Add(_footerStatus);
            grid.Children.Add(status);

            StackPanel controls = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            Button logs = ActionButton(L("打开日志", "Open logs", "Ouvrir les journaux", "Abrir registros", "Открыть журналы", "فتح السجلات"), false);
            logs.Click += delegate
            {
                string logsPath = System.IO.Path.Combine(_root, "Logs");
                if (Directory.Exists(logsPath))
                    Process.Start(new ProcessStartInfo("explorer.exe", "\"" + logsPath + "\""));
            };
            Button stop = ActionButton(L("停止", "Stop", "Arrêter", "Detener", "Остановить", "إيقاف"), true);
            stop.Click += delegate { RequestStop(); };
            controls.Children.Add(logs);
            controls.Children.Add(stop);
            Grid.SetColumn(controls, 1);
            grid.Children.Add(controls);
            footer.Child = grid;
            return footer;
        }

        private FrameworkElement BuildSettingsGearIcon()
        {
            Grid icon = new Grid
            {
                Width = 28,
                Height = 28
            };
            icon.Children.Add(new TextBlock
            {
                Text = "\uE713",
                FontFamily = new FontFamily("Segoe Fluent Icons"),
                FontSize = 17,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Effect = new DropShadowEffect
                {
                    Color = Colors.Black,
                    BlurRadius = 5,
                    ShadowDepth = 1,
                    Opacity = 0.42
                }
            });
            return icon;
        }

        private void AddStage(string index, string name)
        {
            Border item = new Border
            {
                Height = 82,
                BorderBrush = _line,
                BorderThickness = new Thickness(0, 0, 0, 1),
                Padding = new Thickness(18, 12, 12, 10)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(46) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            Grid orbitHost = new Grid
            {
                Width = 38,
                Height = 38,
                Margin = new Thickness(-2, -5, 0, 0),
                VerticalAlignment = VerticalAlignment.Top,
                HorizontalAlignment = HorizontalAlignment.Left
            };
            StageProgressOrbit orbit = new StageProgressOrbit();
            orbit.SetTheme(
                string.Equals(_themeSettings.Theme, "glass", StringComparison.OrdinalIgnoreCase),
                _themeSettings.ReduceMotion);
            orbitHost.Children.Add(orbit);

            TextBlock number = new TextBlock
            {
                Text = index,
                Foreground = CreateStageNumberBrush(
                    string.Equals(_themeSettings.Theme, "glass", StringComparison.OrdinalIgnoreCase)),
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Effect = new DropShadowEffect
                {
                    Color = Colors.Black,
                    BlurRadius = 4,
                    ShadowDepth = 0,
                    Opacity = 0.7
                }
            };
            orbitHost.Children.Add(number);
            grid.Children.Add(orbitHost);

            StackPanel text = new StackPanel { Margin = new Thickness(0, 0, 0, 0) };
            TextBlock title = new TextBlock
            {
                Text = name,
                Foreground = _text,
                FontSize = 13,
                FontWeight = FontWeights.Medium
            };
            TextBlock state = new TextBlock
            {
                Text = L("等待中", "Waiting", "En attente", "En espera", "Ожидание", "قيد الانتظار"),
                Foreground = _muted,
                FontSize = 10,
                Margin = new Thickness(0, 8, 0, 0)
            };
            text.Children.Add(title);
            text.Children.Add(state);
            Grid.SetColumn(text, 1);
            grid.Children.Add(text);
            item.Child = grid;
            _stagePanel.Children.Add(item);
            _stages.Add(new StageView(item, orbit, number, state));
        }

        private void AddPlugin(
            Grid parent,
            int column,
            string name,
            string iconFile,
            string glyph)
        {
            Border border = new Border
            {
                Background = _surface,
                BorderBrush = _line,
                BorderThickness = new Thickness(column == 0 ? 1 : 0, 1, 1, 1),
                Padding = new Thickness(18, 17, 18, 15),
                Effect = new DropShadowEffect
                {
                    Color = Colors.Black,
                    BlurRadius = 13,
                    ShadowDepth = 3,
                    Opacity = 0.23
                }
            };

            Grid grid = new Grid();
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            grid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            StackPanel header = new StackPanel { Orientation = Orientation.Horizontal };
            Border icon = new Border
            {
                Width = 34,
                Height = 34,
                CornerRadius = new CornerRadius(9),
                Background = BrushFrom("#DBF5F8FA"),
                BorderBrush = BrushFrom("#7296A2AA"),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 0, 10, 0)
            };
            string iconPath = ResolvePluginIcon(name, iconFile);
            if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath))
            {
                Image image = new Image
                {
                    Source = LoadBitmap(iconPath),
                    Width = 30,
                    Height = 30,
                    Stretch = Stretch.Uniform,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
                image.Clip = new RectangleGeometry(
                    new Rect(0, 0, 30, 30), 7, 7);
                RenderOptions.SetBitmapScalingMode(
                    image, BitmapScalingMode.HighQuality);
                icon.Child = image;
            }
            else
            {
                icon.Child = new TextBlock
                {
                    Text = glyph,
                    Foreground = _cyan,
                    FontWeight = FontWeights.Bold,
                    FontSize = glyph.Length > 1 ? 9 : 12,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };
            }
            header.Children.Add(icon);
            header.Children.Add(new TextBlock
            {
                Text = name,
                Foreground = _text,
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });
            grid.Children.Add(header);

            TextBlock status = new TextBlock
            {
                Text = L("等待检查", "Awaiting check", "En attente de contrôle", "Esperando comprobación", "Ожидание проверки", "بانتظار الفحص"),
                Foreground = _muted,
                FontSize = 11,
                Margin = new Thickness(0, 12, 0, 0)
            };
            Grid.SetRow(status, 1);
            grid.Children.Add(status);

            Grid track = new Grid
            {
                Height = 4,
                Margin = new Thickness(0, 16, 0, 0),
                Background = _trackSurface,
                VerticalAlignment = VerticalAlignment.Bottom,
                ClipToBounds = true
            };
            Border fill = new Border
            {
                Width = 0,
                HorizontalAlignment = HorizontalAlignment.Left,
                Background = _cyan
            };
            track.Children.Add(fill);
            Grid.SetRow(track, 2);
            grid.Children.Add(track);

            border.Child = grid;
            Grid.SetColumn(border, column);
            parent.Children.Add(border);
            _plugins[name] = new PluginView(status, track, fill);
        }

        private string ResolvePluginIcon(string name, string fallbackFile)
        {
            string plugin = string.Equals(
                name, "Computer Use", StringComparison.OrdinalIgnoreCase)
                ? "computer-use"
                : name.ToLowerInvariant();
            string file = string.Equals(
                name, "Browser", StringComparison.OrdinalIgnoreCase)
                ? "composer-icon.png"
                : string.Equals(
                    name, "Chrome", StringComparison.OrdinalIgnoreCase)
                    ? "google-chrome-composer.png"
                    : "app-icon.png";
            try
            {
                string pluginRoot = System.IO.Path.Combine(
                    Environment.GetFolderPath(
                        Environment.SpecialFolder.UserProfile),
                    ".codex", "plugins", "cache", "openai-bundled", plugin);
                string latest = System.IO.Path.Combine(
                    pluginRoot, "latest", "assets", file);
                if (File.Exists(latest)) return latest;
                if (Directory.Exists(pluginRoot))
                {
                    DirectoryInfo[] versions =
                        new DirectoryInfo(pluginRoot).GetDirectories();
                    Array.Sort(
                        versions,
                        delegate(DirectoryInfo left, DirectoryInfo right)
                        {
                            return right.LastWriteTimeUtc.CompareTo(
                                left.LastWriteTimeUtc);
                        });
                    for (int i = 0; i < versions.Length; i++)
                    {
                        string candidate = System.IO.Path.Combine(
                            versions[i].FullName, "assets", file);
                        if (File.Exists(candidate)) return candidate;
                    }
                }
            }
            catch
            {
            }
            return System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", fallbackFile);
        }

        private Button TitleButton(string text)
        {
            Button button = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = text,
                Width = 46,
                Height = 46,
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                Foreground = _muted,
                FontSize = 15,
                Cursor = Cursors.Hand
            };
            button.MouseEnter += delegate { button.Background = BrushFrom("#20272C"); };
            button.MouseLeave += delegate { button.Background = Brushes.Transparent; };
            return button;
        }

        private Button ActionButton(string text, bool danger)
        {
            Button button = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = text,
                MinWidth = 88,
                Height = 30,
                Margin = new Thickness(8, 0, 0, 0),
                Padding = new Thickness(14, 0, 14, 0),
                BorderThickness = new Thickness(1),
                BorderBrush = danger ? BrushFrom("#A64E49") : BrushFrom("#4B5961"),
                Background = danger ? BrushFrom("#2A1717") : BrushFrom("#171D21"),
                Foreground = danger ? BrushFrom("#FF9892") : _text,
                Cursor = Cursors.Hand
            };
            return button;
        }

        private void OnLoaded(object sender, RoutedEventArgs e)
        {
            ApplyThemePalette();
            UiWindowReveal.ApplyBackdrop(
                this,
                string.Equals(
                    _themeSettings.Theme,
                    "glass",
                    StringComparison.OrdinalIgnoreCase));
            if (!_themeSettings.ReduceMotion) _particles.Start();
            _progressTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(24) };
            _progressTimer.Tick += delegate
            {
                _displayProgress += (_targetProgress - _displayProgress) * 0.08;
                if (Math.Abs(_targetProgress - _displayProgress) < 0.1)
                    _displayProgress = _targetProgress;
                _percent.Text = Math.Round(_displayProgress).ToString() + "%";
                UpdateProgressFill();
                UpdateStageOrbits();
            };
            _progressTimer.Start();

            _heartbeatTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _heartbeatTimer.Tick += delegate
            {
                if (_process == null || _process.HasExited) return;
                double quietSeconds = (DateTime.UtcNow - _lastOutputUtc).TotalSeconds;
                if (quietSeconds < 4) return;
                TimeSpan elapsed = DateTime.UtcNow - _engineStartUtc;
                string elapsedText = elapsed.TotalMinutes >= 1
                    ? string.Format("{0}:{1:00}", (int)elapsed.TotalMinutes, elapsed.Seconds)
                    : string.Format("{0} 秒", Math.Max(1, (int)elapsed.TotalSeconds));
                _subheading.Text = _baseSubheading + " · " + L("后台持续处理中 ", "Still working ", "Traitement en cours ", "Procesando ", "Обработка ", "المعالجة مستمرة ") + elapsedText;
                _footerStatus.Text = L("处理仍在进行，界面保持响应", "Processing continues; the interface remains responsive", "Le traitement continue; l'interface reste active", "El proceso continúa; la interfaz responde", "Обработка продолжается; интерфейс отвечает", "المعالجة مستمرة والواجهة تستجيب");
            };
            _heartbeatTimer.Start();

            _logFlushTimer = new DispatcherTimer
            {
                Interval = TimeSpan.FromMilliseconds(80)
            };
            _logFlushTimer.Tick += delegate { FlushOutputQueue(); };
            _logFlushTimer.Start();

            SetStage(0);
            _heading.Text = L("检测 Windows 环境", "Checking Windows environment", "Vérification de Windows", "Comprobando Windows", "Проверка среды Windows", "فحص بيئة Windows");
            _baseSubheading = L("正在识别系统、架构、Desktop 包与文件系统", "Detecting the system, architecture, Desktop package, and file system", "Détection du système, de l'architecture et du paquet Desktop", "Detectando sistema, arquitectura y paquete Desktop", "Определение системы, архитектуры и пакета Desktop", "التعرف على النظام والبنية وحزمة Desktop");
            _subheading.Text = _baseSubheading;
            _footerStatus.Text = L("自适应预检正在后台运行", "Adaptive preflight is running", "Le contrôle adaptatif est en cours", "La comprobación adaptativa está en curso", "Адаптивная проверка выполняется", "الفحص التكيفي قيد التشغيل");
            _targetProgress = 4;
            RunLogMaintenance(false);
            BeginEnvironmentPreflight();
        }

        private void BeginEnvironmentPreflight()
        {
            string stateDirectory = System.IO.Path.Combine(
                _root, "LauncherUI", "State");
            ThreadPool.QueueUserWorkItem(delegate
            {
                EnvironmentProfileResult result = null;
                Exception failure = null;
                try
                {
                    result = FirstRunEnvironment.Ensure(stateDirectory);
                }
                catch (Exception ex)
                {
                    failure = ex;
                }
                if (Dispatcher.HasShutdownStarted || Dispatcher.HasShutdownFinished)
                    return;
                Dispatcher.BeginInvoke(new Action(delegate
                {
                    FinishEnvironmentPreflight(result, failure);
                }));
            });
        }

        private void FinishEnvironmentPreflight(
            EnvironmentProfileResult environment,
            Exception failure)
        {
            if (failure != null)
            {
                Fail("\u73AF\u5883\u9884\u68C0\u5931\u8D25\uFF1A" + failure.Message);
                return;
            }

            AppendLog((environment.Created ? "[OK] " : "[INFO] ") +
                "Windows adaptation: " + environment.Summary);
            if (environment.Details != null)
            {
                for (int i = 0; i < environment.Details.Length; i++)
                    AppendLog("[INFO] Adaptive preflight: " + environment.Details[i]);
            }
            _targetProgress = 6;
            if (_demoMode)
                StartDemo();
            else
                StartRepairEngine();
        }

        private void OpenSettingsMenu()
        {
            if (_settingsWindow != null)
            {
                _settingsWindow.Activate();
                return;
            }
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            _settingsWindow = new AdvancedSettingsWindow(
                _root,
                iconPath,
                _generalSettings.Clone(),
                _themeSettings.Clone(),
                delegate(LauncherGeneralSettings settings)
                {
                    _generalSettings = settings.Clone();
                    _generalSettings.Save(_root);
                    RunLogMaintenance(false);
                },
                delegate(LauncherThemeSettings settings)
                {
                    _themeSettings = settings.Clone();
                    _themeSettings.Save(_root);
                    ApplyThemePalette();
                    UiWindowReveal.ApplyBackdrop(
                        this,
                        string.Equals(_themeSettings.Theme, "glass", StringComparison.OrdinalIgnoreCase));
                    if (_particles != null)
                    {
                        if (_themeSettings.ReduceMotion) _particles.Stop();
                        else _particles.Start();
                    }
                },
                OpenGameSelector,
                OpenSocialFeed);
            _settingsWindow.Owner = this;
            _settingsWindow.Closed += delegate { _settingsWindow = null; };
            _settingsWindow.Show();
        }

        private void OpenSocialFeed()
        {
            if (_socialFeedWindow != null)
            {
                if (_socialFeedWindow.WindowState == WindowState.Minimized)
                    _socialFeedWindow.WindowState = WindowState.Normal;
                _socialFeedWindow.Activate();
                return;
            }
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            string stateDirectory = System.IO.Path.Combine(_root, "LauncherUI", "State");
            _socialFeedWindow = new SocialFeedWindow(iconPath, stateDirectory);
            _socialFeedWindow.Owner = this;
            _socialFeedWindow.Closed += delegate { _socialFeedWindow = null; };
            _socialFeedWindow.Show();
        }

        private void OpenGeneralSettings()
        {
            if (_generalWindow != null)
            {
                if (_generalWindow.WindowState == WindowState.Minimized)
                    _generalWindow.WindowState = WindowState.Normal;
                _generalWindow.Activate();
                return;
            }
            if (_settingsWindow != null) _settingsWindow.Close();
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            _generalWindow = new GeneralSettingsWindow(
                iconPath,
                _generalSettings.Clone(),
                delegate(LauncherGeneralSettings settings)
                {
                    _generalSettings = settings.Clone();
                    _generalSettings.Save(_root);
                    RunLogMaintenance(false);
                });
            _generalWindow.Owner = this;
            _generalWindow.Closed += delegate { _generalWindow = null; };
            _generalWindow.Show();
        }

        private void OpenThemeSettings()
        {
            if (_themeWindow != null)
            {
                if (_themeWindow.WindowState == WindowState.Minimized)
                    _themeWindow.WindowState = WindowState.Normal;
                _themeWindow.Activate();
                return;
            }
            if (_settingsWindow != null) _settingsWindow.Close();
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            _themeWindow = new ThemeSettingsWindow(
                iconPath,
                _themeSettings.Clone(),
                delegate(LauncherThemeSettings settings)
                {
                    _themeSettings = settings.Clone();
                    _themeSettings.Save(_root);
                    ApplyThemePalette();
                    UiWindowReveal.ApplyBackdrop(
                        this,
                        string.Equals(
                            _themeSettings.Theme,
                            "glass",
                            StringComparison.OrdinalIgnoreCase));
                    if (_particles != null)
                    {
                        if (_themeSettings.ReduceMotion) _particles.Stop();
                        else _particles.Start();
                    }
                });
            _themeWindow.Owner = this;
            _themeWindow.Closed += delegate { _themeWindow = null; };
            _themeWindow.Show();
        }

        private void ApplyThemePalette()
        {
            bool glass = string.Equals(
                _themeSettings.Theme,
                "glass",
                StringComparison.OrdinalIgnoreCase);
            if (!glass)
            {
                SetBrush(_bg, "#FF000000");
                SetBrush(_surface, "#FF11161A");
                SetBrush(_surface2, "#FF161C20");
                SetBrush(_line, "#FF2A3339");
                SetBrush(_text, "#FFF1F5F6");
                SetBrush(_muted, "#FF95A1A8");
                SetBrush(_titleSurface, "#FF000000");
                SetBrush(_railSurface, "#FF0E1316");
                SetBrush(_logSurface, "#FF000000");
                SetBrush(_footerSurface, "#FF0D1114");
                SetBrush(_particleSurface, "#FF000000");
                SetBrush(_trackSurface, "#FF293136");
                SetBrush(_centerLabelSurface, "#D9000000");
            }
            else
            {
                byte panel = (byte)Math.Max(
                    72,
                    Math.Min(184, Math.Round(
                        62 + (_themeSettings.PanelOpacity * 128))));
                byte soft = (byte)Math.Max(48, panel - 38);
                byte strong = (byte)Math.Min(208, panel + 22);
                double tint = Math.Max(0.2, Math.Min(1, _themeSettings.TintStrength));
                byte blueLift = (byte)Math.Round(12 * tint);
                byte cyanLift = (byte)Math.Round(7 * tint);
                SetBrush(_bg, Color.FromArgb(
                    (byte)255, (byte)10, (byte)(14 + cyanLift), (byte)(18 + blueLift)));
                SetBrush(_surface, Color.FromArgb(
                    panel, (byte)25, (byte)(29 + cyanLift), (byte)(34 + blueLift)));
                SetBrush(_surface2, Color.FromArgb(
                    strong, (byte)31, (byte)(36 + cyanLift), (byte)(42 + blueLift)));
                SetBrush(_line, Color.FromArgb(118, 210, 224, 235));
                SetBrush(_text, "#FFF7F8FA");
                SetBrush(_muted, "#FFD1D7DC");
                SetBrush(_titleSurface, Color.FromArgb(panel, 18, 23, 29));
                SetBrush(_railSurface, Color.FromArgb(soft, 31, 39, 47));
                SetBrush(_logSurface, Color.FromArgb(soft, 8, 12, 17));
                SetBrush(_footerSurface, Color.FromArgb(panel, 17, 22, 28));
                SetBrush(_particleSurface, Color.FromArgb(54, 7, 12, 18));
                SetBrush(_trackSurface, Color.FromArgb(126, 65, 76, 85));
                SetBrush(_centerLabelSurface, Color.FromArgb(150, 8, 12, 17));
            }
            if (glass)
            {
                LinearGradientBrush environment = new LinearGradientBrush
                {
                    StartPoint = new Point(0, 0),
                    EndPoint = new Point(1, 1)
                };
                environment.GradientStops.Add(
                    new GradientStop(Color.FromArgb(52, 121, 172, 205), 0));
                environment.GradientStops.Add(
                    new GradientStop(Color.FromArgb(18, 21, 29, 38), 0.38));
                environment.GradientStops.Add(
                    new GradientStop(Color.FromArgb(36, 118, 70, 132), 0.74));
                environment.GradientStops.Add(
                    new GradientStop(Color.FromArgb(12, 7, 9, 12), 1));
                Background = environment;
            }
            else
            {
                Background = _bg;
            }
            if (_particles != null)
                _particles.Background = glass
                    ? new SolidColorBrush(Color.FromArgb(42, 9, 12, 16))
                    : Brushes.Black;
            for (int i = 0; i < _stages.Count; i++)
            {
                _stages[i].Orbit.SetTheme(glass, _themeSettings.ReduceMotion);
                _stages[i].Number.Foreground = CreateStageNumberBrush(glass);
            }
        }

        private void OpenGameSelector()
        {
            if (_gameSelector != null)
            {
                if (_gameSelector.WindowState == WindowState.Minimized)
                    _gameSelector.WindowState = WindowState.Normal;
                _gameSelector.Activate();
                return;
            }

            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            _gameSelector = new GameSelectionWindow(
                iconPath,
                OpenMinesweeperGame,
                OpenSnakeGame);
            _gameSelector.Closed += delegate
            {
                _gameSelector = null;
                TryCloseAfterGameEnds();
            };
            _gameSelector.Show();
        }

        private void OpenMinesweeperGame()
        {
            if (_minesweeperGame != null)
            {
                if (_minesweeperGame.WindowState == WindowState.Minimized)
                    _minesweeperGame.WindowState = WindowState.Normal;
                _minesweeperGame.Activate();
                return;
            }
            string stateDirectory = System.IO.Path.Combine(
                _root, "LauncherUI", "State");
            string scorePath = System.IO.Path.Combine(
                stateDirectory, "neon-minesweeper-best-time.txt");
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            _minesweeperGame = new MinesweeperGameWindow(scorePath, iconPath);
            _minesweeperGame.Closed += delegate
            {
                _minesweeperGame = null;
                TryCloseAfterGameEnds();
            };
            _minesweeperGame.Show();
        }

        private void OpenSnakeGame()
        {
            if (_snakeGame != null)
            {
                if (_snakeGame.WindowState == WindowState.Minimized)
                    _snakeGame.WindowState = WindowState.Normal;
                _snakeGame.Activate();
                return;
            }
            string stateDirectory = System.IO.Path.Combine(
                _root, "LauncherUI", "State");
            string scorePath = System.IO.Path.Combine(
                stateDirectory, "neon-snake-best-score.txt");
            string iconPath = System.IO.Path.Combine(
                _root, "LauncherUI", "Assets", "WinBridge.png");
            _snakeGame = new SnakeGameWindow(scorePath, iconPath);
            _snakeGame.Closed += delegate
            {
                _snakeGame = null;
                TryCloseAfterGameEnds();
            };
            _snakeGame.Show();
        }

        private void StartRepairEngine()
        {
            string script = System.IO.Path.Combine(_root, "Invoke-WinBridge-Configured.ps1");
            if (!File.Exists(script))
            {
                Fail("找不到修复引擎: " + script);
                return;
            }

            string mode = _diagnoseMode ? "DiagnoseOnly" : "RepairAndLaunch";
            _engineStartUtc = DateTime.UtcNow;
            _lastOutputUtc = _engineStartUtc;
            _heading.Text = "分析当前官方安装包";
            _baseSubheading = "正在读取插件清单与运行时内容哈希";
            _subheading.Text = _baseSubheading;
            _targetProgress = 6;
            ProcessStartInfo start = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" + script +
                    "\" -Mode " + mode + " -NoPause",
                WorkingDirectory = _root,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            _process = new Process { StartInfo = start, EnableRaisingEvents = true };
            _process.OutputDataReceived += delegate(object s, DataReceivedEventArgs a)
            {
                if (a.Data != null) QueueEngineLine(a.Data);
            };
            _process.ErrorDataReceived += delegate(object s, DataReceivedEventArgs a)
            {
                if (a.Data != null) QueueEngineLine("[ERROR] " + a.Data);
            };
            _process.Exited += delegate
            {
                int code = _process.ExitCode;
                Dispatcher.BeginInvoke(new Action<int>(HandleExit), code);
            };

            try
            {
                _process.Start();
                _processSession.Register(_process);
                _process.BeginOutputReadLine();
                _process.BeginErrorReadLine();
                AppendLog("[INFO] 已启动现有安全修复引擎。");
            }
            catch (Exception ex)
            {
                Fail("无法启动修复引擎: " + ex.Message);
            }
        }

        private void StartDemo()
        {
            string[] lines =
            {
                "[INFO] WinBridge Recovery 3.0.0",
                "[INFO] Package: OpenAI.Codex current Store package",
                "[OK] Chrome and Edge are fully stopped.",
                "[OK] Static plugin state is healthy.",
                "[INFO] Preparing current package marketplace.",
                "[INFO] Preparing plugin cache: browser@current",
                "[INFO] Preparing plugin cache: chrome@current",
                "[INFO] Preparing plugin cache: computer-use@current",
                "[INFO] Updating scoped Codex configuration.",
                "[INFO] Validating registration with the current package CLI.",
                "[OK] Repair completed and all static gates passed.",
                "[INFO] Launching the packaged Desktop executable.",
                "[OK] Post-start clean check 1 of 2.",
                "[OK] Post-start static verification passed."
            };

            _demoTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(620) };
            _demoTimer.Tick += delegate
            {
                if (_demoIndex >= lines.Length)
                {
                    _demoTimer.Stop();
                    _targetProgress = 100;
                    Complete("演示完成，未修改任何系统状态。", false);
                    return;
                }
                HandleLine(lines[_demoIndex++]);
            };
            _demoTimer.Start();
        }

        private void HandleLine(string line)
        {
            _lastOutputUtc = DateTime.UtcNow;
            _subheading.Text = _baseSubheading;
            AppendLog(line);
            string lower = line.ToLowerInvariant();

            if (lower.Contains("[error]") || lower.Contains("fatal error"))
            {
                _footerStatus.Text = Ui("检测到错误，等待引擎完成回滚");
            }

            if (lower.Contains("package:"))
            {
                SetProgress(8, 0, "正在识别官方 Store 包", "读取当前安装版本");
            }
            else if (lower.Contains("official plugin: browser@"))
            {
                SetProgress(12, 1, "读取官方插件清单", "已识别 Browser");
                SetPlugin("Browser", "已识别官方版本", 24, _cyan);
            }
            else if (lower.Contains("official plugin: chrome@"))
            {
                SetProgress(14, 1, "读取官方插件清单", "已识别 Chrome");
                SetPlugin("Chrome", "已识别官方版本", 24, _cyan);
            }
            else if (lower.Contains("official plugin: computer-use@"))
            {
                SetProgress(15, 1, "读取官方插件清单", "已识别 Computer Use");
                SetPlugin("Computer Use", "已识别官方版本", 24, _cyan);
            }
            else if (lower.Contains("chrome and edge are fully stopped") ||
                     lower.Contains("already fully stopped"))
            {
                SetProgress(16, 0, "系统预检完成", "浏览器文件锁已释放");
            }
            else if (lower.Contains("static plugin state is healthy"))
            {
                SetProgress(34, 1, "插件状态正常", "无需替换现有插件文件");
                SetPlugin("Browser", "文件完整", 100, _green);
                SetPlugin("Chrome", "文件完整", 100, _green);
                SetPlugin("Computer Use", "文件完整", 100, _green);
            }
            else if (lower.Contains("preparing current package marketplace"))
            {
                SetProgress(40, 1, "同步官方插件源", "准备 bundled marketplace");
            }
            else if (lower.Contains("preparing current package app-server helpers"))
            {
                SetProgress(47, 2, "准备运行时", "同步 app-server 辅助组件");
            }
            else if (lower.Contains("content-addressed cli runtime"))
            {
                SetProgress(53, 2, "准备运行时", "验证官方 CLI 内容哈希");
            }
            else if (lower.Contains("current package node runtime"))
            {
                SetProgress(59, 2, "准备运行时", "同步当前版本 Node 运行环境");
            }
            else if (lower.Contains("plugin cache: browser"))
            {
                SetProgress(66, 1, "正在处理 Browser", "更新并验证插件缓存");
                SetPlugin("Browser", "正在验证", 68, _cyan);
            }
            else if (lower.Contains("plugin cache: chrome"))
            {
                SetProgress(72, 1, "正在处理 Chrome", "更新并验证插件缓存");
                SetPlugin("Browser", "验证完成", 100, _green);
                SetPlugin("Chrome", "正在验证", 72, _cyan);
            }
            else if (lower.Contains("plugin cache: computer-use"))
            {
                SetProgress(77, 1, "正在处理 Computer Use", "更新并验证插件缓存");
                SetPlugin("Chrome", "验证完成", 100, _green);
                SetPlugin("Computer Use", "正在验证", 77, _cyan);
            }
            else if (lower.Contains("updating scoped codex configuration"))
            {
                SetProgress(82, 3, "更新插件注册", "保留其他 MCP 与用户配置");
            }
            else if (lower.Contains("updating chrome native host paths"))
            {
                SetProgress(86, 3, "连接 Chrome", "更新 Native Host 路径");
            }
            else if (lower.Contains("validating registration"))
            {
                SetProgress(89, 3, "验证插件注册", "使用当前官方 CLI 复核");
            }
            else if (lower.Contains("repair completed and all static gates passed"))
            {
                SetProgress(92, 3, "修复与静态验证完成", "准备启动 ChatGPT Desktop");
                SetAllPluginsComplete();
            }
            else if (lower.Contains("no repair is needed"))
            {
                SetProgress(84, 3, "当前状态健康", "无需修复，准备启动");
                SetAllPluginsComplete();
            }
            else if (lower.Contains("launching the packaged desktop"))
            {
                SetProgress(95, 4, "正在启动 ChatGPT Desktop", "加载官方资源镜像");
            }
            else if (lower.Contains("desktop started. waiting up to 120 seconds"))
            {
                SetProgress(96, 4, "等待启动状态稳定", "将完成两次连续清洁检查");
            }
            else if (lower.Contains("post-start clean check 1 of 2"))
            {
                SetProgress(98, 4, "启动后复核", "清洁检查 1 / 2，等待第二次稳定结果");
            }
            else if (lower.Contains("post-start clean check 2 of 2"))
            {
                SetProgress(99, 4, "启动后复核", "清洁检查 2 / 2");
            }
            else if (lower.Contains("post-start static verification passed"))
            {
                SetProgress(100, 4, "启动完成", "三插件静态状态稳定");
                SetAllPluginsComplete();
            }
        }

        private void HandleExit(int exitCode)
        {
            FlushOutputQueue();
            if (_stopRequested)
            {
                Fail("操作已由用户停止。");
                return;
            }

            if (exitCode == 0)
            {
                _targetProgress = 100;
                if (_diagnoseMode)
                    Complete("只读诊断完成。", false);
                else
                    Complete("ChatGPT Desktop 已启动并完成静态复核。", true);
            }
            else
            {
                Fail("安全启动器未完成。请查看实时日志或打开 Logs 目录。");
            }
        }

        private void SetProgress(double value, int stage, string heading, string subheading)
        {
            if (value > _targetProgress) _targetProgress = value;
            _heading.Text = Ui(heading);
            _baseSubheading = Ui(subheading);
            _subheading.Text = _baseSubheading;
            SetStage(stage);
        }

        private void SetStage(int activeIndex)
        {
            _activeStageIndex = Math.Max(0, Math.Min(_stages.Count - 1, activeIndex));
            for (int i = 0; i < _stages.Count; i++)
            {
                StageView stage = _stages[i];
                if (i < activeIndex)
                {
                    stage.State.Text = L("已完成", "Complete", "Terminé", "Completado", "Готово", "مكتمل");
                    stage.State.Foreground = _green;
                    stage.Orbit.SetVisualState(StageOrbitState.Complete);
                    stage.Container.Background = Brushes.Transparent;
                }
                else if (i == activeIndex)
                {
                    stage.State.Text = L("进行中", "In progress", "En cours", "En curso", "Выполняется", "قيد التنفيذ");
                    stage.State.Foreground = _cyan;
                    stage.Orbit.SetVisualState(StageOrbitState.Active);
                    stage.Container.Background = BrushFrom("#122126");
                }
                else
                {
                    stage.State.Text = L("等待中", "Waiting", "En attente", "En espera", "Ожидание", "قيد الانتظار");
                    stage.State.Foreground = _muted;
                    stage.Orbit.SetVisualState(StageOrbitState.Waiting);
                    stage.Container.Background = Brushes.Transparent;
                }
            }
            UpdateStageOrbits();
        }

        private void UpdateStageOrbits()
        {
            if (_stages.Count == 0) return;
            for (int i = 0; i < _stages.Count; i++)
            {
                StageView stage = _stages[i];
                if (i < _activeStageIndex || _launchCompleted)
                    stage.Orbit.Progress = 1;
                else if (i == _activeStageIndex)
                    stage.Orbit.Progress = GetStageLocalProgress(i, _displayProgress);
                else
                    stage.Orbit.Progress = 0;
                stage.Orbit.Advance();
            }
        }

        private static double GetStageLocalProgress(int stage, double globalProgress)
        {
            double start;
            double end;
            switch (stage)
            {
                case 0: start = 3; end = 16; break;
                case 1: start = 12; end = 77; break;
                case 2: start = 47; end = 59; break;
                case 3: start = 82; end = 92; break;
                default: start = 95; end = 100; break;
            }
            double value = (globalProgress - start) / Math.Max(1, end - start);
            return Math.Max(0.16, Math.Min(0.98, value));
        }

        private static Brush CreateStageNumberBrush(bool glass)
        {
            LinearGradientBrush brush = new LinearGradientBrush
            {
                StartPoint = new Point(0, 0),
                EndPoint = new Point(1, 1)
            };
            if (glass)
            {
                brush.GradientStops.Add(new GradientStop(ColorFrom("#FFFFFFFF"), 0));
                brush.GradientStops.Add(new GradientStop(ColorFrom("#FF91E8FF"), 0.48));
                brush.GradientStops.Add(new GradientStop(ColorFrom("#FFFFA9EA"), 1));
            }
            else
            {
                brush.GradientStops.Add(new GradientStop(ColorFrom("#FF72F4FF"), 0));
                brush.GradientStops.Add(new GradientStop(ColorFrom("#FF9D78FF"), 0.52));
                brush.GradientStops.Add(new GradientStop(ColorFrom("#FFFF5ECB"), 1));
            }
            return brush;
        }

        private void SetPlugin(string name, string status, double percent, Brush color)
        {
            PluginView plugin;
            if (!_plugins.TryGetValue(name, out plugin)) return;
            plugin.Status.Text = Ui(status);
            plugin.Status.Foreground = color;
            plugin.Fill.Background = color;
            plugin.Percent = percent;
            UpdatePluginFill(plugin);
        }

        private void SetAllPluginsComplete()
        {
            SetPlugin("Browser", "验证完成", 100, _green);
            SetPlugin("Chrome", "验证完成", 100, _green);
            SetPlugin("Computer Use", "验证完成", 100, _green);
        }

        private void UpdatePluginFill(PluginView plugin)
        {
            if (plugin.Track.ActualWidth > 0)
                plugin.Fill.Width = plugin.Track.ActualWidth * plugin.Percent / 100.0;
            else
                plugin.Track.Dispatcher.BeginInvoke(new Action(delegate { UpdatePluginFill(plugin); }),
                    DispatcherPriority.Loaded);
        }

        private void UpdateProgressFill()
        {
            if (_progressTrack != null && _progressTrack.ActualWidth > 0)
                _progressFill.Width = _progressTrack.ActualWidth * _displayProgress / 100.0;
        }

        private void QueueEngineLine(string line)
        {
            lock (_pendingOutputLock)
            {
                _pendingOutput.Enqueue(line);
            }
        }

        private void FlushOutputQueue()
        {
            List<string> batch = new List<string>();
            lock (_pendingOutputLock)
            {
                while (_pendingOutput.Count > 0 && batch.Count < 80)
                    batch.Add(_pendingOutput.Dequeue());
            }
            for (int i = 0; i < batch.Count; i++)
                HandleLine(batch[i]);
        }

        private void RunLogMaintenance(bool report)
        {
            string script = System.IO.Path.Combine(
                _root, "Maintain-Launcher-State.ps1");
            if (!File.Exists(script)) return;
            try
            {
                ProcessStartInfo start = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" +
                        script + "\" -LauncherRoot \"" + _root +
                        "\" -SessionLimit " + _generalSettings.LogSessionLimit +
                        " -MaxBytes " + _generalSettings.MaxLogBytes,
                    WorkingDirectory = _root,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                using (Process maintenance = Process.Start(start))
                {
                    if (!maintenance.WaitForExit(8000))
                    {
                        try { maintenance.Kill(); }
                        catch { }
                        if (report) AppendLog("[WARN] Log maintenance timed out.");
                        return;
                    }
                    string output = maintenance.StandardOutput.ReadToEnd().Trim();
                    string error = maintenance.StandardError.ReadToEnd().Trim();
                    if (report && !string.IsNullOrWhiteSpace(output))
                        AppendLog("[INFO] " + output);
                    if (report && maintenance.ExitCode != 0 &&
                        !string.IsNullOrWhiteSpace(error))
                        AppendLog("[WARN] Log maintenance: " + error);
                }
            }
            catch (Exception ex)
            {
                if (report)
                    AppendLog("[WARN] Log maintenance was skipped: " + ex.Message);
            }
        }

        private void ApplyConfiguredBackupRetention()
        {
            if (_demoMode || _diagnoseMode) return;
            int limit = Math.Max(1, Math.Min(3, _generalSettings.BackupRetentionLimit));
            try
            {
                string launcherDrive = System.IO.Path.GetPathRoot(_root);
                string backupRoot = System.IO.Path.Combine(launcherDrive, "CodexPluginRepairBackups");
                string storagePath = System.IO.Path.Combine(_root, "Config", "storage.ini");
                if (File.Exists(storagePath))
                {
                    foreach (string line in File.ReadAllLines(storagePath, Encoding.UTF8))
                    {
                        if (!line.StartsWith("backup_root=", StringComparison.OrdinalIgnoreCase)) continue;
                        string configured = line.Substring("backup_root=".Length).Trim();
                        if (System.IO.Path.IsPathRooted(configured))
                            backupRoot = System.IO.Path.GetFullPath(configured).TrimEnd('\\');
                        break;
                    }
                }
                if (!Directory.Exists(backupRoot)) return;
                DirectoryInfo[] backups = new DirectoryInfo(backupRoot)
                    .GetDirectories("G-*", SearchOption.TopDirectoryOnly);
                Array.Sort(backups, delegate(DirectoryInfo left, DirectoryInfo right)
                {
                    int byTime = right.LastWriteTimeUtc.CompareTo(left.LastWriteTimeUtc);
                    return byTime != 0 ? byTime : StringComparer.OrdinalIgnoreCase.Compare(right.Name, left.Name);
                });
                for (int i = limit; i < backups.Length; i++)
                    backups[i].Delete(true);
                AppendLog("[OK] Backup retention: " + Math.Min(limit, backups.Length) +
                    " of " + limit + " configured backup slots are in use.");
            }
            catch (Exception ex)
            {
                AppendLog("[WARN] Configured backup retention was skipped: " + ex.Message);
            }
        }

        private void AppendLog(string line)
        {
            int limit = Math.Max(120, _generalSettings.UiLogLineLimit);
            if (_log.Document.Blocks.Count >= limit)
            {
                int remove = Math.Min(24, _log.Document.Blocks.Count - limit + 24);
                for (int i = 0; i < remove &&
                    _log.Document.Blocks.FirstBlock != null; i++)
                    _log.Document.Blocks.Remove(_log.Document.Blocks.FirstBlock);
            }

            Paragraph paragraph = new Paragraph { Margin = new Thickness(0, 0, 0, 2) };
            Brush color = BrushFrom("#E4ECF1");
            string tag = string.Empty;
            if (line.IndexOf("[OK]", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                color = BrushFrom("#52F2A1");
                tag = "[OK]";
            }
            else if (line.IndexOf("[WARN]", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                color = BrushFrom("#FFD66B");
                tag = "[WARN]";
            }
            else if (line.IndexOf("[ERROR]", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                color = BrushFrom("#FF7B7B");
                tag = "[ERROR]";
            }
            else if (line.IndexOf("[INFO]", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                color = BrushFrom("#54DDF2");
                tag = "[INFO]";
            }
            int tagIndex = string.IsNullOrEmpty(tag)
                ? -1
                : line.IndexOf(tag, StringComparison.OrdinalIgnoreCase);
            if (tagIndex >= 0)
            {
                if (tagIndex > 0)
                    paragraph.Inlines.Add(new Run(line.Substring(0, tagIndex))
                    {
                        Foreground = BrushFrom("#8EA0AA")
                    });
                paragraph.Inlines.Add(new Run(line.Substring(tagIndex, tag.Length))
                {
                    Foreground = color,
                    FontWeight = FontWeights.Bold
                });
                AppendHighlightedLogText(
                    paragraph,
                    line.Substring(tagIndex + tag.Length));
            }
            else
            {
                AppendHighlightedLogText(paragraph, line);
            }
            _log.Document.Blocks.Add(paragraph);
            _log.ScrollToEnd();
        }

        private void AppendHighlightedLogText(Paragraph paragraph, string text)
        {
            const string pattern =
                @"([A-Za-z]:\\[^\r\n;]+|(?:browser|chrome|computer-use|node_repl|marketplace|plugin|runtime)(?:@[0-9.]+)?|\b(?:passed|healthy|completed|ready|verified|successfully|unchanged|current)\b|\b(?:[0-9]+\.){2,3}[0-9]+\b|\b[0-9a-fA-F]{8,64}\b)";
            int cursor = 0;
            foreach (Match match in Regex.Matches(
                text, pattern, RegexOptions.IgnoreCase))
            {
                if (match.Index > cursor)
                    paragraph.Inlines.Add(new Run(
                        text.Substring(cursor, match.Index - cursor))
                    {
                        Foreground = BrushFrom("#E7EEF2")
                    });

                string token = match.Value;
                Brush tokenColor;
                if (Regex.IsMatch(token,
                    @"^(passed|healthy|completed|ready|verified|successfully|unchanged|current)$",
                    RegexOptions.IgnoreCase))
                    tokenColor = BrushFrom("#61F2A4");
                else if (token.IndexOf(@":\", StringComparison.Ordinal) >= 0)
                    tokenColor = BrushFrom("#A7C8FF");
                else if (Regex.IsMatch(token,
                    @"^(browser|chrome|computer-use|node_repl|marketplace|plugin|runtime)",
                    RegexOptions.IgnoreCase))
                    tokenColor = BrushFrom("#63E6F2");
                else
                    tokenColor = BrushFrom("#E8C875");

                paragraph.Inlines.Add(new Run(token)
                {
                    Foreground = tokenColor,
                    FontWeight = FontWeights.SemiBold
                });
                cursor = match.Index + match.Length;
            }

            if (cursor < text.Length)
                paragraph.Inlines.Add(new Run(text.Substring(cursor))
                {
                    Foreground = BrushFrom("#E7EEF2")
                });
        }

        private void Complete(string message, bool closeAutomatically)
        {
            if (_heartbeatTimer != null) _heartbeatTimer.Stop();
            _launchCompleted = true;
            _targetProgress = 100;
            SetStage(4);
            for (int i = 0; i < _stages.Count; i++)
            {
                _stages[i].State.Text = L("已完成", "Complete", "Terminé", "Completado", "Готово", "مكتمل");
                _stages[i].State.Foreground = _green;
                _stages[i].Orbit.SetVisualState(StageOrbitState.Complete);
                _stages[i].Orbit.Progress = 1;
                _stages[i].Container.Background = Brushes.Transparent;
            }
            SetAllPluginsComplete();
            _heading.Text = L("全部完成", "All complete", "Tout est terminé", "Todo completado", "Все завершено", "اكتمل كل شيء");
            message = Ui(message);
            _subheading.Text = message;
            _footerStatus.Text = message;
            AppendLog("[OK] " + message);
            if (_minesweeperGame != null)
                _minesweeperGame.NotifyLaunchComplete();
            if (_snakeGame != null)
                _snakeGame.NotifyLaunchComplete();

            RunLogMaintenance(false);
            ApplyConfiguredBackupRetention();
            if (closeAutomatically && _generalSettings.AutoCloseAfterSuccess)
            {
                _closeTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromSeconds(1)
                };
                _closeTimer.Tick += delegate
                {
                    if (_generalSettings.KeepOpenWhileGaming && IsGameActive())
                    {
                        _footerStatus.Text = L("小游戏正在运行，启动器将保持打开", "A mini game is running; the launcher will stay open", "Un mini-jeu est actif; le lanceur reste ouvert", "Hay un minijuego activo; el iniciador seguirá abierto", "Мини-игра запущена; окно останется открытым", "هناك لعبة صغيرة قيد التشغيل؛ سيبقى المشغل مفتوحا");
                        return;
                    }
                    _closeTimer.Stop();
                    _closingAfterSuccess = true;
                    Close();
                };
                _closeTimer.Interval = TimeSpan.FromSeconds(3.2);
                _closeTimer.Start();
            }
        }

        private bool IsGameActive()
        {
            return _minesweeperGame != null || _snakeGame != null || _gameSelector != null;
        }

        private void TryCloseAfterGameEnds()
        {
            if (!_launchCompleted ||
                !_generalSettings.AutoCloseAfterSuccess ||
                IsGameActive())
                return;
            if (_closeTimer == null)
            {
                _closeTimer = new DispatcherTimer
                {
                    Interval = TimeSpan.FromMilliseconds(650)
                };
                _closeTimer.Tick += delegate
                {
                    _closeTimer.Stop();
                    _closingAfterSuccess = true;
                    Close();
                };
                _closeTimer.Start();
            }
            else
            {
                _closeTimer.Interval = TimeSpan.FromMilliseconds(650);
            }
        }

        private void Fail(string message)
        {
            if (_heartbeatTimer != null) _heartbeatTimer.Stop();
            message = Ui(message);
            _heading.Text = L("启动未完成", "Launch incomplete", "Lancement incomplet", "Inicio incompleto", "Запуск не завершен", "لم يكتمل التشغيل");
            _subheading.Text = message;
            _footerStatus.Text = message;
            _percent.Foreground = _coral;
            AppendLog("[ERROR] " + message);
        }

        private void RequestStop()
        {
            if (_process == null || _process.HasExited)
            {
                Close();
                return;
            }

            MessageBoxResult result = MessageBox.Show(
                L("停止后，本次启动流程将中断。若修复事务尚未提交，下一次运行会按现有安全逻辑自动恢复。\n\n确定停止吗？", "Stopping will interrupt this launch. If a recovery transaction is not committed, the next run will recover it using the existing safety logic.\n\nStop now?", "L'arrêt interrompra ce lancement. Une transaction non validée sera récupérée au prochain démarrage.\n\nArrêter maintenant ?", "Al detener se interrumpirá este inicio. Una transacción sin confirmar se recuperará en la próxima ejecución.\n\n¿Detener ahora?", "Остановка прервет запуск. Незавершенная транзакция будет восстановлена при следующем запуске.\n\nОстановить?", "سيؤدي الإيقاف إلى مقاطعة التشغيل. ستتم استعادة أي معاملة غير مكتملة في التشغيل التالي.\n\nهل تريد الإيقاف؟"),
                L("停止 WinBridge Recovery", "Stop WinBridge Recovery", "Arrêter WinBridge Recovery", "Detener WinBridge Recovery", "Остановить WinBridge Recovery", "إيقاف WinBridge Recovery"),
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);
            if (result != MessageBoxResult.Yes) return;

            _stopRequested = true;
            _skipClosePrompt = true;
            _processSession.RequestCleanup();
            Close();
        }

        private void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
        {
            if (_progressTimer != null) _progressTimer.Stop();
            if (_heartbeatTimer != null) _heartbeatTimer.Stop();
            if (_demoTimer != null) _demoTimer.Stop();
            if (_closeTimer != null) _closeTimer.Stop();
            if (_logFlushTimer != null) _logFlushTimer.Stop();
            FlushOutputQueue();
            if (_process != null && !_process.HasExited)
            {
                if (!_skipClosePrompt && !_closingAfterSuccess)
                {
                    MessageBoxResult result = MessageBox.Show(
                        L("安全启动流程仍在运行。关闭界面会停止本次流程。\n\n确定关闭吗？", "The safe-launch process is still running. Closing this window will stop it.\n\nClose now?", "Le lancement sécurisé est toujours en cours. Fermer cette fenêtre l'arrêtera.\n\nFermer maintenant ?", "El inicio seguro sigue en curso. Cerrar esta ventana lo detendrá.\n\n¿Cerrar ahora?", "Безопасный запуск еще выполняется. Закрытие окна остановит его.\n\nЗакрыть?", "لا تزال عملية التشغيل الآمن جارية. سيؤدي إغلاق النافذة إلى إيقافها.\n\nهل تريد الإغلاق؟"),
                        L("关闭启动器", "Close launcher", "Fermer le lanceur", "Cerrar iniciador", "Закрыть лаунчер", "إغلاق المشغل"),
                        MessageBoxButton.YesNo,
                        MessageBoxImage.Warning);
                    if (result != MessageBoxResult.Yes)
                    {
                        e.Cancel = true;
                        return;
                    }
                }
                _stopRequested = true;
            }
            _processSession.RequestCleanup();
            if (_minesweeperGame != null)
            {
                _minesweeperGame.Close();
                _minesweeperGame = null;
            }
            if (_snakeGame != null)
            {
                _snakeGame.Close();
                _snakeGame = null;
            }
            if (_gameSelector != null)
            {
                _gameSelector.Close();
                _gameSelector = null;
            }
            if (_themeWindow != null)
            {
                _themeWindow.Close();
                _themeWindow = null;
            }
            if (_settingsWindow != null)
            {
                _settingsWindow.Close();
                _settingsWindow = null;
            }
            if (_generalWindow != null)
            {
                _generalWindow.Close();
                _generalWindow = null;
            }
            if (_socialFeedWindow != null)
            {
                _socialFeedWindow.Close();
                _socialFeedWindow = null;
            }
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

        private string L(string zh, string en, string fr, string es, string ru, string ar)
        {
            return LauncherLocale.Pick(_languageSettings == null ? "en" : _languageSettings.Code,
                zh, en, fr, es, ru, ar);
        }

        private string Ui(string text)
        {
            if (_languageSettings == null || _languageSettings.Code == "zh") return text;
            switch (text)
            {
                case "已识别官方版本": return L(text, "Official version detected", "Version officielle détectée", "Versión oficial detectada", "Официальная версия обнаружена", "تم اكتشاف الإصدار الرسمي");
                case "文件完整": return L(text, "Files complete", "Fichiers complets", "Archivos completos", "Файлы целы", "الملفات مكتملة");
                case "正在验证": return L(text, "Verifying", "Vérification", "Verificando", "Проверка", "جار التحقق");
                case "验证完成": return L(text, "Verified", "Vérifié", "Verificado", "Проверено", "تم التحقق");
                case "正在识别官方 Store 包": return L(text, "Detecting the official Store package", "Détection du paquet Store officiel", "Detectando el paquete oficial de Store", "Поиск официального пакета Store", "جار اكتشاف حزمة Store الرسمية");
                case "读取当前安装版本": return L(text, "Reading the installed version", "Lecture de la version installée", "Leyendo la versión instalada", "Чтение установленной версии", "قراءة الإصدار المثبت");
                case "读取官方插件清单": return L(text, "Reading the official plugin manifest", "Lecture du manifeste officiel", "Leyendo el manifiesto oficial", "Чтение официального манифеста", "قراءة بيان المكونات الرسمي");
                case "已识别 Browser": return L(text, "Browser detected", "Browser détecté", "Browser detectado", "Browser обнаружен", "تم اكتشاف Browser");
                case "已识别 Chrome": return L(text, "Chrome detected", "Chrome détecté", "Chrome detectado", "Chrome обнаружен", "تم اكتشاف Chrome");
                case "已识别 Computer Use": return L(text, "Computer Use detected", "Computer Use détecté", "Computer Use detectado", "Computer Use обнаружен", "تم اكتشاف Computer Use");
                case "系统预检完成": return L(text, "System check complete", "Vérification système terminée", "Comprobación completada", "Проверка системы завершена", "اكتمل فحص النظام");
                case "浏览器文件锁已释放": return L(text, "Browser file locks released", "Verrous du navigateur libérés", "Bloqueos del navegador liberados", "Блокировки браузера сняты", "تم تحرير أقفال المتصفح");
                case "插件状态正常": return L(text, "Plugin state is healthy", "État des extensions sain", "Estado de complementos correcto", "Состояние плагинов исправно", "حالة المكونات سليمة");
                case "无需替换现有插件文件": return L(text, "Existing plugin files need no replacement", "Aucun remplacement nécessaire", "No se necesita reemplazo", "Замена файлов не требуется", "لا حاجة لاستبدال الملفات");
                case "同步官方插件源": return L(text, "Syncing the official plugin source", "Synchronisation de la source officielle", "Sincronizando la fuente oficial", "Синхронизация официального источника", "مزامنة مصدر المكونات الرسمي");
                case "准备 bundled marketplace": return L(text, "Preparing the bundled marketplace", "Préparation du marketplace intégré", "Preparando el marketplace incluido", "Подготовка встроенного marketplace", "تجهيز سوق المكونات المضمن");
                case "准备运行时": return L(text, "Preparing runtime", "Préparation de l'environnement", "Preparando el entorno", "Подготовка среды", "تجهيز بيئة التشغيل");
                case "同步 app-server 辅助组件": return L(text, "Syncing app-server helpers", "Synchronisation des composants app-server", "Sincronizando componentes de app-server", "Синхронизация компонентов app-server", "مزامنة مكونات app-server المساعدة");
                case "验证官方 CLI 内容哈希": return L(text, "Verifying the official CLI content hash", "Vérification du hachage du CLI officiel", "Verificando el hash del CLI oficial", "Проверка хеша официального CLI", "التحقق من بصمة محتوى CLI الرسمي");
                case "同步当前版本 Node 运行环境": return L(text, "Syncing the current Node runtime", "Synchronisation de l'environnement Node actuel", "Sincronizando el entorno Node actual", "Синхронизация текущей среды Node", "مزامنة بيئة Node الحالية");
                case "更新并验证插件缓存": return L(text, "Updating and verifying plugin cache", "Mise à jour et vérification du cache", "Actualizando y verificando la caché", "Обновление и проверка кэша", "تحديث ذاكرة المكونات والتحقق منها");
                case "更新插件注册": return L(text, "Updating plugin registration", "Mise à jour de l'enregistrement", "Actualizando el registro", "Обновление регистрации", "تحديث تسجيل المكونات");
                case "保留其他 MCP 与用户配置": return L(text, "Preserving other MCP and user settings", "Conservation des autres réglages MCP", "Conservando otros ajustes MCP", "Сохранение других MCP и настроек", "الحفاظ على MCP وإعدادات المستخدم");
                case "连接 Chrome": return L(text, "Connecting Chrome", "Connexion à Chrome", "Conectando Chrome", "Подключение Chrome", "الاتصال بمتصفح Chrome");
                case "更新 Native Host 路径": return L(text, "Updating the Native Host path", "Mise à jour du chemin Native Host", "Actualizando la ruta de Native Host", "Обновление пути Native Host", "تحديث مسار Native Host");
                case "验证插件注册": return L(text, "Verifying plugin registration", "Vérification de l'enregistrement", "Verificando el registro", "Проверка регистрации", "التحقق من تسجيل المكونات");
                case "使用当前官方 CLI 复核": return L(text, "Rechecking with the current official CLI", "Nouvelle vérification avec le CLI officiel", "Revisando con el CLI oficial actual", "Повторная проверка текущим официальным CLI", "إعادة التحقق باستخدام CLI الرسمي الحالي");
                case "修复与静态验证完成": return L(text, "Recovery and static checks complete", "Récupération et contrôles terminés", "Recuperación y comprobaciones completadas", "Восстановление и проверки завершены", "اكتمل الإصلاح والفحص الثابت");
                case "准备启动 ChatGPT Desktop": return L(text, "Preparing to launch ChatGPT Desktop", "Préparation du lancement de ChatGPT Desktop", "Preparando el inicio de ChatGPT Desktop", "Подготовка запуска ChatGPT Desktop", "الاستعداد لتشغيل ChatGPT Desktop");
                case "当前状态健康": return L(text, "Current state is healthy", "État actuel sain", "El estado actual es correcto", "Текущее состояние исправно", "الحالة الحالية سليمة");
                case "无需修复，准备启动": return L(text, "No recovery needed; preparing to launch", "Aucune récupération requise", "No se necesita recuperación", "Восстановление не требуется", "لا حاجة للإصلاح؛ جار التشغيل");
                case "正在启动 ChatGPT Desktop": return L(text, "Launching ChatGPT Desktop", "Lancement de ChatGPT Desktop", "Iniciando ChatGPT Desktop", "Запуск ChatGPT Desktop", "جار تشغيل ChatGPT Desktop");
                case "加载官方资源镜像": return L(text, "Loading the official resource mirror", "Chargement du miroir de ressources officiel", "Cargando el espejo de recursos oficial", "Загрузка официального зеркала ресурсов", "تحميل مرآة الموارد الرسمية");
                case "等待启动状态稳定": return L(text, "Waiting for startup to stabilize", "Attente de stabilisation", "Esperando estabilización", "Ожидание стабилизации", "بانتظار استقرار التشغيل");
                case "将完成两次连续清洁检查": return L(text, "Waiting for two consecutive clean checks", "Attente de deux contrôles propres consécutifs", "Esperando dos comprobaciones limpias consecutivas", "Ожидание двух последовательных чистых проверок", "بانتظار فحصين نظيفين متتاليين");
                case "启动后复核": return L(text, "Post-launch verification", "Vérification après lancement", "Verificación posterior", "Проверка после запуска", "التحقق بعد التشغيل");
                case "清洁检查 1 / 2，等待第二次稳定结果": return L(text, "Clean check 1 / 2; waiting for the second stable result", "Contrôle propre 1 / 2 ; attente du second résultat", "Comprobación limpia 1 / 2; esperando el segundo resultado", "Чистая проверка 1 / 2; ожидание второго результата", "الفحص النظيف 1 / 2؛ بانتظار النتيجة الثانية");
                case "清洁检查 2 / 2": return L(text, "Clean check 2 / 2", "Contrôle propre 2 / 2", "Comprobación limpia 2 / 2", "Чистая проверка 2 / 2", "الفحص النظيف 2 / 2");
                case "启动完成": return L(text, "Launch complete", "Lancement terminé", "Inicio completado", "Запуск завершен", "اكتمل التشغيل");
                case "三插件静态状态稳定": return L(text, "All three plugins have a stable static state", "Les trois extensions sont stables", "Los tres complementos están estables", "Все три плагина стабильны", "حالة المكونات الثلاثة مستقرة");
                case "只读诊断完成。": return L(text, "Read-only diagnostics complete.", "Diagnostic terminé.", "Diagnóstico completado.", "Диагностика завершена.", "اكتمل التشخيص.");
                case "ChatGPT Desktop 已启动并完成静态复核。": return L(text, "ChatGPT Desktop started and passed static verification.", "ChatGPT Desktop a démarré et a été vérifié.", "ChatGPT Desktop se inició y verificó.", "ChatGPT Desktop запущен и проверен.", "تم تشغيل ChatGPT Desktop والتحقق منه.");
                case "安全启动器未完成。请查看实时日志或打开 Logs 目录。": return L(text, "Safe launch did not complete. Review the live log or Logs folder.", "Le lancement sûr a échoué. Consultez les journaux.", "El inicio seguro no se completó. Revise los registros.", "Безопасный запуск не завершен. Проверьте журналы.", "لم يكتمل التشغيل الآمن. راجع السجلات.");
                case "演示完成，未修改任何系统状态。": return L(text, "Demo complete; no system state was changed.", "Démonstration terminée ; aucun état système modifié.", "Demostración completada; no se modificó el sistema.", "Демонстрация завершена; состояние системы не изменено.", "اكتمل العرض؛ لم تتغير حالة النظام.");
                case "检测到错误，等待引擎完成回滚": return L(text, "An error was detected; waiting for the engine to finish rollback", "Erreur détectée ; attente de la restauration", "Se detectó un error; esperando la reversión", "Обнаружена ошибка; ожидание отката", "تم اكتشاف خطأ؛ بانتظار اكتمال التراجع");
                default: return text;
            }
        }

        private sealed class LauncherProcessSession
        {
            private readonly string _sessionPath;
            private readonly string _cleanupPath;
            private readonly object _sync = new object();

            private LauncherProcessSession(string sessionPath)
            {
                _sessionPath = sessionPath;
                _cleanupPath = sessionPath + ".cleanup";
            }

            public static LauncherProcessSession Start(string root)
            {
                string stateDirectory = System.IO.Path.Combine(root, "LauncherUI", "State");
                Directory.CreateDirectory(stateDirectory);
                Process current = Process.GetCurrentProcess();
                string sessionPath = System.IO.Path.Combine(
                    stateDirectory,
                    "process-session-" + current.Id.ToString(CultureInfo.InvariantCulture) + ".txt");
                LauncherProcessSession session = new LauncherProcessSession(sessionPath);
                try
                {
                    File.WriteAllText(
                        sessionPath,
                        "launcher|" + current.Id.ToString(CultureInfo.InvariantCulture) + "|" +
                        current.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture) +
                        Environment.NewLine,
                        new UTF8Encoding(false));
                    string guardian = System.IO.Path.Combine(
                        root, "LauncherUI", "WinBridgeGuardian.exe");
                    if (File.Exists(guardian))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = guardian,
                            Arguments = "--watch \"" + sessionPath + "\"",
                            WorkingDirectory = System.IO.Path.GetDirectoryName(guardian),
                            UseShellExecute = false,
                            CreateNoWindow = true
                        });
                    }
                }
                catch
                {
                }
                return session;
            }

            public void Register(Process process)
            {
                if (process == null) return;
                try
                {
                    string line = "process|" +
                        process.Id.ToString(CultureInfo.InvariantCulture) + "|" +
                        process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture) +
                        Environment.NewLine;
                    lock (_sync)
                    {
                        File.AppendAllText(_sessionPath, line, new UTF8Encoding(false));
                    }
                }
                catch
                {
                }
            }

            public void RequestCleanup()
            {
                try
                {
                    lock (_sync)
                    {
                        File.WriteAllText(
                            _cleanupPath,
                            DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                            new UTF8Encoding(false));
                    }
                }
                catch
                {
                }
            }
        }

        private static Brush BrushFrom(string color)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(color);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }

        private static SolidColorBrush MutableBrush(string color)
        {
            return new SolidColorBrush(ColorFrom(color));
        }

        private static void SetBrush(SolidColorBrush brush, string color)
        {
            brush.Color = ColorFrom(color);
        }

        private static void SetBrush(SolidColorBrush brush, Color color)
        {
            brush.Color = color;
        }

        private static Color ColorFrom(string color)
        {
            return (Color)ColorConverter.ConvertFromString(color);
        }

        private sealed class StageView
        {
            public readonly Border Container;
            public readonly StageProgressOrbit Orbit;
            public readonly TextBlock Number;
            public readonly TextBlock State;

            public StageView(
                Border container,
                StageProgressOrbit orbit,
                TextBlock number,
                TextBlock state)
            {
                Container = container;
                Orbit = orbit;
                Number = number;
                State = state;
            }
        }

        private sealed class PluginView
        {
            public readonly TextBlock Status;
            public readonly Grid Track;
            public readonly Border Fill;
            public double Percent;

            public PluginView(TextBlock status, Grid track, Border fill)
            {
                Status = status;
                Track = track;
                Fill = fill;
            }
        }
    }

    internal enum StageOrbitState
    {
        Waiting,
        Active,
        Complete
    }

    internal sealed class StageProgressOrbit : FrameworkElement
    {
        private const int PointCount = 88;
        private double _progress;
        private double _phase;
        private bool _glass;
        private bool _reduceMotion;
        private StageOrbitState _state;

        public StageProgressOrbit()
        {
            Width = 38;
            Height = 38;
            SnapsToDevicePixels = false;
            IsHitTestVisible = false;
        }

        public double Progress
        {
            get { return _progress; }
            set
            {
                double next = Math.Max(0, Math.Min(1, value));
                if (Math.Abs(_progress - next) < 0.001) return;
                _progress = next;
                InvalidateVisual();
            }
        }

        public void SetTheme(bool glass, bool reduceMotion)
        {
            _glass = glass;
            _reduceMotion = reduceMotion;
            InvalidateVisual();
        }

        public void SetVisualState(StageOrbitState state)
        {
            if (_state == state) return;
            _state = state;
            InvalidateVisual();
        }

        public void Advance()
        {
            if (!_reduceMotion)
            {
                double speed = _state == StageOrbitState.Active
                    ? 0.075
                    : (_state == StageOrbitState.Complete ? 0.018 : 0.008);
                _phase += speed;
                if (_phase > Math.PI * 2) _phase -= Math.PI * 2;
            }
            InvalidateVisual();
        }

        protected override void OnRender(DrawingContext dc)
        {
            base.OnRender(dc);
            double size = Math.Min(ActualWidth, ActualHeight);
            if (size <= 0) return;

            Point center = new Point(ActualWidth / 2, ActualHeight / 2);
            double radius = Math.Max(8, (size / 2) - 5.2);
            double amplitude = _glass ? 0.72 : 0.88;
            double opacity = _state == StageOrbitState.Waiting ? 0.48 : 0.82;

            Brush trackBrush = new SolidColorBrush(
                _glass
                    ? Color.FromArgb((byte)(opacity * 110), 170, 208, 226)
                    : Color.FromArgb((byte)(opacity * 116), 45, 88, 116));
            Pen track = new Pen(trackBrush, _glass ? 1.45 : 1.65)
            {
                StartLineCap = PenLineCap.Round,
                EndLineCap = PenLineCap.Round,
                LineJoin = PenLineJoin.Round
            };
            dc.DrawGeometry(
                null,
                track,
                BuildWave(center, radius, amplitude, 0, 1, _phase));

            double visibleProgress = _state == StageOrbitState.Complete
                ? 1
                : (_state == StageOrbitState.Active ? Math.Max(0.16, _progress) : 0);
            if (visibleProgress <= 0) return;

            LinearGradientBrush bright = CreateOrbitBrush(_glass);
            StreamGeometry progressPath = BuildWave(
                center,
                radius,
                amplitude,
                0,
                visibleProgress,
                _phase);

            Pen glow = new Pen(
                new SolidColorBrush(
                    _glass
                        ? Color.FromArgb(74, 126, 220, 255)
                        : Color.FromArgb(88, 80, 198, 255)),
                _glass ? 4.2 : 4.7)
            {
                StartLineCap = PenLineCap.Round,
                EndLineCap = PenLineCap.Round,
                LineJoin = PenLineJoin.Round
            };
            dc.DrawGeometry(null, glow, progressPath);

            Pen progressPen = new Pen(bright, _glass ? 2.15 : 2.35)
            {
                StartLineCap = PenLineCap.Round,
                EndLineCap = PenLineCap.Round,
                LineJoin = PenLineJoin.Round
            };
            dc.DrawGeometry(null, progressPen, progressPath);

            if (_state == StageOrbitState.Active && visibleProgress < 0.995)
            {
                Point head = GetWavePoint(
                    center,
                    radius,
                    amplitude,
                    visibleProgress,
                    _phase);
                dc.DrawEllipse(
                    _glass
                        ? new SolidColorBrush(Color.FromArgb(230, 255, 248, 255))
                        : new SolidColorBrush(Color.FromArgb(245, 255, 107, 220)),
                    null,
                    head,
                    _glass ? 1.8 : 2.0,
                    _glass ? 1.8 : 2.0);
            }
        }

        private static LinearGradientBrush CreateOrbitBrush(bool glass)
        {
            LinearGradientBrush brush = new LinearGradientBrush
            {
                StartPoint = new Point(0, 0),
                EndPoint = new Point(1, 1)
            };
            if (glass)
            {
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 255, 255), 0));
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(113, 221, 255), 0.32));
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(155, 135, 255), 0.68));
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 142, 222), 1));
            }
            else
            {
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(75, 239, 255), 0));
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(65, 142, 255), 0.34));
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(164, 79, 255), 0.68));
                brush.GradientStops.Add(new GradientStop(Color.FromRgb(255, 66, 190), 1));
            }
            return brush;
        }

        private static StreamGeometry BuildWave(
            Point center,
            double radius,
            double amplitude,
            double start,
            double end,
            double phase)
        {
            StreamGeometry geometry = new StreamGeometry();
            using (StreamGeometryContext context = geometry.Open())
            {
                int count = Math.Max(2, (int)Math.Ceiling(PointCount * Math.Max(0.02, end - start)));
                Point first = GetWavePoint(center, radius, amplitude, start, phase);
                context.BeginFigure(first, false, end - start >= 0.999);
                for (int i = 1; i <= count; i++)
                {
                    double t = start + ((end - start) * i / count);
                    context.LineTo(
                        GetWavePoint(center, radius, amplitude, t, phase),
                        true,
                        false);
                }
            }
            geometry.Freeze();
            return geometry;
        }

        private static Point GetWavePoint(
            Point center,
            double radius,
            double amplitude,
            double progress,
            double phase)
        {
            double angle = (-Math.PI / 2) + (progress * Math.PI * 2);
            double ripple =
                Math.Sin((angle * 11) + phase) * amplitude +
                Math.Sin((angle * 17) - (phase * 0.72)) * amplitude * 0.18;
            double r = radius + ripple;
            return new Point(
                center.X + (Math.Cos(angle) * r),
                center.Y + (Math.Sin(angle) * r));
        }
    }

    public sealed class LauncherSettingsWindow : Window
    {
        private readonly string _iconPath;
        private readonly string _gamepadPath;
        private readonly Action _openGeneral;
        private readonly Action _openTheme;
        private readonly Action _openGames;
        private readonly Action _openSocial;

        public LauncherSettingsWindow(
            string iconPath,
            string gamepadPath,
            Action openGeneral,
            Action openTheme,
            Action openGames,
            Action openSocial)
        {
            _iconPath = iconPath;
            _gamepadPath = gamepadPath;
            _openGeneral = openGeneral;
            _openTheme = openTheme;
            _openGames = openGames;
            _openSocial = openSocial;

            Title = "\u8BBE\u7F6E";
            Width = 390;
            Height = 416;
            WindowStartupLocation = WindowStartupLocation.Manual;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            ShowInTaskbar = false;
            Background = Brushes.Transparent;
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            if (File.Exists(iconPath)) Icon = LoadBitmap(iconPath);
            Content = BuildContent();
            UiWindowReveal.Attach(this, false);
            Loaded += delegate
            {
                UiWindowReveal.ApplyBackdrop(this, true);
                if (Owner != null)
                {
                    Left = Math.Max(
                        SystemParameters.WorkArea.Left + 12,
                        Owner.Left + 18);
                    Top = Math.Min(
                        SystemParameters.WorkArea.Bottom - Height - 12,
                        Owner.Top + Owner.ActualHeight - Height - 58);
                }
            };
        }

        private UIElement BuildContent()
        {
            Border frame = new Border
            {
                Background = new LinearGradientBrush(
                    Color.FromArgb(122, 235, 244, 250),
                    Color.FromArgb(118, 22, 29, 36),
                    125),
                BorderBrush = FrozenBrush("#A6E9F2F7"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(7),
                Effect = new DropShadowEffect
                {
                    BlurRadius = 24,
                    ShadowDepth = 8,
                    Opacity = 0.48,
                    Color = Colors.Black
                }
            };
            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(BuildTitleBar());

            StackPanel menu = new StackPanel
            {
                Margin = new Thickness(12, 10, 12, 12)
            };
            Button general = MenuRow(
                BuildGeneralIcon(),
                "\u5E38\u89C4",
                "\u65E5\u5FD7\u3001\u81EA\u52A8\u5173\u95ED\u4E0E\u8D44\u6E90\u7BA1\u7406");
            System.Windows.Automation.AutomationProperties.SetName(
                general, "\u5E38\u89C4");
            general.Click += delegate { _openGeneral(); };
            menu.Children.Add(general);

            Button theme = MenuRow(
                BuildThemeIcon(),
                "\u4E3B\u9898",
                "Apple \u6BDB\u73BB\u7483\u4E0E\u7ECF\u5178\u9ED1");
            System.Windows.Automation.AutomationProperties.SetName(
                theme, "\u4E3B\u9898");
            theme.Margin = new Thickness(0, 8, 0, 0);
            theme.Click += delegate { _openTheme(); };
            menu.Children.Add(theme);

            Button games = MenuRow(
                BuildGameIcon(),
                "\u5C0F\u6E38\u620F",
                "\u8D2A\u5403\u86C7\u4E0E\u626B\u96F7");
            System.Windows.Automation.AutomationProperties.SetName(
                games, "\u5C0F\u6E38\u620F");
            games.Margin = new Thickness(0, 8, 0, 0);
            games.Click += delegate { _openGames(); };
            menu.Children.Add(games);

            Button social = MenuRow(
                BuildSocialIcon(),
                "\u770B\u770B\u4ED6 \u2197",
                "Tibo\u3001OpenAI \u4E0E ChatGPT \u6700\u65B0\u52A8\u6001");
            System.Windows.Automation.AutomationProperties.SetName(
                social, "\u770B\u770B\u4ED6");
            social.Margin = new Thickness(0, 8, 0, 0);
            social.Click += delegate { _openSocial(); };
            menu.Children.Add(social);

            Grid.SetRow(menu, 1);
            root.Children.Add(menu);
            frame.Child = root;
            return frame;
        }

        private UIElement BuildTitleBar()
        {
            Border bar = new Border
            {
                Background = FrozenBrush("#70141A20"),
                BorderBrush = FrozenBrush("#80DCE8EE"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                CornerRadius = new CornerRadius(7, 7, 0, 0)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            StackPanel brand = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(14, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (File.Exists(_iconPath))
            {
                Image icon = new Image
                {
                    Source = LoadBitmap(_iconPath),
                    Width = 27,
                    Height = 27,
                    Stretch = Stretch.Uniform,
                    Margin = new Thickness(0, 0, 10, 0)
                };
                RenderOptions.SetBitmapScalingMode(icon, BitmapScalingMode.HighQuality);
                brand.Children.Add(icon);
            }
            brand.Children.Add(new TextBlock
            {
                Text = "\u8BBE\u7F6E",
                Foreground = FrozenBrush("#FFF6F7F8"),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });
            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(brand);

            Button close = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = "\u00D7",
                Width = 44,
                Height = 47,
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                Foreground = FrozenBrush("#D7DEE2"),
                FontSize = 17,
                Cursor = Cursors.Hand
            };
            close.MouseEnter += delegate { close.Background = FrozenBrush("#26313940"); };
            close.MouseLeave += delegate { close.Background = Brushes.Transparent; };
            close.Click += delegate { Close(); };
            Grid.SetColumn(close, 1);
            grid.Children.Add(close);
            bar.Child = grid;
            return bar;
        }

        private Button MenuRow(FrameworkElement icon, string title, string subtitle)
        {
            Button button = new Button
            {
                Template = UiButtonChrome.Create(),
                Height = 76,
                Padding = new Thickness(14, 10, 14, 10),
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                VerticalContentAlignment = VerticalAlignment.Center,
                Background = FrozenBrush("#481E272F"),
                BorderBrush = FrozenBrush("#75C7D6DE"),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };
            Grid row = new Grid();
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(44) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(24) });
            icon.HorizontalAlignment = HorizontalAlignment.Left;
            icon.VerticalAlignment = VerticalAlignment.Center;
            row.Children.Add(icon);
            StackPanel copy = new StackPanel
            {
                VerticalAlignment = VerticalAlignment.Center
            };
            copy.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = FrozenBrush("#FFF5F7F8"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold
            });
            copy.Children.Add(new TextBlock
            {
                Text = subtitle,
                Foreground = FrozenBrush("#FF9DA7AE"),
                FontSize = 10,
                Margin = new Thickness(0, 5, 0, 0)
            });
            Grid.SetColumn(copy, 1);
            row.Children.Add(copy);
            TextBlock arrow = new TextBlock
            {
                Text = "\u203A",
                Foreground = FrozenBrush("#FF9DA8AE"),
                FontSize = 24,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            Grid.SetColumn(arrow, 2);
            row.Children.Add(arrow);
            button.Content = row;
            button.MouseEnter += delegate
            {
                button.Background = FrozenBrush("#72394650");
                button.BorderBrush = FrozenBrush("#A3E5EFF4");
            };
            button.MouseLeave += delegate
            {
                button.Background = FrozenBrush("#481E272F");
                button.BorderBrush = FrozenBrush("#75C7D6DE");
            };
            return button;
        }

        private FrameworkElement BuildGeneralIcon()
        {
            Grid icon = new Grid { Width = 32, Height = 32 };
            icon.Children.Add(new TextBlock
            {
                Text = "\uE713",
                FontFamily = new FontFamily("Segoe Fluent Icons"),
                FontSize = 24,
                Foreground = FrozenBrush("#FFF7FAFC"),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Effect = new DropShadowEffect
                {
                    Color = Colors.Black,
                    BlurRadius = 6,
                    ShadowDepth = 1,
                    Opacity = 0.35
                }
            });
            return icon;
        }

        private FrameworkElement BuildSocialIcon()
        {
            Grid icon = new Grid { Width = 32, Height = 32 };
            icon.Children.Add(new TextBlock
            {
                Text = "\uD835\uDD4F",
                FontFamily = new FontFamily("Segoe UI Symbol, Segoe UI"),
                FontSize = 22,
                FontWeight = FontWeights.SemiBold,
                Foreground = FrozenBrush("#FFF7FAFC"),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            });
            return icon;
        }

        private FrameworkElement BuildThemeIcon()
        {
            Grid icon = new Grid { Width = 32, Height = 32 };
            icon.Children.Add(new Border
            {
                Background = new LinearGradientBrush(
                    Color.FromRgb(90, 184, 255),
                    Color.FromRgb(211, 105, 255),
                    45),
                CornerRadius = new CornerRadius(9),
                BorderBrush = FrozenBrush("#A8E8F5FF"),
                BorderThickness = new Thickness(1)
            });
            Grid tiles = new Grid { Margin = new Thickness(7) };
            tiles.RowDefinitions.Add(new RowDefinition());
            tiles.RowDefinitions.Add(new RowDefinition());
            tiles.ColumnDefinitions.Add(new ColumnDefinition());
            tiles.ColumnDefinitions.Add(new ColumnDefinition());
            string[] colors = { "#FFF9FBFF", "#FF8DE8FF", "#FFFF8BD5", "#FFFFD66E" };
            for (int i = 0; i < colors.Length; i++)
            {
                Border tile = new Border
                {
                    Background = FrozenBrush(colors[i]),
                    CornerRadius = new CornerRadius(2),
                    Margin = new Thickness(1)
                };
                Grid.SetRow(tile, i / 2);
                Grid.SetColumn(tile, i % 2);
                tiles.Children.Add(tile);
            }
            icon.Children.Add(tiles);
            return icon;
        }

        private FrameworkElement BuildGameIcon()
        {
            Viewbox view = new Viewbox
            {
                Width = 36,
                Height = 36,
                Stretch = Stretch.Uniform
            };
            Canvas canvas = new Canvas
            {
                Width = 40,
                Height = 40
            };
            System.Windows.Shapes.Path body =
                new System.Windows.Shapes.Path
                {
                    Data = Geometry.Parse(
                        "M 10,10 C 5,10 2,15 2,22 " +
                        "C 2,30 7,34 12,28 L 15,24 " +
                        "L 25,24 L 28,28 C 33,34 38,30 38,22 " +
                        "C 38,15 35,10 30,10 Z"),
                    Fill = FrozenBrush("#FFF8FAFC"),
                    Stroke = FrozenBrush("#FFD7DEE3"),
                    StrokeThickness = 1,
                    Effect = new DropShadowEffect
                    {
                        Color = Colors.Black,
                        BlurRadius = 7,
                        ShadowDepth = 2,
                        Opacity = 0.32
                    }
                };
            canvas.Children.Add(body);
            System.Windows.Shapes.Path dpad =
                new System.Windows.Shapes.Path
                {
                    Data = Geometry.Parse(
                        "M 10,15 L 13,15 L 13,18 L 16,18 " +
                        "L 16,21 L 13,21 L 13,24 L 10,24 " +
                        "L 10,21 L 7,21 L 7,18 L 10,18 Z"),
                    Fill = FrozenBrush("#FF6F7780")
                };
            canvas.Children.Add(dpad);
            Ellipse first = new Ellipse
            {
                Width = 4.5,
                Height = 4.5,
                Fill = FrozenBrush("#FF69727B")
            };
            Canvas.SetLeft(first, 27);
            Canvas.SetTop(first, 15);
            canvas.Children.Add(first);
            Ellipse second = new Ellipse
            {
                Width = 4.5,
                Height = 4.5,
                Fill = FrozenBrush("#FF69727B")
            };
            Canvas.SetLeft(second, 31);
            Canvas.SetTop(second, 20);
            canvas.Children.Add(second);
            Border center = new Border
            {
                Width = 7,
                Height = 2,
                CornerRadius = new CornerRadius(1),
                Background = FrozenBrush("#FFB4BBC1")
            };
            Canvas.SetLeft(center, 17);
            Canvas.SetTop(center, 17);
            canvas.Children.Add(center);
            view.Child = canvas;
            return view;
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

        private static Brush FrozenBrush(string color)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(color);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }
    }

    public sealed class LauncherGeneralSettings
    {
        public bool AutoCloseAfterSuccess = true;
        public bool KeepOpenWhileGaming = true;
        public int BackupRetentionLimit = 3;
        public int LogSessionLimit = 20;
        public long MaxLogBytes = 10L * 1024L * 1024L;
        public int UiLogLineLimit = 260;

        public LauncherGeneralSettings Clone()
        {
            return new LauncherGeneralSettings
            {
                AutoCloseAfterSuccess = AutoCloseAfterSuccess,
                KeepOpenWhileGaming = KeepOpenWhileGaming,
                BackupRetentionLimit = BackupRetentionLimit,
                LogSessionLimit = LogSessionLimit,
                MaxLogBytes = MaxLogBytes,
                UiLogLineLimit = UiLogLineLimit
            };
        }

        public static LauncherGeneralSettings Load(string root)
        {
            LauncherGeneralSettings settings = new LauncherGeneralSettings();
            string path = SettingsPath(root);
            if (!File.Exists(path)) return settings;
            try
            {
                string[] lines = File.ReadAllLines(path, Encoding.UTF8);
                for (int i = 0; i < lines.Length; i++)
                {
                    int split = lines[i].IndexOf('=');
                    if (split <= 0) continue;
                    string key = lines[i].Substring(0, split).Trim();
                    string value = lines[i].Substring(split + 1).Trim();
                    bool flag;
                    int number;
                    long longNumber;
                    if (string.Equals(key, "autoCloseAfterSuccess",
                        StringComparison.OrdinalIgnoreCase) &&
                        bool.TryParse(value, out flag))
                        settings.AutoCloseAfterSuccess = flag;
                    else if (string.Equals(key, "keepOpenWhileGaming",
                        StringComparison.OrdinalIgnoreCase) &&
                        bool.TryParse(value, out flag))
                        settings.KeepOpenWhileGaming = flag;
                    else if (string.Equals(key, "backupRetentionLimit",
                        StringComparison.OrdinalIgnoreCase) &&
                        int.TryParse(value, out number))
                        settings.BackupRetentionLimit = Math.Max(1, Math.Min(3, number));
                    else if (string.Equals(key, "logSessionLimit",
                        StringComparison.OrdinalIgnoreCase) &&
                        int.TryParse(value, out number))
                        settings.LogSessionLimit = Math.Max(5, Math.Min(50, number));
                    else if (string.Equals(key, "maxLogBytes",
                        StringComparison.OrdinalIgnoreCase) &&
                        long.TryParse(value, out longNumber))
                        settings.MaxLogBytes = Math.Max(
                            2L * 1024L * 1024L,
                            Math.Min(50L * 1024L * 1024L, longNumber));
                    else if (string.Equals(key, "uiLogLineLimit",
                        StringComparison.OrdinalIgnoreCase) &&
                        int.TryParse(value, out number))
                        settings.UiLogLineLimit = Math.Max(120, Math.Min(600, number));
                }
            }
            catch
            {
            }
            return settings;
        }

        public void Save(string root)
        {
            string path = SettingsPath(root);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
            string[] lines =
            {
                "autoCloseAfterSuccess=" + AutoCloseAfterSuccess,
                "keepOpenWhileGaming=" + KeepOpenWhileGaming,
                "backupRetentionLimit=" + BackupRetentionLimit,
                "logSessionLimit=" + LogSessionLimit,
                "maxLogBytes=" + MaxLogBytes,
                "uiLogLineLimit=" + UiLogLineLimit
            };
            File.WriteAllLines(path, lines, new UTF8Encoding(false));
        }

        private static string SettingsPath(string root)
        {
            return System.IO.Path.Combine(
                root, "LauncherUI", "State", "general-settings.ini");
        }
    }

    public sealed class GeneralSettingsWindow : Window
    {
        private readonly string _iconPath;
        private readonly LauncherGeneralSettings _settings;
        private readonly Action<LauncherGeneralSettings> _apply;
        private CheckBox _autoClose;
        private CheckBox _keepForGames;
        private ComboBox _sessions;
        private ComboBox _memoryLines;

        public GeneralSettingsWindow(
            string iconPath,
            LauncherGeneralSettings settings,
            Action<LauncherGeneralSettings> apply)
        {
            _iconPath = iconPath;
            _settings = settings;
            _apply = apply;
            Title = "\u5E38\u89C4\u8BBE\u7F6E";
            Width = 650;
            Height = 510;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
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
                Background = new LinearGradientBrush(
                    Color.FromArgb(132, 26, 34, 42),
                    Color.FromArgb(118, 8, 12, 17),
                    125),
                BorderBrush = FrozenBrush("#A3DCE8EE"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(16),
                Effect = new DropShadowEffect
                {
                    BlurRadius = 28,
                    ShadowDepth = 8,
                    Opacity = 0.48,
                    Color = Colors.Black
                }
            };
            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(52) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(64) });
            root.Children.Add(BuildTitleBar());

            StackPanel content = new StackPanel
            {
                Margin = new Thickness(28, 22, 28, 12)
            };
            content.Children.Add(SectionTitle(
                "\u5B8C\u6210\u540E\u884C\u4E3A",
                "\u63A7\u5236\u4FEE\u590D\u4E0E\u542F\u52A8\u7ED3\u675F\u540E\u7684\u7A97\u53E3\u751F\u547D\u5468\u671F"));
            _autoClose = SettingCheck(
                "\u5B8C\u6210\u540E\u81EA\u52A8\u5173\u95ED\u542F\u52A8\u5668",
                "\u6CA1\u6709\u4EA4\u4E92\u4EFB\u52A1\u65F6\u91CA\u653E\u754C\u9762\u4E0E\u663E\u793A\u8D44\u6E90",
                _settings.AutoCloseAfterSuccess);
            content.Children.Add(_autoClose);
            _keepForGames = SettingCheck(
                "\u5C0F\u6E38\u620F\u8FD0\u884C\u65F6\u4FDD\u6301\u542F\u52A8\u5668",
                "\u8D2A\u5403\u86C7\u6216\u6253\u7816\u5757\u5173\u95ED\u540E\u518D\u81EA\u52A8\u9000\u51FA",
                _settings.KeepOpenWhileGaming);
            content.Children.Add(_keepForGames);

            content.Children.Add(SectionTitle(
                "\u8D44\u6E90\u4E0E\u65E5\u5FD7",
                "\u9650\u5236\u78C1\u76D8\u5386\u53F2\u4E0E\u5B9E\u65F6\u754C\u9762\u5185\u5B58\u5360\u7528"));
            _sessions = SettingChoice(
                content,
                "\u4FDD\u7559\u65E5\u5FD7\u4F1A\u8BDD",
                "\u6BCF\u6B21\u8FD0\u884C\u7684 log \u4E0E diagnosis \u6309\u540C\u4E00\u4F1A\u8BDD\u7BA1\u7406",
                new[] { "10", "20", "30" },
                _settings.LogSessionLimit.ToString());
            _memoryLines = SettingChoice(
                content,
                "\u5B9E\u65F6\u65E5\u5FD7\u884C\u6570",
                "\u8D85\u51FA\u540E\u5206\u6279\u79FB\u9664\u6700\u65E9\u5185\u5BB9\uFF0C\u907F\u514D\u957F\u65F6\u95F4\u7D2F\u79EF",
                new[] { "180", "260", "400" },
                _settings.UiLogLineLimit.ToString());
            Grid.SetRow(content, 1);
            root.Children.Add(content);

            Grid footer = new Grid
            {
                Margin = new Thickness(28, 8, 28, 16)
            };
            footer.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            footer.ColumnDefinitions.Add(
                new ColumnDefinition { Width = GridLength.Auto });
            footer.Children.Add(new TextBlock
            {
                Text = "\u65E5\u5FD7\u603B\u91CF\u4E0A\u9650\uFF1A10 MB",
                Foreground = FrozenBrush("#A9B7C0"),
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Center
            });
            Button save = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = "\u5E94\u7528",
                Width = 104,
                Height = 34,
                Background = FrozenBrush("#DCEAF3F8"),
                BorderBrush = FrozenBrush("#F2FFFFFF"),
                BorderThickness = new Thickness(1),
                Foreground = FrozenBrush("#142028"),
                FontWeight = FontWeights.SemiBold,
                Cursor = Cursors.Hand
            };
            save.Click += delegate { SaveAndClose(); };
            Grid.SetColumn(save, 1);
            footer.Children.Add(save);
            Grid.SetRow(footer, 2);
            root.Children.Add(footer);
            frame.Child = root;
            return frame;
        }

        private UIElement BuildTitleBar()
        {
            Border bar = new Border
            {
                Background = FrozenBrush("#74202931"),
                BorderBrush = FrozenBrush("#80DCE8EE"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                CornerRadius = new CornerRadius(16, 16, 0, 0)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(
                new ColumnDefinition { Width = GridLength.Auto });
            StackPanel brand = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(18, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (File.Exists(_iconPath))
            {
                Image icon = new Image
                {
                    Source = LoadBitmap(_iconPath),
                    Width = 28,
                    Height = 28,
                    Margin = new Thickness(0, 0, 10, 0),
                    Stretch = Stretch.Uniform
                };
                RenderOptions.SetBitmapScalingMode(icon, BitmapScalingMode.HighQuality);
                brand.Children.Add(icon);
            }
            brand.Children.Add(new TextBlock
            {
                Text = "\u5E38\u89C4\u8BBE\u7F6E",
                Foreground = FrozenBrush("#F7FAFC"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });
            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(brand);
            Button close = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = "\u00D7",
                Width = 48,
                Height = 50,
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                Foreground = FrozenBrush("#E7EEF2"),
                FontSize = 18,
                Cursor = Cursors.Hand
            };
            close.Click += delegate { Close(); };
            Grid.SetColumn(close, 1);
            grid.Children.Add(close);
            bar.Child = grid;
            return bar;
        }

        private static FrameworkElement SectionTitle(string title, string subtitle)
        {
            StackPanel panel = new StackPanel
            {
                Margin = new Thickness(0, 0, 0, 10)
            };
            panel.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = FrozenBrush("#F4F8FA"),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold
            });
            panel.Children.Add(new TextBlock
            {
                Text = subtitle,
                Foreground = FrozenBrush("#95A5AE"),
                FontSize = 10,
                Margin = new Thickness(0, 4, 0, 0)
            });
            return panel;
        }

        private static CheckBox SettingCheck(
            string title,
            string subtitle,
            bool value)
        {
            CheckBox check = new CheckBox
            {
                IsChecked = value,
                Foreground = FrozenBrush("#F0F5F7"),
                Margin = new Thickness(0, 0, 0, 12),
                VerticalContentAlignment = VerticalAlignment.Center
            };
            StackPanel copy = new StackPanel { Margin = new Thickness(8, 0, 0, 0) };
            copy.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = FrozenBrush("#F0F5F7"),
                FontSize = 12,
                FontWeight = FontWeights.Medium
            });
            copy.Children.Add(new TextBlock
            {
                Text = subtitle,
                Foreground = FrozenBrush("#91A1AA"),
                FontSize = 10,
                Margin = new Thickness(0, 3, 0, 0)
            });
            check.Content = copy;
            return check;
        }

        private static ComboBox SettingChoice(
            Panel parent,
            string title,
            string subtitle,
            string[] values,
            string selected)
        {
            Grid row = new Grid { Margin = new Thickness(0, 0, 0, 12) };
            row.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(
                new ColumnDefinition { Width = new GridLength(110) });
            StackPanel copy = new StackPanel();
            copy.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = FrozenBrush("#F0F5F7"),
                FontSize = 12,
                FontWeight = FontWeights.Medium
            });
            copy.Children.Add(new TextBlock
            {
                Text = subtitle,
                Foreground = FrozenBrush("#91A1AA"),
                FontSize = 10,
                Margin = new Thickness(0, 3, 0, 0)
            });
            row.Children.Add(copy);
            ComboBox combo = new ComboBox
            {
                Height = 30,
                Margin = new Thickness(12, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Background = FrozenBrush("#E8F0F4"),
                Foreground = FrozenBrush("#18242B")
            };
            for (int i = 0; i < values.Length; i++)
                combo.Items.Add(values[i]);
            combo.SelectedItem = selected;
            if (combo.SelectedIndex < 0) combo.SelectedIndex = 0;
            Grid.SetColumn(combo, 1);
            row.Children.Add(combo);
            parent.Children.Add(row);
            return combo;
        }

        private void SaveAndClose()
        {
            int sessions;
            int lines;
            if (!int.TryParse(Convert.ToString(_sessions.SelectedItem), out sessions))
                sessions = 20;
            if (!int.TryParse(Convert.ToString(_memoryLines.SelectedItem), out lines))
                lines = 260;
            _settings.AutoCloseAfterSuccess = _autoClose.IsChecked == true;
            _settings.KeepOpenWhileGaming = _keepForGames.IsChecked == true;
            _settings.LogSessionLimit = sessions;
            _settings.UiLogLineLimit = lines;
            _settings.MaxLogBytes = 10L * 1024L * 1024L;
            _apply(_settings.Clone());
            Close();
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

        private static Brush FrozenBrush(string color)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(color);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }
    }

    public sealed class LauncherThemeSettings
    {
        public string Theme = "glass";
        public double PanelOpacity = 0.74;
        public double TintStrength = 0.66;
        public bool ReduceMotion;

        public LauncherThemeSettings Clone()
        {
            return new LauncherThemeSettings
            {
                Theme = Theme,
                PanelOpacity = PanelOpacity,
                TintStrength = TintStrength,
                ReduceMotion = ReduceMotion
            };
        }

        public static LauncherThemeSettings Load(string root)
        {
            LauncherThemeSettings settings = new LauncherThemeSettings();
            string path = SettingsPath(root);
            if (!File.Exists(path)) return settings;
            try
            {
                string[] lines = File.ReadAllLines(path, Encoding.UTF8);
                for (int i = 0; i < lines.Length; i++)
                {
                    int split = lines[i].IndexOf('=');
                    if (split <= 0) continue;
                    string key = lines[i].Substring(0, split).Trim();
                    string value = lines[i].Substring(split + 1).Trim();
                    double number;
                    bool flag;
                    if (string.Equals(key, "theme", StringComparison.OrdinalIgnoreCase))
                        settings.Theme = value;
                    else if (string.Equals(key, "panelOpacity", StringComparison.OrdinalIgnoreCase) &&
                        double.TryParse(value, System.Globalization.NumberStyles.Float,
                            System.Globalization.CultureInfo.InvariantCulture, out number))
                        settings.PanelOpacity = Math.Max(0.42, Math.Min(0.92, number));
                    else if (string.Equals(key, "tintStrength", StringComparison.OrdinalIgnoreCase) &&
                        double.TryParse(value, System.Globalization.NumberStyles.Float,
                            System.Globalization.CultureInfo.InvariantCulture, out number))
                        settings.TintStrength = Math.Max(0.2, Math.Min(1, number));
                    else if (string.Equals(key, "reduceMotion", StringComparison.OrdinalIgnoreCase) &&
                        bool.TryParse(value, out flag))
                        settings.ReduceMotion = flag;
                }
            }
            catch
            {
            }
            return settings;
        }

        public void Save(string root)
        {
            string path = SettingsPath(root);
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
            string[] lines =
            {
                "theme=" + Theme,
                "panelOpacity=" + PanelOpacity.ToString(
                    "0.00", System.Globalization.CultureInfo.InvariantCulture),
                "tintStrength=" + TintStrength.ToString(
                    "0.00", System.Globalization.CultureInfo.InvariantCulture),
                "reduceMotion=" + ReduceMotion.ToString()
            };
            File.WriteAllLines(path, lines, new UTF8Encoding(false));
        }

        private static string SettingsPath(string root)
        {
            return System.IO.Path.Combine(
                root, "LauncherUI", "State", "theme-settings.ini");
        }
    }

    public sealed class ThemeSettingsWindow : Window
    {
        private readonly Action<LauncherThemeSettings> _apply;
        private readonly LauncherThemeSettings _settings;
        private readonly string _iconPath;
        private Button _glassChoice;
        private Button _classicChoice;
        private TextBlock _opacityValue;
        private TextBlock _tintValue;

        public ThemeSettingsWindow(
            string iconPath,
            LauncherThemeSettings settings,
            Action<LauncherThemeSettings> apply)
        {
            _iconPath = iconPath;
            _settings = settings;
            _apply = apply;
            Title = "\u4E3B\u9898\u4E0E\u5916\u89C2";
            Width = 720;
            Height = 610;
            MinWidth = 680;
            MinHeight = 570;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            Background = new LinearGradientBrush(
                Color.FromArgb(92, 173, 207, 227),
                Color.FromArgb(96, 12, 17, 23),
                125);
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            if (File.Exists(iconPath)) Icon = LoadBitmap(iconPath);
            Content = BuildContent();
            UiWindowReveal.Attach(this);
            Loaded += delegate
            {
                UiWindowReveal.ApplyBackdrop(
                    this,
                    string.Equals(_settings.Theme, "glass", StringComparison.OrdinalIgnoreCase));
            };
        }

        private UIElement BuildContent()
        {
            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(BuildTitleBar());

            StackPanel content = new StackPanel
            {
                Margin = new Thickness(28, 24, 28, 26)
            };
            content.Children.Add(new TextBlock
            {
                Text = "\u9009\u62E9\u4E3B\u9898",
                Foreground = FrozenBrush("#F5FAFC"),
                FontSize = 22,
                FontWeight = FontWeights.SemiBold
            });
            content.Children.Add(new TextBlock
            {
                Text = "\u5207\u6362\u4F1A\u7ACB\u5373\u9884\u89C8\uFF0C\u5E76\u5728\u4E0B\u6B21\u542F\u52A8\u65F6\u81EA\u52A8\u4FDD\u7559\u3002",
                Foreground = FrozenBrush("#9EB0BA"),
                FontSize = 11,
                Margin = new Thickness(0, 6, 0, 18)
            });

            Grid choices = new Grid();
            choices.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            choices.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(14) });
            choices.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            _glassChoice = ThemeChoice(
                "Apple \u6BDB\u73BB\u7483",
                "APPLE GLASS",
                "\u77F3\u58A8\u6697\u73BB\u7483\u3001\u67D4\u548C\u767D\u8272\u53CD\u5149\u4E0E\u514B\u5236\u51B7\u8272\u5C42\u6B21",
                true);
            _classicChoice = ThemeChoice(
                "\u7ECF\u5178\u9ED1",
                "CLASSIC",
                "\u4FDD\u7559\u5F53\u524D\u7A33\u5B9A\u7684\u7EAF\u9ED1\u9AD8\u5BF9\u6BD4\u754C\u9762",
                false);
            Grid.SetColumn(_classicChoice, 2);
            choices.Children.Add(_glassChoice);
            choices.Children.Add(_classicChoice);
            content.Children.Add(choices);
            RefreshChoices();

            Border details = new Border
            {
                Background = FrozenBrush("#B5162028"),
                BorderBrush = FrozenBrush("#53667780"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(6),
                Padding = new Thickness(20, 18, 20, 18),
                Margin = new Thickness(0, 20, 0, 0)
            };
            StackPanel settingsPanel = new StackPanel();
            settingsPanel.Children.Add(new TextBlock
            {
                Text = "\u8BE6\u7EC6\u8BBE\u7F6E",
                Foreground = FrozenBrush("#F2F7F9"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 14)
            });

            _opacityValue = ValueLabel();
            Slider opacity = SettingSlider(
                "\u9762\u677F\u6D53\u5EA6",
                "\u8C03\u6574\u5185\u5BB9\u9762\u677F\u7684\u900F\u660E\u5EA6",
                _settings.PanelOpacity,
                _opacityValue,
                settingsPanel);
            opacity.ValueChanged += delegate
            {
                _settings.PanelOpacity = opacity.Value;
                _opacityValue.Text = Math.Round(opacity.Value * 100) + "%";
                Apply();
            };
            _tintValue = ValueLabel();
            Slider tint = SettingSlider(
                "\u8272\u8C03\u5F3A\u5EA6",
                "\u63A7\u5236 Apple \u73BB\u7483\u4E2D\u7684\u51B7\u8272\u53CD\u5149",
                _settings.TintStrength,
                _tintValue,
                settingsPanel);
            tint.ValueChanged += delegate
            {
                _settings.TintStrength = tint.Value;
                _tintValue.Text = Math.Round(tint.Value * 100) + "%";
                Apply();
            };
            CheckBox motion = new CheckBox
            {
                Content = "\u51CF\u5C11\u52A8\u6001\u6548\u679C",
                IsChecked = _settings.ReduceMotion,
                Foreground = FrozenBrush("#DCE7EC"),
                FontSize = 12,
                Margin = new Thickness(0, 16, 0, 0),
                Cursor = Cursors.Hand
            };
            motion.Checked += delegate { _settings.ReduceMotion = true; Apply(); };
            motion.Unchecked += delegate { _settings.ReduceMotion = false; Apply(); };
            settingsPanel.Children.Add(motion);
            details.Child = settingsPanel;
            content.Children.Add(details);

            Grid.SetRow(content, 1);
            root.Children.Add(content);
            return root;
        }

        private UIElement BuildTitleBar()
        {
            Border bar = new Border
            {
                Background = FrozenBrush("#E6080F16"),
                BorderBrush = FrozenBrush("#42515D65"),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            StackPanel brand = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(14, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (File.Exists(_iconPath))
            {
                Image icon = new Image
                {
                    Source = LoadBitmap(_iconPath),
                    Width = 28,
                    Height = 28,
                    Stretch = Stretch.Uniform,
                    Margin = new Thickness(0, 0, 10, 0)
                };
                RenderOptions.SetBitmapScalingMode(icon, BitmapScalingMode.HighQuality);
                brand.Children.Add(icon);
            }
            brand.Children.Add(new TextBlock
            {
                Text = "\u4E3B\u9898\u4E0E\u5916\u89C2",
                Foreground = FrozenBrush("#F5FAFC"),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });
            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(brand);
            Button close = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = "\u00D7",
                Width = 48,
                Height = 47,
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                Foreground = FrozenBrush("#DCE6EA"),
                FontSize = 18,
                Cursor = Cursors.Hand
            };
            close.MouseEnter += delegate { close.Background = FrozenBrush("#24303A42"); };
            close.MouseLeave += delegate { close.Background = Brushes.Transparent; };
            close.Click += delegate { Close(); };
            Grid.SetColumn(close, 1);
            grid.Children.Add(close);
            bar.Child = grid;
            return bar;
        }

        private Button ThemeChoice(string title, string code, string description, bool glass)
        {
            Button button = new Button
            {
                Template = UiButtonChrome.Create(),
                Height = 132,
                Padding = new Thickness(18),
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                VerticalContentAlignment = VerticalAlignment.Stretch,
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };
            Grid body = new Grid();
            body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            body.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            TextBlock badge = new TextBlock
            {
                Text = code,
                Foreground = glass ? FrozenBrush("#62E7FF") : FrozenBrush("#B8C3C9"),
                FontSize = 10,
                FontWeight = FontWeights.Bold
            };
            body.Children.Add(badge);
            TextBlock heading = new TextBlock
            {
                Text = title,
                Foreground = FrozenBrush("#F7FBFC"),
                FontSize = 18,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 9, 0, 0)
            };
            Grid.SetRow(heading, 1);
            body.Children.Add(heading);
            TextBlock copy = new TextBlock
            {
                Text = description,
                Foreground = FrozenBrush("#9EB0BA"),
                FontSize = 11,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 9, 0, 0)
            };
            Grid.SetRow(copy, 2);
            body.Children.Add(copy);
            button.Content = body;
            button.Click += delegate
            {
                _settings.Theme = glass ? "glass" : "classic";
                RefreshChoices();
                Apply();
                UiWindowReveal.ApplyBackdrop(this, glass);
            };
            return button;
        }

        private Slider SettingSlider(
            string title,
            string description,
            double value,
            TextBlock valueLabel,
            StackPanel owner)
        {
            Grid row = new Grid { Margin = new Thickness(0, 7, 0, 8) };
            row.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            row.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            row.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = FrozenBrush("#EAF2F5"),
                FontSize = 12,
                FontWeight = FontWeights.Medium
            });
            valueLabel.Text = Math.Round(value * 100) + "%";
            Grid.SetColumn(valueLabel, 1);
            row.Children.Add(valueLabel);
            TextBlock hint = new TextBlock
            {
                Text = description,
                Foreground = FrozenBrush("#80939E"),
                FontSize = 10,
                Margin = new Thickness(0, 4, 0, 8)
            };
            Grid.SetRow(hint, 1);
            Grid.SetColumnSpan(hint, 2);
            row.Children.Add(hint);
            Slider slider = new Slider
            {
                Minimum = 0.2,
                Maximum = 1,
                Value = value,
                Height = 24,
                Cursor = Cursors.Hand
            };
            Grid.SetRow(slider, 2);
            Grid.SetColumnSpan(slider, 2);
            row.Children.Add(slider);
            owner.Children.Add(row);
            return slider;
        }

        private static TextBlock ValueLabel()
        {
            return new TextBlock
            {
                Foreground = FrozenBrush("#65E7FA"),
                FontSize = 11,
                FontWeight = FontWeights.SemiBold
            };
        }

        private void RefreshChoices()
        {
            bool glass = string.Equals(_settings.Theme, "glass", StringComparison.OrdinalIgnoreCase);
            _glassChoice.Background = glass
                ? FrozenBrush("#B5223541")
                : FrozenBrush("#9A111A21");
            _glassChoice.BorderBrush = glass
                ? FrozenBrush("#6C69E6F7")
                : FrozenBrush("#4A42515A");
            _classicChoice.Background = glass
                ? FrozenBrush("#9A111A21")
                : FrozenBrush("#E013181C");
            _classicChoice.BorderBrush = glass
                ? FrozenBrush("#4A42515A")
                : FrozenBrush("#8A9AABB4");
        }

        private void Apply()
        {
            _apply(_settings.Clone());
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

        private static Brush FrozenBrush(string color)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(color);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }
    }

    public sealed class GameSelectionWindow : Window
    {
        private readonly Action _openMinesweeper;
        private readonly Action _openSnake;

        public GameSelectionWindow(string iconPath, Action openMinesweeper, Action openSnake)
        {
            _openMinesweeper = openMinesweeper;
            _openSnake = openSnake;

            Title = "Mini Games";
            Width = 650;
            Height = 390;
            MinWidth = 620;
            MinHeight = 360;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            Background = Brushes.Black;
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            if (File.Exists(iconPath))
                Icon = LoadBitmap(iconPath);

            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(BuildTitleBar(iconPath));

            Grid content = new Grid { Margin = new Thickness(28, 24, 28, 30) };
            content.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            content.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(18) });
            content.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            TextBlock heading = new TextBlock
            {
                Text = "\u9009\u62E9\u4E00\u4E2A\u5C0F\u6E38\u620F",
                Foreground = FrozenBrush("#F7FBFF"),
                FontSize = 22,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(2, 0, 0, 20)
            };
            Grid.SetColumnSpan(heading, 3);
            content.Children.Add(heading);

            Button snake = GameChoice(
                "\u8D2A\u5403\u86C7",
                "SNAKE",
                "\u65B9\u5411\u952E / WASD  \u00B7  \u8FFD\u9010\u9AD8\u5206",
                "#35E9FF",
                "#3D8CFF");
            snake.Click += delegate
            {
                Close();
                _openSnake();
            };
            Grid.SetRow(snake, 1);
            content.Children.Add(snake);

            Button minesweeper = GameChoice(
                "\u626B\u96F7",
                "MINESWEEPER",
                "\u5DE6\u952E\u7FFB\u5F00  \u00B7  \u53F3\u952E\u63D2\u65D7",
                "#FF3EB5",
                "#BE5CFF");
            minesweeper.Click += delegate
            {
                Close();
                _openMinesweeper();
            };
            Grid.SetRow(minesweeper, 1);
            Grid.SetColumn(minesweeper, 2);
            content.Children.Add(minesweeper);

            Grid.SetRow(content, 1);
            root.Children.Add(content);
            Content = root;
            UiWindowReveal.Attach(this);
        }

        private UIElement BuildTitleBar(string iconPath)
        {
            Border bar = new Border
            {
                Background = Brushes.Black,
                BorderBrush = FrozenBrush("#263640"),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            StackPanel brand = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(14, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (File.Exists(iconPath))
            {
                Image icon = new Image
                {
                    Source = LoadBitmap(iconPath),
                    Width = 28,
                    Height = 28,
                    Stretch = Stretch.Uniform,
                    Margin = new Thickness(0, 0, 10, 0)
                };
                RenderOptions.SetBitmapScalingMode(icon, BitmapScalingMode.HighQuality);
                brand.Children.Add(icon);
            }
            brand.Children.Add(new TextBlock
            {
                Text = "CHATGPT MINI GAMES",
                Foreground = FrozenBrush("#F4F8FA"),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });
            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(brand);

            Button close = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = "\u00D7",
                Width = 48,
                Height = 47,
                BorderThickness = new Thickness(0),
                Background = Brushes.Transparent,
                Foreground = FrozenBrush("#EAF0F3"),
                FontSize = 18,
                Cursor = Cursors.Hand
            };
            close.Click += delegate { Close(); };
            close.MouseEnter += delegate { close.Background = FrozenBrush("#3A171B"); };
            close.MouseLeave += delegate { close.Background = Brushes.Transparent; };
            Grid.SetColumn(close, 1);
            grid.Children.Add(close);
            bar.Child = grid;
            return bar;
        }

        private static Button GameChoice(
            string title,
            string code,
            string description,
            string colorA,
            string colorB)
        {
            Button button = new Button
            {
                Template = UiButtonChrome.Create(),
                BorderThickness = new Thickness(1),
                BorderBrush = FrozenBrush("#34434B"),
                Background = FrozenBrush("#0B1013"),
                Cursor = Cursors.Hand,
                Padding = new Thickness(22),
                HorizontalContentAlignment = HorizontalAlignment.Stretch,
                VerticalContentAlignment = VerticalAlignment.Stretch
            };
            StackPanel panel = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            Border mark = new Border
            {
                Width = 48,
                Height = 5,
                HorizontalAlignment = HorizontalAlignment.Left,
                Margin = new Thickness(0, 0, 0, 20),
                Background = new LinearGradientBrush(
                    (Color)ColorConverter.ConvertFromString(colorA),
                    (Color)ColorConverter.ConvertFromString(colorB),
                    0),
                Effect = new DropShadowEffect
                {
                    Color = (Color)ColorConverter.ConvertFromString(colorA),
                    BlurRadius = 18,
                    ShadowDepth = 0,
                    Opacity = 0.9
                }
            };
            panel.Children.Add(mark);
            panel.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = FrozenBrush("#F7FBFF"),
                FontSize = 22,
                FontWeight = FontWeights.SemiBold
            });
            panel.Children.Add(new TextBlock
            {
                Text = code,
                Foreground = FrozenBrush(colorA),
                FontSize = 10,
                FontWeight = FontWeights.Bold,
                Margin = new Thickness(0, 5, 0, 16)
            });
            panel.Children.Add(new TextBlock
            {
                Text = description,
                Foreground = FrozenBrush("#91A0A8"),
                FontSize = 11,
                TextWrapping = TextWrapping.Wrap
            });
            button.Content = panel;
            button.MouseEnter += delegate
            {
                button.BorderBrush = FrozenBrush("#49616D");
                button.Background = FrozenBrush("#10171B");
                button.Effect = new DropShadowEffect
                {
                    Color = (Color)ColorConverter.ConvertFromString(colorA),
                    BlurRadius = 9,
                    ShadowDepth = 0,
                    Opacity = 0.14
                };
            };
            button.MouseLeave += delegate
            {
                button.BorderBrush = FrozenBrush("#34434B");
                button.Background = FrozenBrush("#0B1013");
                button.Effect = null;
            };
            return button;
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

        private static Brush FrozenBrush(string value)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(value);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }
    }

    public sealed class SnakeGameWindow : Window
    {
        private const int Columns = 28;
        private const int Rows = 18;
        private readonly string _scorePath;
        private readonly GameSurface _field;
        private readonly DispatcherTimer _timer;
        private readonly Random _random = new Random();
        private readonly List<Point> _snake = new List<Point>();
        private readonly List<SnakeParticle> _particles = new List<SnakeParticle>();
        private readonly Brush[] _snakeBrushes;
        private readonly Brush[] _particleBrushes;
        private readonly Pen _gridPen;
        private readonly Brush _boardBrush;
        private readonly Brush _foodBrush;
        private readonly Brush _foodGlowBrush;
        private readonly Brush _bonusBrush;
        private readonly Brush _overlayBrush;
        private TextBlock _scoreText;
        private TextBlock _bestText;
        private TextBlock _levelText;
        private TextBlock _comboText;
        private TextBlock _statusText;
        private TextBlock _launchStateText;
        private Button _pauseButton;
        private Vector _direction = new Vector(1, 0);
        private Vector _nextDirection = new Vector(1, 0);
        private Point _food;
        private Point _bonus;
        private bool _hasBonus;
        private bool _paused;
        private bool _gameOver;
        private int _score;
        private int _best;
        private int _level;
        private int _combo;
        private int _foodsCollected;
        private double _bonusLife;
        private double _comboLife;
        private double _moveAccumulator;
        private DateTime _lastTick;

        public SnakeGameWindow(string scorePath, string iconPath)
        {
            _scorePath = scorePath;
            _best = LoadBestScore();
            _snakeBrushes = new Brush[]
            {
                FrozenBrush("#35E9FF"),
                FrozenBrush("#3D8CFF"),
                FrozenBrush("#BE5CFF"),
                FrozenBrush("#FF3EB5")
            };
            _particleBrushes = new Brush[]
            {
                FrozenBrush("#35E9FF"),
                FrozenBrush("#3D8CFF"),
                FrozenBrush("#FF3EB5"),
                FrozenBrush("#FFD83D")
            };
            _gridPen = new Pen(FrozenBrush("#12303A"), 0.65);
            if (_gridPen.CanFreeze) _gridPen.Freeze();
            _boardBrush = FrozenBrush("#041016");
            _foodBrush = FrozenBrush("#FF4FB8");
            _foodGlowBrush = FrozenBrush("#FFB5E2");
            _bonusBrush = FrozenBrush("#FFD83D");
            _overlayBrush = FrozenBrush("#9A02070B");

            Title = "Neon Snake";
            Width = 720;
            Height = 600;
            MinWidth = 680;
            MinHeight = 560;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            Background = Brushes.Black;
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            if (File.Exists(iconPath))
                Icon = LoadBitmap(iconPath);

            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(68) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(38) });
            root.Children.Add(BuildTitleBar(iconPath));

            Grid hud = BuildHud();
            Grid.SetRow(hud, 1);
            root.Children.Add(hud);

            Border frame = new Border
            {
                Margin = new Thickness(22, 0, 22, 0),
                Background = Brushes.Black,
                BorderBrush = FrozenBrush("#263640"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(5),
                ClipToBounds = true,
                Effect = new DropShadowEffect
                {
                    Color = ColorFrom("#35E9FF"),
                    BlurRadius = 24,
                    ShadowDepth = 0,
                    Opacity = 0.24
                }
            };
            _field = new GameSurface
            {
                Focusable = true,
                ClipToBounds = true,
                Cursor = Cursors.Cross
            };
            _field.Painter = RenderGame;
            frame.Child = _field;
            Grid.SetRow(frame, 2);
            root.Children.Add(frame);

            Border instructions = new Border
            {
                BorderBrush = FrozenBrush("#263640"),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Background = FrozenBrush("#070A0C")
            };
            instructions.Child = new TextBlock
            {
                Text = "Arrows / WASD / Click  •  Space Pause  •  R Restart",
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = FrozenBrush("#81919A"),
                FontSize = 11
            };
            Grid.SetRow(instructions, 3);
            root.Children.Add(instructions);
            Content = root;
            UiWindowReveal.Attach(this);

            _field.MouseLeftButtonDown += OnFieldMouseLeftButtonDown;
            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
            _timer.Tick += delegate { TickGame(); };
            Loaded += delegate
            {
                ResetGame();
                _lastTick = DateTime.UtcNow;
                _field.Focus();
                _timer.Start();
            };
            Closed += delegate { _timer.Stop(); };
            KeyDown += OnKeyDown;
        }

        public void NotifyLaunchComplete()
        {
            _launchStateText.Text = "CHATGPT READY";
            _launchStateText.Foreground = FrozenBrush("#31FF8A");
        }

        private UIElement BuildTitleBar(string iconPath)
        {
            Border bar = new Border
            {
                Background = Brushes.Black,
                BorderBrush = FrozenBrush("#263640"),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            StackPanel brand = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Margin = new Thickness(14, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            if (File.Exists(iconPath))
            {
                Image icon = new Image
                {
                    Source = LoadBitmap(iconPath),
                    Width = 30,
                    Height = 30,
                    Stretch = Stretch.Uniform,
                    Margin = new Thickness(0, 0, 10, 0)
                };
                RenderOptions.SetBitmapScalingMode(icon, BitmapScalingMode.HighQuality);
                brand.Children.Add(icon);
            }
            brand.Children.Add(new TextBlock
            {
                Text = "NEON SNAKE",
                Foreground = FrozenBrush("#F4F8FA"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            });
            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(brand);

            _launchStateText = new TextBlock
            {
                Text = "LAUNCHER WORKING",
                Foreground = FrozenBrush("#35E9FF"),
                FontSize = 10,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(16, 0, 12, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(_launchStateText, 1);
            grid.Children.Add(_launchStateText);

            Button close = IconButton("×", "Close game");
            close.Width = 46;
            close.Height = 46;
            close.Margin = new Thickness(0);
            close.Click += delegate { Close(); };
            Grid.SetColumn(close, 2);
            grid.Children.Add(close);
            bar.Child = grid;
            return bar;
        }

        private Grid BuildHud()
        {
            Grid hud = new Grid { Margin = new Thickness(24, 0, 20, 0) };
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            _scoreText = HudText("SCORE 00000", "#F7FBFF", 16);
            _bestText = HudText("BEST " + _best.ToString("00000"), "#FFD83D", 11);
            _levelText = HudText("LEVEL 1", "#BE5CFF", 11);
            _comboText = HudText("COMBO x0", "#FF4FB8", 11);
            TextBlock[] values = { _scoreText, _bestText, _levelText, _comboText };
            for (int i = 0; i < values.Length; i++)
            {
                values[i].Margin = new Thickness(i == 0 ? 0 : 18, 0, 0, 0);
                Grid.SetColumn(values[i], i);
                hud.Children.Add(values[i]);
            }

            _statusText = HudText("READY", "#35E9FF", 11);
            _statusText.HorizontalAlignment = HorizontalAlignment.Center;
            Grid.SetColumn(_statusText, 4);
            hud.Children.Add(_statusText);

            StackPanel controls = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            _pauseButton = IconButton("Ⅱ", "Pause or continue");
            _pauseButton.Click += delegate { TogglePause(); };
            Button restart = IconButton("↻", "Restart");
            restart.Click += delegate { ResetGame(); };
            controls.Children.Add(_pauseButton);
            controls.Children.Add(restart);
            Grid.SetColumn(controls, 5);
            hud.Children.Add(controls);
            return hud;
        }

        private void TickGame()
        {
            DateTime now = DateTime.UtcNow;
            double dt = (now - _lastTick).TotalSeconds;
            _lastTick = now;
            if (dt < 0 || dt > 0.12) dt = 0.016;

            if (!_paused && !_gameOver)
            {
                UpdateParticles(dt);
                _comboLife = Math.Max(0, _comboLife - dt);
                if (_comboLife <= 0) _combo = 0;
                if (_hasBonus)
                {
                    _bonusLife -= dt;
                    if (_bonusLife <= 0) _hasBonus = false;
                }

                _moveAccumulator += dt;
                double step = Math.Max(0.055, 0.135 - (_level * 0.006));
                while (_moveAccumulator >= step && !_gameOver)
                {
                    _moveAccumulator -= step;
                    MoveSnake();
                    step = Math.Max(0.055, 0.135 - (_level * 0.006));
                }
            }

            _field.InvalidateVisual();
            UpdateHud();
        }

        private void MoveSnake()
        {
            _direction = _nextDirection;
            Point head = _snake[0];
            Point next = new Point(head.X + _direction.X, head.Y + _direction.Y);
            bool eatFood = next == _food;
            bool eatBonus = _hasBonus && next == _bonus;
            int collisionLimit = _snake.Count - ((eatFood || eatBonus) ? 0 : 1);

            if (next.X < 0 || next.X >= Columns || next.Y < 0 || next.Y >= Rows ||
                ContainsPoint(next, _snake, collisionLimit))
            {
                _gameOver = true;
                AddBurst(head, ColorFrom("#FF4FB8"), 22);
                SetStatus("GAME OVER  •  R TO RESTART", "#FF6B6B");
                return;
            }

            _snake.Insert(0, next);
            if (eatFood || eatBonus)
            {
                _foodsCollected++;
                _combo = Math.Min(99, _combo + 1);
                _comboLife = 2.8;
                int gain = eatBonus ? 55 + (_combo * 8) : 10 + Math.Min(45, _combo * 3);
                _score += gain;
                _level = Math.Min(12, 1 + (_foodsCollected / 4));
                AddBurst(next, eatBonus ? ColorFrom("#FFD83D") : ColorFrom("#FF4FB8"), eatBonus ? 28 : 16);
                if (eatBonus) _hasBonus = false;
                PlaceFood();
                if (_foodsCollected > 0 && (_foodsCollected % 4) == 0 && !_hasBonus)
                    PlaceBonus();
                if (_score > _best)
                {
                    _best = _score;
                    SaveBestScore();
                }
            }
            else
            {
                _snake.RemoveAt(_snake.Count - 1);
            }

            UpdateHud();
        }

        private void ResetGame()
        {
            _snake.Clear();
            _snake.Add(new Point(8, 9));
            _snake.Add(new Point(7, 9));
            _snake.Add(new Point(6, 9));
            _snake.Add(new Point(5, 9));
            _direction = new Vector(1, 0);
            _nextDirection = _direction;
            _score = 0;
            _level = 1;
            _combo = 0;
            _foodsCollected = 0;
            _comboLife = 0;
            _bonusLife = 0;
            _hasBonus = false;
            _moveAccumulator = 0;
            _paused = false;
            _gameOver = false;
            _particles.Clear();
            _pauseButton.Content = "Ⅱ";
            SetStatus("RUNNING", "#35E9FF");
            PlaceFood();
            UpdateHud();
            _field.InvalidateVisual();
            _field.Focus();
        }

        private void PlaceFood()
        {
            for (int attempt = 0; attempt < 700; attempt++)
            {
                Point candidate = new Point(_random.Next(Columns), _random.Next(Rows));
                if (!ContainsPoint(candidate, _snake, _snake.Count) && (!_hasBonus || candidate != _bonus))
                {
                    _food = candidate;
                    return;
                }
            }
            _food = new Point(Columns - 2, Rows - 2);
        }

        private void PlaceBonus()
        {
            for (int attempt = 0; attempt < 700; attempt++)
            {
                Point candidate = new Point(_random.Next(Columns), _random.Next(Rows));
                if (!ContainsPoint(candidate, _snake, _snake.Count) && candidate != _food)
                {
                    _bonus = candidate;
                    _hasBonus = true;
                    _bonusLife = 7.5;
                    return;
                }
            }
        }

        private void OnFieldMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            Point click = e.GetPosition(_field);
            Size size = new Size(_field.ActualWidth, _field.ActualHeight);
            double cell = Math.Min(size.Width / Columns, size.Height / Rows);
            if (cell <= 0) return;
            double ox = (size.Width - (cell * Columns)) / 2;
            double oy = (size.Height - (cell * Rows)) / 2;
            Point head = new Point(ox + ((_snake[0].X + 0.5) * cell), oy + ((_snake[0].Y + 0.5) * cell));
            double dx = click.X - head.X;
            double dy = click.Y - head.Y;
            Vector requested = _nextDirection;
            if (Math.Abs(dx) > Math.Abs(dy))
                requested = new Vector(dx >= 0 ? 1 : -1, 0);
            else
                requested = new Vector(0, dy >= 0 ? 1 : -1);
            SetDirection(requested);
            _field.Focus();
            e.Handled = true;
        }

        private void OnKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.R && !e.IsRepeat)
            {
                ResetGame();
                e.Handled = true;
                return;
            }
            if (e.Key == Key.Space && !e.IsRepeat)
            {
                TogglePause();
                e.Handled = true;
                return;
            }

            Vector requested = _nextDirection;
            if (e.Key == Key.Up || e.Key == Key.W) requested = new Vector(0, -1);
            if (e.Key == Key.Down || e.Key == Key.S) requested = new Vector(0, 1);
            if (e.Key == Key.Left || e.Key == Key.A) requested = new Vector(-1, 0);
            if (e.Key == Key.Right || e.Key == Key.D) requested = new Vector(1, 0);
            if (requested.X != _nextDirection.X || requested.Y != _nextDirection.Y)
                SetDirection(requested);
            e.Handled = true;
        }

        private void SetDirection(Vector requested)
        {
            if (requested.X + _direction.X == 0 && requested.Y + _direction.Y == 0)
                return;
            _nextDirection = requested;
        }

        private void TogglePause()
        {
            if (_gameOver) return;
            _paused = !_paused;
            _pauseButton.Content = _paused ? "▶" : "Ⅱ";
            SetStatus(_paused ? "PAUSED" : "RUNNING", _paused ? "#FFD83D" : "#35E9FF");
            _field.Focus();
        }

        private void UpdateParticles(double dt)
        {
            for (int i = _particles.Count - 1; i >= 0; i--)
            {
                SnakeParticle particle = _particles[i];
                particle.Life -= dt;
                particle.X += particle.Vx * dt;
                particle.Y += particle.Vy * dt;
                particle.Vy += 0.85 * dt;
                if (particle.Life <= 0)
                    _particles.RemoveAt(i);
            }
        }

        private void AddBurst(Point cell, Color color, int count)
        {
            Brush brush = new SolidColorBrush(color);
            if (brush.CanFreeze) brush.Freeze();
            int amount = Math.Min(count, 34);
            for (int i = 0; i < amount && _particles.Count < 180; i++)
            {
                double angle = _random.NextDouble() * Math.PI * 2;
                double speed = 1.8 + (_random.NextDouble() * 3.7);
                _particles.Add(new SnakeParticle
                {
                    X = cell.X + 0.5,
                    Y = cell.Y + 0.5,
                    Vx = Math.Cos(angle) * speed,
                    Vy = Math.Sin(angle) * speed,
                    Size = 0.06 + (_random.NextDouble() * 0.09),
                    Life = 0.35 + (_random.NextDouble() * 0.42),
                    MaxLife = 0.7,
                    Brush = brush
                });
            }
        }

        private void RenderGame(DrawingContext dc, Size size)
        {
            dc.DrawRectangle(Brushes.Black, null, new Rect(0, 0, size.Width, size.Height));
            if (size.Width < 20 || size.Height < 20) return;

            double cell = Math.Min(size.Width / Columns, size.Height / Rows);
            double boardWidth = cell * Columns;
            double boardHeight = cell * Rows;
            double ox = (size.Width - boardWidth) / 2;
            double oy = (size.Height - boardHeight) / 2;
            Rect board = new Rect(ox, oy, boardWidth, boardHeight);
            dc.DrawRectangle(_boardBrush, null, board);

            for (int x = 0; x <= Columns; x++)
                dc.DrawLine(_gridPen, new Point(ox + (x * cell), oy), new Point(ox + (x * cell), oy + boardHeight));
            for (int y = 0; y <= Rows; y++)
                dc.DrawLine(_gridPen, new Point(ox, oy + (y * cell)), new Point(ox + boardWidth, oy + (y * cell)));

            for (int i = 0; i < _particles.Count; i++)
            {
                SnakeParticle particle = _particles[i];
                double alpha = Math.Max(0, Math.Min(1, particle.Life / particle.MaxLife));
                dc.PushOpacity(alpha);
                dc.DrawEllipse(particle.Brush, null,
                    new Point(ox + (particle.X * cell), oy + (particle.Y * cell)),
                    Math.Max(1.2, particle.Size * cell), Math.Max(1.2, particle.Size * cell));
                dc.Pop();
            }

            Point foodCenter = new Point(ox + ((_food.X + 0.5) * cell), oy + ((_food.Y + 0.5) * cell));
            dc.PushOpacity(0.16);
            dc.DrawEllipse(_foodGlowBrush, null, foodCenter, cell * 0.46, cell * 0.46);
            dc.Pop();
            dc.DrawEllipse(_foodBrush, new Pen(_foodGlowBrush, 1.2), foodCenter, cell * 0.27, cell * 0.27);
            dc.DrawEllipse(Brushes.White, null,
                new Point(foodCenter.X - (cell * 0.08), foodCenter.Y - (cell * 0.09)),
                Math.Max(1, cell * 0.055), Math.Max(1, cell * 0.055));

            if (_hasBonus)
            {
                Point bonusCenter = new Point(ox + ((_bonus.X + 0.5) * cell), oy + ((_bonus.Y + 0.5) * cell));
                double pulse = 0.92 + (0.08 * Math.Sin(DateTime.UtcNow.Millisecond * 0.02));
                dc.PushOpacity(0.18);
                dc.DrawEllipse(_bonusBrush, null, bonusCenter, cell * 0.5, cell * 0.5);
                dc.Pop();
                dc.PushTransform(new RotateTransform(45, bonusCenter.X, bonusCenter.Y));
                dc.DrawRoundedRectangle(_bonusBrush, null,
                    new Rect(bonusCenter.X - (cell * 0.23 * pulse), bonusCenter.Y - (cell * 0.23 * pulse),
                        cell * 0.46 * pulse, cell * 0.46 * pulse), cell * 0.08, cell * 0.08);
                dc.Pop();
            }

            for (int i = _snake.Count - 1; i >= 0; i--)
            {
                Point part = _snake[i];
                double inset = i == 0 ? cell * 0.09 : cell * 0.13;
                Rect segment = new Rect(
                    ox + (part.X * cell) + inset,
                    oy + (part.Y * cell) + inset,
                    Math.Max(2, cell - (inset * 2)),
                    Math.Max(2, cell - (inset * 2)));
                Brush fill = i == 0 ? FrozenBrush("#F7FBFF") : _snakeBrushes[i % _snakeBrushes.Length];
                dc.PushOpacity(i == 0 ? 1 : Math.Max(0.58, 1 - (i * 0.018)));
                dc.DrawRoundedRectangle(fill, null, segment,
                    i == 0 ? cell * 0.22 : cell * 0.18,
                    i == 0 ? cell * 0.22 : cell * 0.18);
                dc.Pop();
                if (i == 0)
                {
                    double eyeY = segment.Y + (segment.Height * 0.31);
                    dc.DrawEllipse(_boardBrush, null,
                        new Point(segment.X + (segment.Width * 0.3), eyeY), cell * 0.055, cell * 0.055);
                    dc.DrawEllipse(_boardBrush, null,
                        new Point(segment.X + (segment.Width * 0.7), eyeY), cell * 0.055, cell * 0.055);
                }
            }

            if (_paused || _gameOver)
                dc.DrawRectangle(_overlayBrush, null, board);
        }

        private void UpdateHud()
        {
            _scoreText.Text = "SCORE " + _score.ToString("00000");
            _bestText.Text = "BEST " + _best.ToString("00000");
            _levelText.Text = "LEVEL " + _level;
            _comboText.Text = "COMBO x" + _combo;
        }
        private void SetStatus(string text, string color)
        {
            _statusText.Text = text;
            _statusText.Foreground = FrozenBrush(color);
        }

        private static bool ContainsPoint(Point point, List<Point> points, int count)
        {
            int limit = Math.Min(count, points.Count);
            for (int i = 0; i < limit; i++)
                if (points[i] == point) return true;
            return false;
        }

        private int LoadBestScore()
        {
            try
            {
                int value;
                if (File.Exists(_scorePath) &&
                    int.TryParse(File.ReadAllText(_scorePath).Trim(), out value))
                    return Math.Max(0, value);
            }
            catch { }
            return 0;
        }

        private void SaveBestScore()
        {
            try
            {
                string directory = System.IO.Path.GetDirectoryName(_scorePath);
                if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
                File.WriteAllText(_scorePath, _best.ToString(), new UTF8Encoding(false));
            }
            catch { }
        }

        private static TextBlock HudText(string text, string color, double size)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = FrozenBrush(color),
                FontSize = size,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            };
        }

        private static Button IconButton(string glyph, string toolTip)
        {
            Button button = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = glyph,
                Width = 38,
                Height = 32,
                Margin = new Thickness(6, 0, 0, 0),
                BorderThickness = new Thickness(1),
                BorderBrush = FrozenBrush("#42525B"),
                Background = FrozenBrush("#0A1014"),
                Foreground = FrozenBrush("#F4F8FA"),
                FontSize = 15,
                Cursor = Cursors.Hand,
                ToolTip = toolTip
            };
            button.MouseEnter += delegate
            {
                button.BorderBrush = FrozenBrush("#35E9FF");
                button.Background = FrozenBrush("#102239");
            };
            button.MouseLeave += delegate
            {
                button.BorderBrush = FrozenBrush("#42525B");
                button.Background = FrozenBrush("#0A1014");
            };
            return button;
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

        private static Brush FrozenBrush(string value)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(value);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }

        private static Color ColorFrom(string value)
        {
            return (Color)ColorConverter.ConvertFromString(value);
        }

        private sealed class GameSurface : FrameworkElement
        {
            public Action<DrawingContext, Size> Painter;

            protected override void OnRender(DrawingContext drawingContext)
            {
                base.OnRender(drawingContext);
                if (Painter != null)
                    Painter(drawingContext, new Size(ActualWidth, ActualHeight));
            }
        }

        private sealed class SnakeParticle
        {
            public double X;
            public double Y;
            public double Vx;
            public double Vy;
            public double Size;
            public double Life;
            public double MaxLife;
            public Brush Brush;
        }
    }

    internal sealed class LegacyRelayWindow : Window
    {
        private readonly string _scorePath;
        private readonly Canvas _field;
        private readonly Border _catcher;
        private TextBlock _scoreText;
        private TextBlock _bestText;
        private TextBlock _statusText;
        private Button _pauseButton;
        private readonly DispatcherTimer _timer;
        private readonly Random _random = new Random();
        private readonly List<GameOrb> _orbs = new List<GameOrb>();
        private readonly Brush[] _colors;
        private bool _leftPressed;
        private bool _rightPressed;
        private bool _paused;
        private bool _launchComplete;
        private int _score;
        private int _best;
        private int _streak;
        private int _tick;
        private double _catcherX;

        public LegacyRelayWindow(string scorePath)
        {
            _scorePath = scorePath;
            _colors = new Brush[]
            {
                FrozenBrush("#FFD83D"),
                FrozenBrush("#35E9FF"),
                FrozenBrush("#3D8CFF"),
                FrozenBrush("#BE5CFF"),
                FrozenBrush("#FF3EB5"),
                FrozenBrush("#FF6B6B")
            };
            _best = LoadBestScore();

            Title = "Neon Relay";
            Width = 720;
            Height = 520;
            MinWidth = 620;
            MinHeight = 460;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            Background = Brushes.Black;
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;

            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(58) });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(BuildGameTitleBar());

            Grid hud = BuildHud();
            Grid.SetRow(hud, 1);
            root.Children.Add(hud);

            Border frame = new Border
            {
                Margin = new Thickness(18, 0, 18, 18),
                Background = Brushes.Black,
                BorderBrush = FrozenBrush("#26333A"),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(5),
                ClipToBounds = true
            };
            _field = new Canvas
            {
                Background = Brushes.Black,
                Focusable = true,
                ClipToBounds = true
            };
            _catcher = new Border
            {
                Width = 104,
                Height = 14,
                CornerRadius = new CornerRadius(7),
                Background = new LinearGradientBrush(
                    ColorFrom("#FFD83D"),
                    ColorFrom("#35E9FF"),
                    0),
                Effect = new DropShadowEffect
                {
                    Color = ColorFrom("#35E9FF"),
                    BlurRadius = 14,
                    ShadowDepth = 0,
                    Opacity = 0.9
                }
            };
            _field.Children.Add(_catcher);
            frame.Child = _field;
            Grid.SetRow(frame, 2);
            root.Children.Add(frame);
            Content = root;
            UiWindowReveal.Attach(this);

            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
            _timer.Tick += delegate { TickGame(); };
            Loaded += delegate
            {
                ResetGame();
                _field.Focus();
                _timer.Start();
            };
            Closed += delegate { _timer.Stop(); };
            SizeChanged += delegate { ClampCatcher(); };
            KeyDown += OnGameKeyDown;
            KeyUp += OnGameKeyUp;
        }

        public void PauseForLaunchComplete()
        {
            _launchComplete = true;
            _paused = true;
            _pauseButton.Content = "▶";
            _statusText.Text = "启动完成";
            _statusText.Foreground = FrozenBrush("#31FF8A");
        }

        private UIElement BuildGameTitleBar()
        {
            Border bar = new Border
            {
                Background = Brushes.Black,
                BorderBrush = FrozenBrush("#26333A"),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            Grid grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            bar.Child = grid;

            TextBlock title = new TextBlock
            {
                Text = "NEON RELAY",
                Margin = new Thickness(18, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = FrozenBrush("#F4F8FA"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold
            };
            title.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (e.ButtonState == MouseButtonState.Pressed) DragMove();
            };
            grid.Children.Add(title);

            Button close = GameIconButton("×", "关闭");
            close.Width = 48;
            close.Height = 46;
            close.Click += delegate { Close(); };
            Grid.SetColumn(close, 1);
            grid.Children.Add(close);
            return bar;
        }

        private Grid BuildHud()
        {
            Grid hud = new Grid { Margin = new Thickness(18, 0, 18, 0) };
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            hud.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            StackPanel stats = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            _scoreText = HudText("SCORE 0000", "#F4F8FA", 18);
            _bestText = HudText("BEST " + _best.ToString("0000"), "#8E9BA2", 12);
            _bestText.Margin = new Thickness(18, 4, 0, 0);
            _statusText = HudText("READY", "#35E9FF", 11);
            _statusText.Margin = new Thickness(18, 4, 0, 0);
            stats.Children.Add(_scoreText);
            stats.Children.Add(_bestText);
            stats.Children.Add(_statusText);
            hud.Children.Add(stats);

            StackPanel controls = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            Button left = GameIconButton("◀", "向左");
            left.Click += delegate { MoveCatcher(-72); };
            Button right = GameIconButton("▶", "向右");
            right.Click += delegate { MoveCatcher(72); };
            _pauseButton = GameIconButton("Ⅱ", "暂停或继续");
            _pauseButton.Click += delegate { TogglePause(); };
            Button restart = GameIconButton("↻", "重新开始");
            restart.Click += delegate { ResetGame(); };
            controls.Children.Add(left);
            controls.Children.Add(right);
            controls.Children.Add(_pauseButton);
            controls.Children.Add(restart);
            Grid.SetColumn(controls, 1);
            hud.Children.Add(controls);
            return hud;
        }

        private void TickGame()
        {
            if (_paused || _field.ActualWidth < 20 || _field.ActualHeight < 20) return;
            _tick++;
            if (_leftPressed) MoveCatcher(-12);
            if (_rightPressed) MoveCatcher(12);
            if (_tick % Math.Max(9, 18 - (_score / 250)) == 0 && _orbs.Count < 18)
                SpawnOrb();

            double catcherTop = Math.Max(0, _field.ActualHeight - 34);
            for (int i = _orbs.Count - 1; i >= 0; i--)
            {
                GameOrb orb = _orbs[i];
                orb.Y += orb.Speed;
                Canvas.SetTop(orb.Shape, orb.Y);
                orb.Shape.Opacity = 0.74 +
                    0.26 * Math.Abs(Math.Sin((_tick * 0.08) + orb.Phase));

                bool atCatcher = orb.Y + orb.Size >= catcherTop &&
                    orb.Y <= catcherTop + _catcher.Height;
                bool overlaps = orb.X + orb.Size >= _catcherX &&
                    orb.X <= _catcherX + _catcher.Width;
                if (atCatcher && overlaps)
                {
                    _streak++;
                    _score += 10 + Math.Min(40, _streak * 2);
                    RemoveOrb(i);
                    UpdateScore();
                }
                else if (orb.Y > _field.ActualHeight + 10)
                {
                    _streak = 0;
                    RemoveOrb(i);
                    _statusText.Text = "LINK LOST";
                    _statusText.Foreground = FrozenBrush("#FF6B6B");
                }
            }
        }

        private void SpawnOrb()
        {
            double size = 10 + _random.NextDouble() * 10;
            Brush color = _colors[_random.Next(_colors.Length)];
            Ellipse shape = new Ellipse
            {
                Width = size,
                Height = size,
                Fill = color,
                Effect = CreateGlow(color, 12 + size * 0.4)
            };
            double maxX = Math.Max(1, _field.ActualWidth - size);
            GameOrb orb = new GameOrb
            {
                Shape = shape,
                Size = size,
                X = _random.NextDouble() * maxX,
                Y = -size,
                Speed = 2.3 + _random.NextDouble() * 2.6 + Math.Min(2.5, _score / 500.0),
                Phase = _random.NextDouble() * Math.PI * 2
            };
            _field.Children.Add(shape);
            Canvas.SetLeft(shape, orb.X);
            Canvas.SetTop(shape, orb.Y);
            _orbs.Add(orb);
        }

        private void RemoveOrb(int index)
        {
            _field.Children.Remove(_orbs[index].Shape);
            _orbs.RemoveAt(index);
        }

        private void ResetGame()
        {
            for (int i = _orbs.Count - 1; i >= 0; i--)
                RemoveOrb(i);
            _score = 0;
            _streak = 0;
            _tick = 0;
            _launchComplete = false;
            _paused = false;
            _pauseButton.Content = "Ⅱ";
            _statusText.Text = "READY";
            _statusText.Foreground = FrozenBrush("#35E9FF");
            _catcherX = Math.Max(0, (_field.ActualWidth - _catcher.Width) / 2);
            ClampCatcher();
            UpdateScore();
            _field.Focus();
        }

        private void TogglePause()
        {
            if (_launchComplete) return;
            _paused = !_paused;
            _pauseButton.Content = _paused ? "▶" : "Ⅱ";
            _statusText.Text = _paused ? "PAUSED" : "ACTIVE";
            _statusText.Foreground = _paused
                ? FrozenBrush("#FFD83D")
                : FrozenBrush("#31FF8A");
            _field.Focus();
        }

        private void MoveCatcher(double delta)
        {
            _catcherX += delta;
            ClampCatcher();
            _field.Focus();
        }

        private void ClampCatcher()
        {
            if (_field == null || _catcher == null) return;
            _catcherX = Math.Max(0,
                Math.Min(Math.Max(0, _field.ActualWidth - _catcher.Width), _catcherX));
            Canvas.SetLeft(_catcher, _catcherX);
            Canvas.SetTop(_catcher, Math.Max(0, _field.ActualHeight - 34));
        }

        private void UpdateScore()
        {
            if (_score > _best)
            {
                _best = _score;
                SaveBestScore();
            }
            _scoreText.Text = "SCORE " + _score.ToString("0000");
            _bestText.Text = "BEST " + _best.ToString("0000");
            if (!_paused)
            {
                _statusText.Text = _streak >= 3 ? "CHAIN ×" + _streak : "ACTIVE";
                _statusText.Foreground = _streak >= 3
                    ? FrozenBrush("#FF3EB5")
                    : FrozenBrush("#31FF8A");
            }
        }

        private void OnGameKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Left || e.Key == Key.A) _leftPressed = true;
            if (e.Key == Key.Right || e.Key == Key.D) _rightPressed = true;
            if (e.Key == Key.Space && !e.IsRepeat) TogglePause();
            if (e.Key == Key.R && !e.IsRepeat) ResetGame();
        }

        private void OnGameKeyUp(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Left || e.Key == Key.A) _leftPressed = false;
            if (e.Key == Key.Right || e.Key == Key.D) _rightPressed = false;
        }

        private int LoadBestScore()
        {
            try
            {
                int value;
                if (File.Exists(_scorePath) &&
                    int.TryParse(File.ReadAllText(_scorePath).Trim(), out value))
                    return Math.Max(0, value);
            }
            catch { }
            return 0;
        }

        private void SaveBestScore()
        {
            try
            {
                string directory = System.IO.Path.GetDirectoryName(_scorePath);
                if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
                File.WriteAllText(_scorePath, _best.ToString(), new UTF8Encoding(false));
            }
            catch { }
        }

        private static TextBlock HudText(string text, string color, double size)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = FrozenBrush(color),
                FontSize = size,
                FontWeight = FontWeights.SemiBold,
                VerticalAlignment = VerticalAlignment.Center
            };
        }

        private static Button GameIconButton(string glyph, string toolTip)
        {
            Button button = new Button
            {
                Template = UiButtonChrome.Create(),
                Content = glyph,
                Width = 38,
                Height = 32,
                Margin = new Thickness(6, 0, 0, 0),
                BorderThickness = new Thickness(1),
                BorderBrush = FrozenBrush("#42525B"),
                Background = FrozenBrush("#10171B"),
                Foreground = FrozenBrush("#F4F8FA"),
                FontSize = 15,
                Cursor = Cursors.Hand,
                ToolTip = toolTip
            };
            return button;
        }

        private static Effect CreateGlow(Brush brush, double radius)
        {
            SolidColorBrush solid = brush as SolidColorBrush;
            return new DropShadowEffect
            {
                Color = solid == null ? Colors.White : solid.Color,
                BlurRadius = radius,
                ShadowDepth = 0,
                Opacity = 0.9
            };
        }

        private static Brush FrozenBrush(string value)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(value);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }

        private static Color ColorFrom(string value)
        {
            return (Color)ColorConverter.ConvertFromString(value);
        }

        private sealed class GameOrb
        {
            public Ellipse Shape;
            public double Size;
            public double X;
            public double Y;
            public double Speed;
            public double Phase;
        }
    }

    public sealed class EnvironmentProfileResult
    {
        public bool Created;
        public string Summary;
        public string[] Details;
    }

    public static class FirstRunEnvironment
    {
        public static EnvironmentProfileResult Ensure(string stateDirectory)
        {
            Directory.CreateDirectory(stateDirectory);
            string profilePath = System.IO.Path.Combine(
                stateDirectory, "environment-profile.ini");
            string machineGuid = Convert.ToString(Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography",
                "MachineGuid",
                "unknown"));
            string machineId = HashValue(machineGuid);
            Dictionary<string, string> existing = ReadProfile(profilePath);
            string existingMachineId;
            if (existing.TryGetValue("machine_id", out existingMachineId) &&
                existingMachineId == machineId &&
                existing.ContainsKey("schema") &&
                existing["schema"] == "3")
            {
                string cachedFamily = existing.ContainsKey("compatibility_profile")
                    ? existing["compatibility_profile"] : "Windows";
                string cachedBuild = existing.ContainsKey("windows_build")
                    ? existing["windows_build"] : "unknown";
                string cachedUbr = existing.ContainsKey("windows_ubr")
                    ? existing["windows_ubr"] : "unknown";
                string cachedArchitecture = existing.ContainsKey("os_architecture")
                    ? existing["os_architecture"] : "unknown";
                string cachedDesktop = existing.ContainsKey("desktop_version")
                    ? existing["desktop_version"] : "unknown";
                string cachedSignature = existing.ContainsKey("desktop_signature_kind")
                    ? existing["desktop_signature_kind"] : "unknown";
                return new EnvironmentProfileResult
                {
                    Created = false,
                    Summary = cachedFamily + " build " + cachedBuild + "." +
                        cachedUbr + " " + cachedArchitecture +
                        " | first-run profile cache",
                    Details = new[]
                    {
                        "system profile loaded from disk; full hardware and OS scan skipped",
                        "profile_machine_match=true desktop_at_first_scan=" + cachedDesktop,
                        "package_channel_at_first_scan=" + cachedSignature,
                        "profile=" + profilePath
                    }
                };
            }

            const string currentVersion =
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion";
            object buildValue = Registry.GetValue(
                currentVersion, "CurrentBuildNumber", "0");
            object ubrValue = Registry.GetValue(currentVersion, "UBR", "0");
            object displayVersion = Registry.GetValue(
                currentVersion, "DisplayVersion", "unknown");
            object edition = Registry.GetValue(
                currentVersion, "EditionID", "unknown");
            object productName = Registry.GetValue(
                currentVersion, "ProductName", "unknown");
            object powerShellVersion = Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\PowerShell\3\PowerShellEngine",
                "PowerShellVersion",
                "unknown");
            object longPaths = Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\FileSystem",
                "LongPathsEnabled",
                0);

            int build;
            if (!int.TryParse(Convert.ToString(buildValue), out build))
                build = Environment.OSVersion.Version.Build;
            string family = build >= 22000
                ? "Windows11Modern"
                : build >= 17763 ? "Windows10Modern" : "WindowsLegacy";
            string architecture = Environment.Is64BitOperatingSystem ? "x64" : "x86";
            DesktopPackageProfile package = DetectDesktopPackage();
            string fingerprint = machineId;

            string launcherRoot = GetLauncherRoot(stateDirectory);
            string launcherDrive = System.IO.Path.GetPathRoot(launcherRoot);
            DriveInfo drive = null;
            try
            {
                drive = new DriveInfo(launcherDrive);
            }
            catch
            {
            }
            string driveFormat = drive != null && drive.IsReady ? drive.DriveFormat : "unknown";
            long freeBytes = drive != null && drive.IsReady ? drive.AvailableFreeSpace : 0;
            bool junctions = string.Equals(
                driveFormat, "NTFS", StringComparison.OrdinalIgnoreCase);
            string localAppData = Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData);
            string codexHome = Environment.GetEnvironmentVariable("CODEX_HOME");
            if (string.IsNullOrWhiteSpace(codexHome))
                codexHome = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".codex");
            string pluginCache = System.IO.Path.Combine(
                codexHome, "plugins", "cache", "openai-bundled");
            string mirrorRoot = System.IO.Path.Combine(
                launcherRoot, "R");
            string backupRoot = ResolveConfiguredBackupRoot(
                launcherRoot, launcherDrive);
            string pathStrategy = Convert.ToString(longPaths) == "1"
                ? "native-long-paths"
                : "short-user-writable-mirror";

            string[] lines =
            {
                "; Generated by WinBridge Recovery adaptive preflight.",
                "; Reused on this machine. Regenerated only after migration to another Windows installation.",
                "schema=3",
                "machine_id=" + machineId,
                "machine_fingerprint=" + fingerprint,
                "compatibility_profile=" + family,
                "compatibility_supported=" + (build >= 17763 ? "true" : "false"),
                "windows_product_name=" + SafeValue(productName),
                "windows_build=" + build,
                "windows_ubr=" + Convert.ToString(ubrValue),
                "windows_display_version=" + SafeValue(displayVersion),
                "windows_edition=" + SafeValue(edition),
                "os_architecture=" + architecture,
                "process_architecture=" + (Environment.Is64BitProcess ? "x64" : "x86"),
                "powershell_version=" + SafeValue(powerShellVersion),
                "powershell_path=" + SafeValue(FindPowerShell()),
                "long_paths_enabled=" + Convert.ToString(longPaths),
                "launcher_root=" + SafeValue(launcherRoot),
                "launcher_drive_format=" + SafeValue(driveFormat),
                "launcher_drive_free_bytes=" + freeBytes,
                "codex_home=" + SafeValue(codexHome),
                "plugin_cache=" + SafeValue(pluginCache),
                "desktop_detected=" + package.Detected.ToString().ToLowerInvariant(),
                "desktop_version=" + SafeValue(package.Version),
                "desktop_architecture=" + SafeValue(package.Architecture),
                "desktop_signature_kind=" + SafeValue(package.SignatureKind),
                "desktop_status=" + SafeValue(package.Status),
                "desktop_install_location=" + SafeValue(package.InstallLocation),
                "selected_resource_strategy=user-writable-official-mirror",
                "selected_mirror_root=" + SafeValue(mirrorRoot),
                "selected_pointer_strategy=" +
                    (junctions ? "ntfs-junction" : "directory-copy-review-required"),
                "selected_path_strategy=" + pathStrategy,
                "selected_backup_root=" + SafeValue(backupRoot),
                "requires_elevation_for_preflight=false",
                "detected_utc=" + DateTime.UtcNow.ToString("o")
            };
            File.WriteAllLines(profilePath, lines, new UTF8Encoding(false));
            return new EnvironmentProfileResult
            {
                Created = true,
                Summary = family + " build " + build + "." +
                    Convert.ToString(ubrValue) + " " + architecture +
                    " | Desktop " + package.Version,
                Details = new[]
                {
                    "compatibility=" + (build >= 17763 ? "supported" : "legacy-review-required") +
                        " filesystem=" + driveFormat,
                    "Desktop=" + (package.Detected ? "detected" : "not-detected") +
                        " version=" + package.Version +
                        " signature=" + package.SignatureKind,
                    "resource_strategy=user-writable-official-mirror pointer_strategy=" +
                        (junctions ? "ntfs-junction" : "manual-review"),
                    "profile=" + profilePath
                }
            };
        }

        private static DesktopPackageProfile DetectDesktopPackage()
        {
            DesktopPackageProfile result = new DesktopPackageProfile
            {
                Detected = false,
                Version = "unknown",
                Architecture = "unknown",
                SignatureKind = "unknown",
                Status = "unknown",
                InstallLocation = string.Empty
            };

            try
            {
                ProcessStartInfo start = new ProcessStartInfo
                {
                    FileName = FindPowerShell(),
                    Arguments =
                        "-NoLogo -NoProfile -ExecutionPolicy Bypass -Command " +
                        "\"$p=Get-AppxPackage -Name 'OpenAI.Codex' | " +
                        "Sort-Object Version -Descending | Select-Object -First 1; " +
                        "if($p){[Console]::Out.Write(($p.Version.ToString())+'|'+$p.Architecture+'|'+$p.SignatureKind+'|'+$p.Status+'|'+$p.InstallLocation)}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (Process process = Process.Start(start))
                {
                    if (!process.WaitForExit(12000))
                    {
                        try { process.Kill(); }
                        catch { }
                        return result;
                    }
                    string output = process.StandardOutput.ReadToEnd().Trim();
                    if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
                        return result;
                    string[] parts = output.Split(new[] { '|' }, 5);
                    if (parts.Length != 5) return result;
                    result.Detected = true;
                    result.Version = parts[0];
                    result.Architecture = parts[1];
                    result.SignatureKind = parts[2];
                    result.Status = parts[3];
                    result.InstallLocation = parts[4];
                }
            }
            catch
            {
            }
            return result;
        }

        private static Dictionary<string, string> ReadProfile(string path)
        {
            Dictionary<string, string> result =
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (!File.Exists(path)) return result;
            try
            {
                foreach (string line in File.ReadAllLines(path))
                {
                    if (string.IsNullOrWhiteSpace(line) || line.StartsWith(";"))
                        continue;
                    int separator = line.IndexOf('=');
                    if (separator <= 0) continue;
                    result[line.Substring(0, separator).Trim()] =
                        line.Substring(separator + 1).Trim();
                }
            }
            catch
            {
                result.Clear();
            }
            return result;
        }

        private static string GetLauncherRoot(string stateDirectory)
        {
            DirectoryInfo state = new DirectoryInfo(stateDirectory);
            if (state.Parent != null && state.Parent.Parent != null)
                return state.Parent.Parent.FullName;
            return AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        }

        private static string ResolveConfiguredBackupRoot(
            string launcherRoot,
            string launcherDrive)
        {
            string fallback = System.IO.Path.Combine(
                launcherDrive, "CodexPluginRepairBackups");
            string configPath = System.IO.Path.Combine(
                launcherRoot, "Config", "storage.ini");
            if (!File.Exists(configPath)) return fallback;
            try
            {
                foreach (string line in File.ReadAllLines(configPath, Encoding.UTF8))
                {
                    if (!line.StartsWith(
                        "backup_root=", StringComparison.OrdinalIgnoreCase))
                        continue;
                    string configured = line.Substring("backup_root=".Length).Trim();
                    if (System.IO.Path.IsPathRooted(configured))
                        return System.IO.Path.GetFullPath(configured).TrimEnd('\\');
                }
            }
            catch
            {
            }
            return fallback;
        }

        private static string FindPowerShell()
        {
            string system = Environment.GetFolderPath(Environment.SpecialFolder.System);
            string path = System.IO.Path.Combine(
                system, "WindowsPowerShell", "v1.0", "powershell.exe");
            return File.Exists(path) ? path : "powershell.exe";
        }

        private static string HashValue(string value)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(value));
                StringBuilder text = new StringBuilder(hash.Length * 2);
                for (int i = 0; i < hash.Length; i++)
                    text.Append(hash[i].ToString("x2"));
                return text.ToString();
            }
        }

        private static string SafeValue(object value)
        {
            return Convert.ToString(value)
                .Replace("\r", " ")
                .Replace("\n", " ")
                .Replace("=", "-")
                .Trim();
        }

        private sealed class DesktopPackageProfile
        {
            public bool Detected;
            public string Version;
            public string Architecture;
            public string SignatureKind;
            public string Status;
            public string InstallLocation;
        }
    }

    public sealed class ParticleTheme
    {
        public int ParticleCount;
        public int WaveCount;
        public int GlowEvery;
        public double MinimumSize;
        public double MaximumSize;
        public double MinimumOpacity;
        public double MaximumOpacity;
        public double MinimumSpeed;
        public double MaximumSpeed;
        public double MinimumAmplitude;
        public double MaximumAmplitude;
        public double GlowRadius;
        public double PhaseStep;
        public string[] Colors;

        public static ParticleTheme NeonBlack()
        {
            return new ParticleTheme
            {
                ParticleCount = 84,
                WaveCount = 4,
                GlowEvery = 3,
                MinimumSize = 1.7,
                MaximumSize = 6.8,
                MinimumOpacity = 0.34,
                MaximumOpacity = 0.96,
                MinimumSpeed = 0.0007,
                MaximumSpeed = 0.0025,
                MinimumAmplitude = 7,
                MaximumAmplitude = 34,
                GlowRadius = 12,
                PhaseStep = 0.05,
                Colors = new[]
                {
                    "#31FF8A",
                    "#2DEBFF",
                    "#4387FF",
                    "#B84DFF",
                    "#FF4FD8",
                    "#FFB13B",
                    "#FF5268"
                }
            };
        }
    }

    public sealed class ParticleFlow : Canvas
    {
        private readonly List<Particle> _particles = new List<Particle>();
        private readonly List<Polyline> _waves = new List<Polyline>();
        private readonly DispatcherTimer _timer;
        private readonly Random _random = new Random(4172);
        private readonly Brush[] _palette;
        private readonly ParticleTheme _theme;
        private double _phase;

        public ParticleFlow(ParticleTheme theme)
        {
            _theme = theme ?? ParticleTheme.NeonBlack();
            _palette = new Brush[_theme.Colors.Length];
            for (int i = 0; i < _theme.Colors.Length; i++)
            {
                _palette[i] = FrozenBrush(_theme.Colors[i]);
            }
            Background = Brushes.Black;
            IsHitTestVisible = false;
            ClipToBounds = true;
            Loaded += delegate { EnsureParticles(); };
            SizeChanged += delegate { ArrangeParticles(); };
            _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
            _timer.Tick += delegate { Animate(); };
        }

        public void Start()
        {
            EnsureParticles();
            _timer.Start();
        }

        public void Stop()
        {
            _timer.Stop();
        }

        private void EnsureParticles()
        {
            if (_particles.Count > 0) return;

            for (int waveIndex = 0; waveIndex < _theme.WaveCount; waveIndex++)
            {
                Brush waveBrush = _palette[(waveIndex + 1) % _palette.Length];
                Polyline wave = new Polyline
                {
                    Stroke = waveBrush,
                    StrokeThickness = waveIndex == 1 ? 1.6 : 1.1,
                    Opacity = waveIndex == 1 ? 0.38 : 0.24,
                    Effect = CreateGlow(waveBrush, _theme.GlowRadius * 0.75, 0.7),
                    SnapsToDevicePixels = false
                };
                Panel.SetZIndex(wave, 0);
                Children.Add(wave);
                _waves.Add(wave);
            }

            for (int i = 0; i < _theme.ParticleCount; i++)
            {
                double size = _theme.MinimumSize +
                    _random.NextDouble() * (_theme.MaximumSize - _theme.MinimumSize);
                double opacity = _theme.MinimumOpacity +
                    _random.NextDouble() * (_theme.MaximumOpacity - _theme.MinimumOpacity);
                Brush particleBrush = _palette[i % _palette.Length];
                Ellipse ellipse = new Ellipse
                {
                    Width = size,
                    Height = size,
                    Fill = particleBrush,
                    Opacity = opacity
                };
                if (i % _theme.GlowEvery == 0)
                    ellipse.Effect = CreateGlow(
                        particleBrush,
                        _theme.GlowRadius + (size * 0.8),
                        0.92);
                Panel.SetZIndex(ellipse, 1);
                Children.Add(ellipse);
                _particles.Add(new Particle
                {
                    Shape = ellipse,
                    XRatio = _random.NextDouble(),
                    Speed = _theme.MinimumSpeed +
                        _random.NextDouble() * (_theme.MaximumSpeed - _theme.MinimumSpeed),
                    Amplitude = _theme.MinimumAmplitude +
                        _random.NextDouble() * (_theme.MaximumAmplitude - _theme.MinimumAmplitude),
                    Offset = _random.NextDouble() * Math.PI * 2,
                    BaseOpacity = opacity,
                    Pulse = 0.6 + _random.NextDouble() * 1.8
                });
            }
            ArrangeParticles();
        }

        private void ArrangeParticles()
        {
            double width = Math.Max(ActualWidth, 1);
            double centerY = Math.Max(ActualHeight, 1) / 2;
            for (int i = 0; i < _particles.Count; i++)
            {
                Particle particle = _particles[i];
                SetLeft(particle.Shape, particle.XRatio * width);
                SetTop(particle.Shape,
                    centerY + Math.Sin(particle.Offset + particle.XRatio * 9) * particle.Amplitude);
            }
        }

        private void Animate()
        {
            if (ActualWidth <= 1 || ActualHeight <= 1) return;
            _phase += _theme.PhaseStep;
            double centerY = ActualHeight / 2;

            for (int waveIndex = 0; waveIndex < _waves.Count; waveIndex++)
            {
                PointCollection points = new PointCollection();
                double amplitude = 7 + waveIndex * 6;
                double speed = 0.72 + waveIndex * 0.21;
                double direction = waveIndex == 1 ? -1 : 1;
                for (int pointIndex = 0; pointIndex <= 56; pointIndex++)
                {
                    double ratio = pointIndex / 56.0;
                    double x = ratio * ActualWidth;
                    double y = centerY +
                        Math.Sin((ratio * 10.5) + (_phase * speed * direction) + waveIndex) * amplitude +
                        Math.Cos((ratio * 4.2) - (_phase * 0.38) + waveIndex) * 3.5;
                    points.Add(new Point(x, y));
                }
                _waves[waveIndex].Points = points;
            }

            for (int i = 0; i < _particles.Count; i++)
            {
                Particle particle = _particles[i];
                particle.XRatio += particle.Speed * 12;
                if (particle.XRatio > 1.02) particle.XRatio = -0.02;
                double x = particle.XRatio * ActualWidth;
                double y = centerY +
                    Math.Sin(_phase + particle.Offset + particle.XRatio * 10) * particle.Amplitude;
                SetLeft(particle.Shape, x);
                SetTop(particle.Shape, y);
                particle.Shape.Opacity = particle.BaseOpacity *
                    (0.64 + 0.36 * Math.Abs(Math.Sin((_phase * particle.Pulse) + particle.Offset)));
            }
        }

        private static Brush FrozenBrush(string value)
        {
            Brush brush = (Brush)new BrushConverter().ConvertFromString(value);
            if (brush.CanFreeze) brush.Freeze();
            return brush;
        }

        private static Effect CreateGlow(Brush brush, double radius, double opacity)
        {
            SolidColorBrush solid = brush as SolidColorBrush;
            return new DropShadowEffect
            {
                Color = solid == null ? Colors.White : solid.Color,
                BlurRadius = radius,
                ShadowDepth = 0,
                Opacity = opacity
            };
        }

        private sealed class Particle
        {
            public Ellipse Shape;
            public double XRatio;
            public double Speed;
            public double Amplitude;
            public double Offset;
            public double BaseOpacity;
            public double Pulse;
        }
    }

    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            bool demo = false;
            bool diagnose = false;
            bool minesweeperPreview = false;
            bool settingsPreview = false;
            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], "--demo", StringComparison.OrdinalIgnoreCase))
                    demo = true;
                if (string.Equals(args[i], "--diagnose", StringComparison.OrdinalIgnoreCase))
                    diagnose = true;
                if (string.Equals(args[i], "--minesweeper-preview", StringComparison.OrdinalIgnoreCase))
                    minesweeperPreview = true;
                if (string.Equals(args[i], "--settings-preview", StringComparison.OrdinalIgnoreCase))
                    settingsPreview = true;
            }

            string exe = Process.GetCurrentProcess().MainModule.FileName;
            string root = Directory.GetParent(System.IO.Path.GetDirectoryName(exe)).FullName;
            if (settingsPreview)
            {
                string previewIcon = System.IO.Path.Combine(root, "LauncherUI", "Assets", "WinBridge.png");
                Application previewApp = new Application { ShutdownMode = ShutdownMode.OnLastWindowClose };
                AdvancedSettingsWindow preview = new AdvancedSettingsWindow(
                    root,
                    previewIcon,
                    LauncherGeneralSettings.Load(root),
                    LauncherThemeSettings.Load(root),
                    delegate(LauncherGeneralSettings settings) { },
                    delegate(LauncherThemeSettings settings) { },
                    delegate { },
                    delegate { });
                previewApp.Run(preview);
                return;
            }
            if (minesweeperPreview)
            {
                string statePath = System.IO.Path.Combine(
                    root, "LauncherUI", "State", "neon-minesweeper-best-time.txt");
                string previewIcon = System.IO.Path.Combine(
                    root, "LauncherUI", "Assets", "WinBridge.png");
                Application previewApp = new Application
                {
                    ShutdownMode = ShutdownMode.OnLastWindowClose
                };
                previewApp.Run(new MinesweeperGameWindow(statePath, previewIcon));
                return;
            }
            string script = System.IO.Path.Combine(root, "Invoke-WinBridge-Configured.ps1");
            if (!File.Exists(script))
            {
                MessageBox.Show(
                    "启动器必须位于 ChatGPT-Plugin-Safe-Launcher\\LauncherUI 目录。\n\n未找到:\n" + script,
                    "WinBridge Recovery",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
                return;
            }

            Application app = new Application
            {
                ShutdownMode = ShutdownMode.OnLastWindowClose
            };
            app.Run(new LauncherWindow(root, demo, diagnose));
        }
    }
}
