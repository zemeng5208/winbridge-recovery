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
        using (GraphicsPath coolLink = Capsule(new RectangleF(222, 370, 580, 284), 42f))
        using (GraphicsPath warmLink = Capsule(new RectangleF(222, 370, 580, 284), -42f))
        {
            Configure(g);
            g.Clear(Color.Transparent);

            using (Pen coolGlow = new Pen(Color.FromArgb(74, 42, 210, 255), 104f))
            using (Pen warmGlow = new Pen(Color.FromArgb(70, 255, 64, 196), 104f))
            using (Pen coolEdge = new Pen(Color.FromArgb(190, 7, 16, 36), 78f))
            using (Pen warmEdge = new Pen(Color.FromArgb(190, 7, 16, 36), 78f))
            using (LinearGradientBrush coolBrush = new LinearGradientBrush(
                new PointF(240, 760), new PointF(790, 260),
                Color.FromArgb(255, 47, 226, 255), Color.FromArgb(255, 75, 111, 255)))
            using (LinearGradientBrush warmBrush = new LinearGradientBrush(
                new PointF(250, 250), new PointF(790, 780),
                Color.FromArgb(255, 142, 91, 255), Color.FromArgb(255, 255, 68, 173)))
            using (Pen cool = new Pen(coolBrush, 56f))
            using (Pen warm = new Pen(warmBrush, 56f))
            {
                Prepare(coolGlow); Prepare(warmGlow);
                Prepare(coolEdge); Prepare(warmEdge);
                Prepare(cool); Prepare(warm);

                g.DrawPath(coolGlow, coolLink);
                g.DrawPath(warmGlow, warmLink);
                g.DrawPath(coolEdge, coolLink);
                g.DrawPath(cool, coolLink);
                g.DrawPath(warmEdge, warmLink);
                g.DrawPath(warm, warmLink);

                // At the opposite crossing, restore the cool link above the warm link.
                GraphicsState state = g.Save();
                using (GraphicsPath crossing = new GraphicsPath())
                {
                    crossing.AddEllipse(new RectangleF(315, 285, 265, 265));
                    g.SetClip(crossing, CombineMode.Intersect);
                    g.DrawPath(coolEdge, coolLink);
                    g.DrawPath(cool, coolLink);
                }
                g.Restore(state);
            }
        }
        return image;
    }

    private static GraphicsPath Capsule(RectangleF bounds, float angle)
    {
        GraphicsPath path = RoundedRect(bounds, bounds.Height / 2f);
        using (Matrix transform = new Matrix())
        {
            transform.RotateAt(angle, new PointF(
                bounds.Left + bounds.Width / 2f,
                bounds.Top + bounds.Height / 2f));
            path.Transform(transform);
        }
        return path;
    }

    private static GraphicsPath RoundedRect(RectangleF bounds, float radius)
    {
        float diameter = radius * 2f;
        GraphicsPath path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void Prepare(Pen pen)
    {
        pen.StartCap = LineCap.Round;
        pen.EndCap = LineCap.Round;
        pen.LineJoin = LineJoin.Round;
    }

    private static void WriteIcon(Bitmap master, string path)
    {
        int[] sizes = { 16, 20, 24, 32, 40, 48, 64, 128, 256 };
        List<byte[]> frames = new List<byte[]>();
        foreach (int size in sizes)
        {
            using (Bitmap frame = new Bitmap(size, size, PixelFormat.Format32bppArgb))
            using (Graphics g = Graphics.FromImage(frame))
            {
                Configure(g);
                g.Clear(Color.Transparent);
                g.DrawImage(master, new Rectangle(0, 0, size, size));
                frames.Add(CreateDibFrame(frame));
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
                writer.Write((byte)0); writer.Write((byte)0);
                writer.Write((ushort)1); writer.Write((ushort)32);
                writer.Write((uint)frames[i].Length);
                writer.Write((uint)offset);
                offset += frames[i].Length;
            }
            foreach (byte[] frame in frames) writer.Write(frame);
        }
    }

    private static byte[] CreateDibFrame(Bitmap frame)
    {
        int width = frame.Width;
        int height = frame.Height;
        int colorBytes = width * height * 4;
        int maskStride = ((width + 31) / 32) * 4;
        byte[] mask = new byte[maskStride * height];
        using (MemoryStream stream = new MemoryStream(40 + colorBytes + mask.Length))
        using (BinaryWriter writer = new BinaryWriter(stream))
        {
            writer.Write((uint)40); writer.Write(width); writer.Write(height * 2);
            writer.Write((ushort)1); writer.Write((ushort)32); writer.Write((uint)0);
            writer.Write((uint)colorBytes); writer.Write(0); writer.Write(0);
            writer.Write((uint)0); writer.Write((uint)0);
            for (int y = height - 1; y >= 0; y--)
            {
                int maskRow = (height - 1 - y) * maskStride;
                for (int x = 0; x < width; x++)
                {
                    Color pixel = frame.GetPixel(x, y);
                    writer.Write(pixel.B); writer.Write(pixel.G);
                    writer.Write(pixel.R); writer.Write(pixel.A);
                    if (pixel.A < 8)
                        mask[maskRow + (x / 8)] |= (byte)(0x80 >> (x % 8));
                }
            }
            writer.Write(mask);
            writer.Flush();
            return stream.ToArray();
        }
    }

    private static void Configure(Graphics g)
    {
        g.CompositingMode = CompositingMode.SourceOver;
        g.CompositingQuality = CompositingQuality.HighQuality;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.SmoothingMode = SmoothingMode.HighQuality;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies 'System.Drawing'
[WinBridgeIconBuilder]::Build($png, $ico)

Write-Host "Built PNG: $png"
Write-Host "Built ICO: $ico"
