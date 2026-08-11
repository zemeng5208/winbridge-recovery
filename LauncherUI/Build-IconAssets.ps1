[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$assets = Join-Path $PSScriptRoot 'Assets'
$png = Join-Path $assets 'WinBridge.png'
$ico = Join-Path $assets 'WinBridge.ico'

$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class WinBridgeIconBuilder
{
    public static void Build(string pngPath, string icoPath)
    {
        using (Bitmap master = DrawMaster())
        {
            master.Save(pngPath, ImageFormat.Png);
            WriteIcon(master, icoPath);
        }
    }

    private static Bitmap DrawMaster()
    {
        Bitmap image = new Bitmap(1024, 1024, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(image))
        {
            Configure(g);
            g.Clear(Color.Transparent);
            RectangleF tile = new RectangleF(92, 92, 840, 840);
            using (GraphicsPath tilePath = RoundedRect(tile, 190))
            using (LinearGradientBrush tileBrush = new LinearGradientBrush(
                tile, Color.FromArgb(255, 11, 25, 48), Color.FromArgb(255, 27, 75, 111), 55f))
            using (Pen rim = new Pen(Color.FromArgb(230, 109, 228, 255), 22f))
            {
                g.FillPath(tileBrush, tilePath);
                g.DrawPath(rim, tilePath);
            }

            using (Pen glow = new Pen(Color.FromArgb(85, 78, 222, 255), 72f))
            using (Pen bridge = new Pen(Color.FromArgb(255, 117, 235, 255), 38f))
            using (Pen deck = new Pen(Color.White, 34f))
            {
                glow.StartCap = glow.EndCap = LineCap.Round;
                bridge.StartCap = bridge.EndCap = LineCap.Round;
                deck.StartCap = deck.EndCap = LineCap.Round;
                RectangleF arch = new RectangleF(252, 324, 520, 390);
                g.DrawArc(glow, arch, 200, 140);
                g.DrawArc(bridge, arch, 200, 140);
                g.DrawLine(deck, 250, 666, 774, 666);
                g.DrawLine(deck, 307, 452, 307, 706);
                g.DrawLine(deck, 717, 452, 717, 706);
            }

            PointF[] shield =
            {
                new PointF(512, 388), new PointF(628, 433),
                new PointF(610, 600), new PointF(512, 690),
                new PointF(414, 600), new PointF(396, 433)
            };
            using (SolidBrush shieldBrush = new SolidBrush(Color.FromArgb(255, 245, 252, 255)))
            using (Pen shieldRim = new Pen(Color.FromArgb(255, 71, 190, 255), 18f))
            using (Pen check = new Pen(Color.FromArgb(255, 21, 111, 160), 30f))
            {
                check.StartCap = check.EndCap = LineCap.Round;
                g.FillPolygon(shieldBrush, shield);
                g.DrawPolygon(shieldRim, shield);
                g.DrawLines(check, new[] {
                    new PointF(454, 536), new PointF(495, 579), new PointF(575, 493)
                });
            }
        }
        return image;
    }

    private static GraphicsPath RoundedRect(RectangleF bounds, float radius)
    {
        float diameter = radius * 2;
        GraphicsPath path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void WriteIcon(Bitmap master, string path)
    {
        int[] sizes = { 16, 20, 24, 32, 40, 48, 64, 128, 256 };
        List<byte[]> frames = new List<byte[]>();
        foreach (int size in sizes)
        {
            using (Bitmap frame = new Bitmap(size, size, PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(frame))
            using (MemoryStream stream = new MemoryStream())
            {
                Configure(g);
                g.Clear(Color.Transparent);
                g.DrawImage(master, new Rectangle(0, 0, size, size));
                frame.Save(stream, ImageFormat.Png);
                frames.Add(stream.ToArray());
            }
        }
        using (FileStream file = File.Create(path))
        using (BinaryWriter writer = new BinaryWriter(file))
        {
            writer.Write((ushort)0);
            writer.Write((ushort)1);
            writer.Write((ushort)sizes.Length);
            int offset = 6 + sizes.Length * 16;
            for (int i = 0; i < sizes.Length; i++)
            {
                writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i]));
                writer.Write((byte)(sizes[i] == 256 ? 0 : sizes[i]));
                writer.Write((byte)0);
                writer.Write((byte)0);
                writer.Write((ushort)1);
                writer.Write((ushort)32);
                writer.Write((uint)frames[i].Length);
                writer.Write((uint)offset);
                offset += frames[i].Length;
            }
            foreach (byte[] frame in frames) writer.Write(frame);
        }
    }

    private static void Configure(Graphics g)
    {
        g.CompositingQuality = CompositingQuality.HighQuality;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies 'System.Drawing'
[WinBridgeIconBuilder]::Build($png, $ico)

Write-Host "Built PNG: $png"
Write-Host "Built ICO: $ico"
