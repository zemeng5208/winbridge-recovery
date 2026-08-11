using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace WinBridgeRecovery
{
    internal static class WinBridgeUpdateBootstrapper
    {
        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                int pid = 0;
                string installer = string.Empty;
                for (int i = 0; i + 1 < args.Length; i++)
                {
                    if (args[i] == "--wait-pid") int.TryParse(args[++i], out pid);
                    else if (args[i] == "--installer") installer = args[++i];
                }
                if (pid > 0)
                {
                    try { Process.GetProcessById(pid).WaitForExit(30000); }
                    catch { }
                }
                if (!File.Exists(installer)) return 2;
                Thread.Sleep(500);
                Process.Start(new ProcessStartInfo(installer, "--update") { UseShellExecute = true });
                return 0;
            }
            catch { return 1; }
        }
    }
}
