using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Management;
using System.Text;
using System.Threading;

[assembly: System.Reflection.AssemblyTitle("WinBridge Recovery Guardian")]
[assembly: System.Reflection.AssemblyDescription("Testing stage. Authorized recipients may test and perform secondary development. https://github.com/zemeng5208")]
[assembly: System.Reflection.AssemblyCompany("https://github.com/zemeng5208")]
[assembly: System.Reflection.AssemblyProduct("WinBridge Recovery")]
[assembly: System.Reflection.AssemblyVersion("3.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("3.1.0.0")]

namespace WinBridgeRecovery
{
    internal static class GuardianProgram
    {
        private sealed class TrackedProcess
        {
            public int Id;
            public long StartTicks;
        }

        private sealed class ProcessInfo
        {
            public int Id;
            public int ParentId;
            public string Name;
        }

        public static int Main(string[] args)
        {
            if (args.Length != 2 || !string.Equals(args[0], "--watch", StringComparison.OrdinalIgnoreCase))
                return 2;

            string sessionPath = args[1];
            string cleanupPath = sessionPath + ".cleanup";
            try
            {
                TrackedProcess launcher = ReadLauncher(sessionPath);
                if (launcher == null) return 3;

                while (IsSameProcessAlive(launcher) && !File.Exists(cleanupPath))
                    Thread.Sleep(250);

                Cleanup(sessionPath);
                TryDelete(cleanupPath);
                TryDelete(sessionPath);
                return 0;
            }
            catch
            {
                return 1;
            }
        }

        private static TrackedProcess ReadLauncher(string path)
        {
            foreach (string line in ReadLines(path))
            {
                string[] parts = line.Split('|');
                if (parts.Length == 3 && string.Equals(parts[0], "launcher", StringComparison.OrdinalIgnoreCase))
                    return ParseTracked(parts);
            }
            return null;
        }

        private static void Cleanup(string sessionPath)
        {
            List<TrackedProcess> roots = new List<TrackedProcess>();
            foreach (string line in ReadLines(sessionPath))
            {
                string[] parts = line.Split('|');
                if (parts.Length == 3 && string.Equals(parts[0], "process", StringComparison.OrdinalIgnoreCase))
                {
                    TrackedProcess tracked = ParseTracked(parts);
                    if (tracked != null && IsSameProcessAlive(tracked)) roots.Add(tracked);
                }
            }
            if (roots.Count == 0) return;

            Dictionary<int, ProcessInfo> processes = SnapshotProcesses();
            HashSet<int> candidates = new HashSet<int>();
            foreach (TrackedProcess root in roots)
                AddDescendants(root.Id, processes, candidates);

            HashSet<int> protectedProcesses = new HashSet<int>();
            foreach (int id in candidates)
            {
                ProcessInfo info;
                if (processes.TryGetValue(id, out info) &&
                    string.Equals(info.Name, "ChatGPT.exe", StringComparison.OrdinalIgnoreCase))
                    AddDescendants(id, processes, protectedProcesses);
            }

            List<int> ordered = new List<int>(candidates);
            ordered.Sort(delegate(int left, int right)
            {
                return GetDepth(right, processes).CompareTo(GetDepth(left, processes));
            });
            foreach (int id in ordered)
            {
                if (!protectedProcesses.Contains(id)) TryKill(id);
            }
        }

        private static Dictionary<int, ProcessInfo> SnapshotProcesses()
        {
            Dictionary<int, ProcessInfo> result = new Dictionary<int, ProcessInfo>();
            using (ManagementObjectSearcher searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, ParentProcessId, Name FROM Win32_Process"))
            using (ManagementObjectCollection collection = searcher.Get())
            {
                foreach (ManagementObject item in collection)
                {
                    int id = Convert.ToInt32(item["ProcessId"], CultureInfo.InvariantCulture);
                    result[id] = new ProcessInfo
                    {
                        Id = id,
                        ParentId = Convert.ToInt32(item["ParentProcessId"], CultureInfo.InvariantCulture),
                        Name = Convert.ToString(item["Name"], CultureInfo.InvariantCulture) ?? string.Empty
                    };
                }
            }
            return result;
        }

        private static void AddDescendants(
            int root,
            Dictionary<int, ProcessInfo> processes,
            HashSet<int> result)
        {
            if (!result.Add(root)) return;
            bool changed;
            do
            {
                changed = false;
                foreach (ProcessInfo info in processes.Values)
                {
                    if (result.Contains(info.ParentId) && result.Add(info.Id)) changed = true;
                }
            }
            while (changed);
        }

        private static int GetDepth(int id, Dictionary<int, ProcessInfo> processes)
        {
            int depth = 0;
            HashSet<int> seen = new HashSet<int>();
            ProcessInfo current;
            while (processes.TryGetValue(id, out current) && seen.Add(id))
            {
                depth++;
                id = current.ParentId;
            }
            return depth;
        }

        private static bool IsSameProcessAlive(TrackedProcess tracked)
        {
            try
            {
                Process process = Process.GetProcessById(tracked.Id);
                return !process.HasExited &&
                    process.StartTime.ToUniversalTime().Ticks == tracked.StartTicks;
            }
            catch
            {
                return false;
            }
        }

        private static TrackedProcess ParseTracked(string[] parts)
        {
            int id;
            long ticks;
            if (!int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out id) ||
                !long.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out ticks))
                return null;
            return new TrackedProcess { Id = id, StartTicks = ticks };
        }

        private static string[] ReadLines(string path)
        {
            for (int attempt = 0; attempt < 8; attempt++)
            {
                try { return File.Exists(path) ? File.ReadAllLines(path, Encoding.UTF8) : new string[0]; }
                catch (IOException) { Thread.Sleep(50); }
            }
            return new string[0];
        }

        private static void TryKill(int id)
        {
            if (id == Process.GetCurrentProcess().Id) return;
            try
            {
                Process process = Process.GetProcessById(id);
                if (string.Equals(process.ProcessName, "ChatGPT", StringComparison.OrdinalIgnoreCase)) return;
                process.Kill();
                process.WaitForExit(2500);
            }
            catch
            {
            }
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); }
            catch { }
        }
    }
}
