using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace WinBridgeRecovery
{
    public sealed class MinesweeperGameWindow : Window
    {
        private const int Columns = 16;
        private const int Rows = 16;
        private const int MineCount = 40;
        private readonly string _bestTimePath;
        private readonly Button[] _cells = new Button[Columns * Rows];
        private readonly bool[] _mines = new bool[Columns * Rows];
        private readonly bool[] _revealed = new bool[Columns * Rows];
        private readonly bool[] _flagged = new bool[Columns * Rows];
        private readonly Random _random = new Random();
        private readonly DispatcherTimer _timer;
        private readonly TextBlock _mineLabel;
        private readonly TextBlock _timeLabel;
        private readonly TextBlock _statusLabel;
        private bool _started;
        private bool _finished;
        private int _elapsedSeconds;
        private int _flagCount;

        public MinesweeperGameWindow(string bestTimePath, string iconPath)
        {
            _bestTimePath = bestTimePath;
            Title = "Neon Minesweeper";
            Width = 548;
            Height = 650;
            ResizeMode = ResizeMode.NoResize;
            WindowStyle = WindowStyle.None;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = Brush("#070A0D");
            Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI, Microsoft YaHei UI");
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            if (File.Exists(iconPath)) Icon = LoadBitmap(iconPath);
            Grid root = new Grid();
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(48) });
            root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            root.Children.Add(BuildTitleBar(iconPath));
            Grid header = new Grid { Margin = new Thickness(24, 18, 24, 14) };
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            _mineLabel = Counter("MINES  " + MineCount.ToString(CultureInfo.InvariantCulture), "#39E7FF");
            header.Children.Add(_mineLabel);
            Button reset = new Button { Content = "RESTART", Width = 92, Height = 34, Background = Brush("#111820"), BorderBrush = Brush("#3C4B56"), Foreground = Brush("#EDF7FA"), Cursor = Cursors.Hand, FontWeight = FontWeights.SemiBold };
            reset.Click += delegate { ResetGame(); };
            Grid.SetColumn(reset, 1); header.Children.Add(reset);
            _timeLabel = Counter("TIME  000", "#FF55B9"); _timeLabel.HorizontalAlignment = HorizontalAlignment.Right;
            Grid.SetColumn(_timeLabel, 2); header.Children.Add(_timeLabel);
            Grid.SetRow(header, 1); root.Children.Add(header);
            Border boardFrame = new Border { Margin = new Thickness(24, 0, 24, 24), Padding = new Thickness(10), Background = Brush("#0A1015"), BorderBrush = Brush("#334550"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(6) };
            Grid boardRoot = new Grid();
            boardRoot.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            boardRoot.RowDefinitions.Add(new RowDefinition { Height = new GridLength(38) });
            UniformGrid board = new UniformGrid { Columns = Columns, Rows = Rows };
            for (int i = 0; i < _cells.Length; i++)
            {
                int index = i;
                Button cell = new Button { Margin = new Thickness(1), Padding = new Thickness(0), Background = Brush("#111B22"), BorderBrush = Brush("#2E404A"), BorderThickness = new Thickness(1), Foreground = Brushes.White, FontSize = 13, FontWeight = FontWeights.Bold, Cursor = Cursors.Hand, Tag = index };
                cell.Click += delegate { Reveal(index); };
                cell.PreviewMouseRightButtonDown += delegate(object sender, MouseButtonEventArgs e) { ToggleFlag(index); e.Handled = true; };
                _cells[i] = cell; board.Children.Add(cell);
            }
            boardRoot.Children.Add(board);
            _statusLabel = new TextBlock { Text = "左键翻开  ·  右键插旗", Foreground = Brush("#8FA2AD"), FontSize = 11, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
            Grid.SetRow(_statusLabel, 1); boardRoot.Children.Add(_statusLabel);
            boardFrame.Child = boardRoot; Grid.SetRow(boardFrame, 2); root.Children.Add(boardFrame); Content = root;
            _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
            _timer.Tick += delegate { if (!_started || _finished) return; _elapsedSeconds = Math.Min(999, _elapsedSeconds + 1); _timeLabel.Text = "TIME  " + _elapsedSeconds.ToString("000", CultureInfo.InvariantCulture); };
            Closed += delegate { _timer.Stop(); };
            ResetGame();
            UiWindowReveal.Attach(this);
        }

        public void NotifyLaunchComplete() { if (!_finished) _statusLabel.Text = "启动检查完成  ·  可以继续游戏"; }

        private void ResetGame()
        {
            _timer.Stop(); Array.Clear(_mines, 0, _mines.Length); Array.Clear(_revealed, 0, _revealed.Length); Array.Clear(_flagged, 0, _flagged.Length);
            _started = false; _finished = false; _elapsedSeconds = 0; _flagCount = 0;
            _timeLabel.Text = "TIME  000"; _mineLabel.Text = "MINES  " + MineCount.ToString(CultureInfo.InvariantCulture); _statusLabel.Text = "左键翻开  ·  右键插旗";
            for (int i = 0; i < _cells.Length; i++) { _cells[i].Content = null; _cells[i].IsEnabled = true; _cells[i].Background = Brush("#111B22"); _cells[i].BorderBrush = Brush("#2E404A"); _cells[i].Foreground = Brushes.White; }
        }

        private void PlaceMines(int safeIndex)
        {
            HashSet<int> excluded = new HashSet<int>(); excluded.Add(safeIndex);
            int safeRow = safeIndex / Columns; int safeColumn = safeIndex % Columns;
            for (int row = safeRow - 1; row <= safeRow + 1; row++) for (int column = safeColumn - 1; column <= safeColumn + 1; column++) if (row >= 0 && row < Rows && column >= 0 && column < Columns) excluded.Add(row * Columns + column);
            int placed = 0; while (placed < MineCount) { int index = _random.Next(_mines.Length); if (_mines[index] || excluded.Contains(index)) continue; _mines[index] = true; placed++; }
        }

        private void Reveal(int index)
        {
            if (_finished || _flagged[index] || _revealed[index]) return;
            if (!_started) { PlaceMines(index); _started = true; _timer.Start(); }
            if (_mines[index]) { Finish(false); return; }
            Queue<int> queue = new Queue<int>(); queue.Enqueue(index);
            while (queue.Count > 0) { int current = queue.Dequeue(); if (_revealed[current] || _flagged[current]) continue; _revealed[current] = true; int adjacent = AdjacentMines(current); PaintRevealed(current, adjacent); if (adjacent != 0) continue; foreach (int neighbor in Neighbors(current)) if (!_revealed[neighbor] && !_mines[neighbor]) queue.Enqueue(neighbor); }
            int safeRevealed = 0; for (int i = 0; i < _revealed.Length; i++) if (_revealed[i] && !_mines[i]) safeRevealed++;
            if (safeRevealed == _cells.Length - MineCount) Finish(true);
        }

        private void ToggleFlag(int index)
        {
            if (_finished || _revealed[index]) return; _flagged[index] = !_flagged[index]; _flagCount += _flagged[index] ? 1 : -1;
            _cells[index].Content = _flagged[index] ? "\u2691" : null; _cells[index].Foreground = Brush("#FF57B9"); _mineLabel.Text = "MINES  " + Math.Max(0, MineCount - _flagCount).ToString(CultureInfo.InvariantCulture);
        }

        private void Finish(bool won)
        {
            _finished = true; _timer.Stop();
            for (int i = 0; i < _cells.Length; i++) if (_mines[i]) { _cells[i].Content = "●"; _cells[i].Foreground = won ? Brush("#35E9FF") : Brush("#FF5571"); _cells[i].Background = Brush(won ? "#10262B" : "#2A1118"); }
            if (won) { _statusLabel.Text = "完成  ·  " + _elapsedSeconds.ToString(CultureInfo.InvariantCulture) + " 秒"; SaveBestTime(); } else _statusLabel.Text = "踩到雷了  ·  点击 RESTART 再来一局";
        }

        private void SaveBestTime()
        {
            try { int previous; if (File.Exists(_bestTimePath) && int.TryParse(File.ReadAllText(_bestTimePath).Trim(), out previous) && previous <= _elapsedSeconds) return; string directory = Path.GetDirectoryName(_bestTimePath); if (!Directory.Exists(directory)) Directory.CreateDirectory(directory); File.WriteAllText(_bestTimePath, _elapsedSeconds.ToString(CultureInfo.InvariantCulture)); _statusLabel.Text += "  ·  新纪录"; } catch { }
        }

        private void PaintRevealed(int index, int adjacent)
        {
            Button cell = _cells[index]; cell.IsEnabled = false; cell.Background = Brush("#080D11"); cell.BorderBrush = Brush("#18252C"); cell.Content = adjacent == 0 ? null : adjacent.ToString(CultureInfo.InvariantCulture);
            string[] colors = { "#FFFFFF", "#47C9FF", "#55E49A", "#FFCA58", "#FF6C88", "#BD7BFF", "#52E7E7", "#F7A5D2", "#DDE7EC" }; cell.Foreground = Brush(colors[Math.Max(0, Math.Min(colors.Length - 1, adjacent))]);
        }

        private int AdjacentMines(int index) { int count = 0; foreach (int neighbor in Neighbors(index)) if (_mines[neighbor]) count++; return count; }
        private IEnumerable<int> Neighbors(int index) { int row = index / Columns; int column = index % Columns; for (int y = row - 1; y <= row + 1; y++) for (int x = column - 1; x <= column + 1; x++) if (y >= 0 && y < Rows && x >= 0 && x < Columns && (x != column || y != row)) yield return y * Columns + x; }

        private UIElement BuildTitleBar(string iconPath)
        {
            Border bar = new Border { Background = Brushes.Black, BorderBrush = Brush("#263640"), BorderThickness = new Thickness(0, 0, 0, 1) };
            Grid grid = new Grid(); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            StackPanel brand = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(14, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            if (File.Exists(iconPath)) brand.Children.Add(new Image { Source = LoadBitmap(iconPath), Width = 28, Height = 28, Margin = new Thickness(0, 0, 10, 0) });
            brand.Children.Add(new TextBlock { Text = "NEON MINESWEEPER", Foreground = Brush("#F4F8FA"), FontSize = 13, FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center });
            brand.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e) { if (e.ButtonState == MouseButtonState.Pressed) DragMove(); }; grid.Children.Add(brand);
            Button close = new Button { Content = "×", Width = 48, Height = 47, BorderThickness = new Thickness(0), Background = Brushes.Transparent, Foreground = Brush("#EAF0F3"), FontSize = 18, Cursor = Cursors.Hand };
            close.Click += delegate { Close(); }; Grid.SetColumn(close, 1); grid.Children.Add(close); bar.Child = grid; return bar;
        }

        private static TextBlock Counter(string text, string color) { return new TextBlock { Text = text, Foreground = Brush(color), FontFamily = new FontFamily("Consolas"), FontSize = 13, FontWeight = FontWeights.Bold, VerticalAlignment = VerticalAlignment.Center }; }
        private static Brush Brush(string value) { Brush brush = (Brush)new BrushConverter().ConvertFromString(value); if (brush.CanFreeze) brush.Freeze(); return brush; }
        private static BitmapImage LoadBitmap(string path) { BitmapImage image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.UriSource = new Uri(path, UriKind.Absolute); image.EndInit(); if (image.CanFreeze) image.Freeze(); return image; }
    }
}
