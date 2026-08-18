[CmdletBinding()]
param(
  [ValidateSet('Preflight', 'Diagnose', 'PostFailure')]
  [string]$Mode = 'Diagnose',
  [string]$LauncherRoot = $PSScriptRoot,
  [string[]]$TargetPath,
  [int]$RestartManagerFileLimit = 240
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$script:Lines = New-Object 'System.Collections.Generic.List[string]'
$script:DesktopBlockers = New-Object System.Collections.ArrayList
$script:RelatedHelpers = New-Object System.Collections.ArrayList
$script:BrowserProcesses = New-Object System.Collections.ArrayList
$script:LockingProcesses = New-Object System.Collections.ArrayList
$script:SecurityCandidates = New-Object System.Collections.ArrayList

function Add-Line {
  param([string]$Text = '')
  [void]$script:Lines.Add($Text)
}

function Add-Section {
  param([Parameter(Mandatory = $true)][string]$Title)
  Add-Line ''
  Add-Line ('=' * 78)
  Add-Line $Title
  Add-Line ('=' * 78)
}

function Get-SafeFullPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  try { return [System.IO.Path]::GetFullPath($Path) } catch { return $Path }
}

function Get-DefaultTargets {
  $targets = New-Object System.Collections.ArrayList
  if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $cacheRoot = Join-Path $env:USERPROFILE '.codex\plugins\cache\openai-bundled'
    foreach ($name in @('browser', 'chrome', 'computer-use')) {
      [void]$targets.Add((Join-Path $cacheRoot $name))
    }
    [void]$targets.Add((Join-Path $env:USERPROFILE '.codex\plugins\marketplaces'))
  }
  if (-not [string]::IsNullOrWhiteSpace($LauncherRoot)) {
    [void]$targets.Add((Join-Path $LauncherRoot 'R'))
  }
  return @($targets)
}

function Get-ProcessSnapshot {
  $rows = New-Object System.Collections.ArrayList
  try {
    foreach ($proc in @(Get-CimInstance Win32_Process -ErrorAction Stop)) {
      [void]$rows.Add([pscustomobject]@{
          Id = [int]$proc.ProcessId
          ParentId = [int]$proc.ParentProcessId
          Name = [string]$proc.Name
          Path = [string]$proc.ExecutablePath
          CommandLine = [string]$proc.CommandLine
        })
    }
  } catch {
    Add-Line ('[WARN] Win32_Process query failed: {0}' -f $_.Exception.Message)
    foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {
      $path = $null
      try { $path = [string]$proc.Path } catch { }
      [void]$rows.Add([pscustomobject]@{
          Id = [int]$proc.Id
          ParentId = -1
          Name = ([string]$proc.ProcessName + '.exe')
          Path = $path
          CommandLine = $null
        })
    }
  }
  return @($rows)
}

function Get-ProcessCategory {
  param([Parameter(Mandatory = $true)][object]$Process)
  $name = ([string]$Process.Name).ToLowerInvariant()
  $path = ([string]$Process.Path).ToLowerInvariant()
  $command = ([string]$Process.CommandLine).ToLowerInvariant()

  if ($name -in @('chatgpt.exe', 'codex.exe')) { return 'Desktop' }
  if ($name -in @('extension-host.exe', 'node_repl.exe', 'codex-computer-use.exe')) { return 'Helper' }
  if ($name -in @('chrome.exe', 'msedge.exe')) { return 'Browser' }
  if ($name -eq 'node.exe') {
    if ($command -match '\\.codex\\plugins|openai\.codex|cua_node|@oai\\sky|node_repl|extension-host' -or
        $path -match 'openai\.codex|cua_node|\\\.codex\\plugins') {
      return 'Helper'
    }
  }
  return $null
}

function Write-ProcessInventory {
  param([Parameter(Mandatory = $true)][object[]]$Processes)
  Add-Section 'PROCESS INVENTORY / 进程现场'
  $interesting = New-Object System.Collections.ArrayList
  foreach ($proc in $Processes) {
    $category = Get-ProcessCategory $proc
    if ($category) {
      $row = [pscustomobject]@{
        Category = $category
        Id = $proc.Id
        ParentId = $proc.ParentId
        Name = $proc.Name
        Path = $proc.Path
        CommandLine = $proc.CommandLine
      }
      [void]$interesting.Add($row)
      switch ($category) {
        'Desktop' { [void]$script:DesktopBlockers.Add($row) }
        'Helper' { [void]$script:RelatedHelpers.Add($row) }
        'Browser' { [void]$script:BrowserProcesses.Add($row) }
      }
    }
  }

  if ($interesting.Count -eq 0) {
    Add-Line '[OK] No ChatGPT/Codex Desktop, known plugin helper, Chrome, or Edge process was detected.'
    return
  }

  foreach ($row in @($interesting | Sort-Object Category, Name, Id)) {
    Add-Line ('[{0}] PID={1} PPID={2} Name={3}' -f $row.Category, $row.Id, $row.ParentId, $row.Name)
    if (-not [string]::IsNullOrWhiteSpace([string]$row.Path)) {
      Add-Line ('  Path: {0}' -f $row.Path)
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$row.CommandLine)) {
      Add-Line ('  CommandLine: {0}' -f $row.CommandLine)
    }
  }

  if ($script:DesktopBlockers.Count -gt 0) {
    Add-Line '[ACTION] ChatGPT/Codex Desktop is still running. Repair mode must not run at the same time.'
  }
  if ($script:RelatedHelpers.Count -gt 0) {
    Add-Line '[WARN] One or more known Codex/plugin helper processes remain. They may be active or orphaned.'
  }
  if ($script:BrowserProcesses.Count -gt 0) {
    Add-Line '[INFO] Chrome/Edge is running. The core launcher has its own browser-close safety step before cache reconciliation.'
  }
}

function Write-TargetState {
  param([Parameter(Mandatory = $true)][string[]]$Targets)
  Add-Section 'TARGET STATE / 目标目录状态'
  foreach ($target in $Targets) {
    $full = Get-SafeFullPath $target
    Add-Line ('Target: {0}' -f $full)
    if (-not (Test-Path -LiteralPath $target)) {
      Add-Line '  Exists: no'
      continue
    }

    try {
      $item = Get-Item -LiteralPath $target -Force -ErrorAction Stop
      Add-Line '  Exists: yes'
      Add-Line ('  Attributes: {0}' -f $item.Attributes)
      Add-Line ('  LastWriteTimeUtc: {0:o}' -f $item.LastWriteTimeUtc)
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Add-Line '  ReparsePoint: yes'
        $fsutil = Join-Path $env:SystemRoot 'System32\fsutil.exe'
        if (Test-Path -LiteralPath $fsutil -PathType Leaf) {
          try {
            foreach ($line in @(& $fsutil reparsepoint query $target 2>&1)) {
              Add-Line ('    fsutil: {0}' -f $line)
            }
          } catch {
            Add-Line ('    fsutil query failed: {0}' -f $_.Exception.Message)
          }
        }
      } else {
        Add-Line '  ReparsePoint: no'
      }
    } catch {
      Add-Line ('  [WARN] Get-Item failed: {0}' -f $_.Exception.Message)
    }

    try {
      $acl = Get-Acl -LiteralPath $target -ErrorAction Stop
      Add-Line ('  Owner: {0}' -f $acl.Owner)
      Add-Line ('  AccessRulesProtected: {0}' -f $acl.AreAccessRulesProtected)
      Add-Line ('  SDDL: {0}' -f $acl.Sddl)
    } catch {
      Add-Line ('  [WARN] Get-Acl failed: {0}' -f $_.Exception.Message)
    }

    $icacls = Join-Path $env:SystemRoot 'System32\icacls.exe'
    if (Test-Path -LiteralPath $icacls -PathType Leaf) {
      try {
        foreach ($line in @(& $icacls $target 2>&1)) {
          Add-Line ('  icacls: {0}' -f $line)
        }
      } catch {
        Add-Line ('  [WARN] icacls failed: {0}' -f $_.Exception.Message)
      }
    }
  }
}

function Ensure-RestartManagerType {
  if ('WinBridgeV4.RestartManager' -as [type]) { return }
  $source = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using FILETIME = System.Runtime.InteropServices.ComTypes.FILETIME;

namespace WinBridgeV4 {
    public enum RM_APP_TYPE {
        RmUnknownApp = 0,
        RmMainWindow = 1,
        RmOtherWindow = 2,
        RmService = 3,
        RmExplorer = 4,
        RmConsole = 5,
        RmCritical = 1000
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RM_UNIQUE_PROCESS {
        public int dwProcessId;
        public FILETIME ProcessStartTime;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct RM_PROCESS_INFO {
        public RM_UNIQUE_PROCESS Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string strAppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string strServiceShortName;
        public RM_APP_TYPE ApplicationType;
        public uint AppStatus;
        public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)]
        public bool bRestartable;
    }

    public static class RestartManager {
        const int ERROR_SUCCESS = 0;
        const int ERROR_MORE_DATA = 234;
        const int CCH_RM_SESSION_KEY = 32;

        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags,
            [MarshalAs(UnmanagedType.LPWStr)] string strSessionKey);

        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        static extern int RmRegisterResources(uint pSessionHandle,
            uint nFiles, string[] rgsFilenames,
            uint nApplications, [In] RM_UNIQUE_PROCESS[] rgApplications,
            uint nServices, string[] rgsServiceNames);

        [DllImport("rstrtmgr.dll")]
        static extern int RmGetList(uint dwSessionHandle,
            out uint pnProcInfoNeeded, ref uint pnProcInfo,
            [In, Out] RM_PROCESS_INFO[] rgAffectedApps,
            ref uint lpdwRebootReasons);

        [DllImport("rstrtmgr.dll")]
        static extern int RmEndSession(uint pSessionHandle);

        public static RM_PROCESS_INFO[] GetLockingProcesses(string[] resources) {
            if (resources == null || resources.Length == 0) {
                return new RM_PROCESS_INFO[0];
            }
            uint handle;
            string key = Guid.NewGuid().ToString("N").Substring(0, CCH_RM_SESSION_KEY);
            int result = RmStartSession(out handle, 0, key);
            if (result != ERROR_SUCCESS) {
                throw new Win32Exception(result, "RmStartSession failed");
            }
            try {
                result = RmRegisterResources(handle, (uint)resources.Length, resources, 0, null, 0, null);
                if (result != ERROR_SUCCESS) {
                    throw new Win32Exception(result, "RmRegisterResources failed");
                }
                uint needed = 0;
                uint count = 0;
                uint reasons = 0;
                result = RmGetList(handle, out needed, ref count, null, ref reasons);
                if (result == ERROR_SUCCESS) {
                    return new RM_PROCESS_INFO[0];
                }
                if (result != ERROR_MORE_DATA) {
                    throw new Win32Exception(result, "RmGetList sizing call failed");
                }
                var apps = new RM_PROCESS_INFO[needed];
                count = needed;
                result = RmGetList(handle, out needed, ref count, apps, ref reasons);
                if (result != ERROR_SUCCESS) {
                    throw new Win32Exception(result, "RmGetList failed");
                }
                if (count == apps.Length) {
                    return apps;
                }
                var trimmed = new RM_PROCESS_INFO[count];
                Array.Copy(apps, trimmed, count);
                return trimmed;
            }
            finally {
                RmEndSession(handle);
            }
        }
    }
}
'@
  Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
}

function Get-RestartManagerResources {
  param(
    [Parameter(Mandatory = $true)][string[]]$Targets,
    [Parameter(Mandatory = $true)][int]$Limit
  )
  $resources = New-Object System.Collections.ArrayList
  foreach ($target in $Targets) {
    if ($resources.Count -ge $Limit) { break }
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      [void]$resources.Add((Get-SafeFullPath $target))
      continue
    }
    if (-not (Test-Path -LiteralPath $target -PathType Container)) { continue }
    try {
      foreach ($file in @(Get-ChildItem -LiteralPath $target -File -Recurse -Force -ErrorAction SilentlyContinue)) {
        if ($resources.Count -ge $Limit) { break }
        [void]$resources.Add([string]$file.FullName)
      }
    } catch {
      Add-Line ('[WARN] File enumeration failed for Restart Manager under {0}: {1}' -f $target, $_.Exception.Message)
    }
  }
  return @($resources)
}

function Write-RestartManagerState {
  param(
    [Parameter(Mandatory = $true)][string[]]$Targets,
    [Parameter(Mandatory = $true)][object[]]$Processes
  )
  Add-Section 'RESTART MANAGER LOCK QUERY / 文件占用查询'
  if ($RestartManagerFileLimit -lt 1) {
    Add-Line '[INFO] Restart Manager query disabled by file limit.'
    return
  }

  $resources = @(Get-RestartManagerResources -Targets $Targets -Limit $RestartManagerFileLimit)
  Add-Line ('Resources sampled: {0} (limit {1})' -f $resources.Count, $RestartManagerFileLimit)
  if ($resources.Count -eq 0) {
    Add-Line '[INFO] No existing files were available to register with Restart Manager.'
    Add-Line '[NOTE] This does not prove that no directory handle or file-system filter can block a rename.'
    return
  }

  try {
    Ensure-RestartManagerType
    $locks = @([WinBridgeV4.RestartManager]::GetLockingProcesses([string[]]$resources))
    if ($locks.Count -eq 0) {
      Add-Line '[OK] Restart Manager did not report a locking application for the sampled files.'
      Add-Line '[NOTE] No-result does not rule out directory handles, very short-lived locks, or filter-driver enforcement.'
      return
    }

    $byPid = @{}
    foreach ($proc in $Processes) { $byPid[[int]$proc.Id] = $proc }
    foreach ($lock in $locks) {
      $pidValue = [int]$lock.Process.dwProcessId
      $details = $null
      if ($byPid.ContainsKey($pidValue)) { $details = $byPid[$pidValue] }
      $row = [pscustomobject]@{
        Id = $pidValue
        AppName = [string]$lock.strAppName
        Service = [string]$lock.strServiceShortName
        Type = [string]$lock.ApplicationType
        Restartable = [bool]$lock.bRestartable
        Path = if ($details) { [string]$details.Path } else { $null }
        CommandLine = if ($details) { [string]$details.CommandLine } else { $null }
      }
      [void]$script:LockingProcesses.Add($row)
      Add-Line ('[LOCK] PID={0} App={1} Service={2} Type={3} Restartable={4}' -f $row.Id, $row.AppName, $row.Service, $row.Type, $row.Restartable)
      if ($row.Path) { Add-Line ('  Path: {0}' -f $row.Path) }
      if ($row.CommandLine) { Add-Line ('  CommandLine: {0}' -f $row.CommandLine) }
    }
  } catch {
    Add-Line ('[WARN] Restart Manager query failed: {0}' -f $_.Exception.Message)
    Add-Line '[NOTE] The diagnostic remains read-only; use Sysinternals Handle/Process Explorer manually if deeper handle inspection is required.'
  }
}

function Write-SecurityEnvironment {
  Add-Section 'SECURITY / ENCRYPTION / FILTER ENVIRONMENT'
  $pattern = '(?i)(defender|antivirus|endpoint|edr|dlp|encrypt|encryption|security|crowdstrike|sentinel|cylance|carbon.?black|mcafee|trellix|symantec|sophos|zscaler|fortinet|ivanti|trend.?micro|火绒|360|天擎|奇安信|深信服|安恒|亚信|联软|ip-guard|亿赛通|加密|终端安全|数据防泄漏)'

  try {
    $products = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntivirusProduct -ErrorAction Stop)
    if ($products.Count -gt 0) {
      Add-Line 'Windows SecurityCenter antivirus products:'
      foreach ($product in $products) {
        Add-Line ('  - {0}' -f $product.displayName)
      }
    }
  } catch {
    Add-Line ('[INFO] SecurityCenter product query unavailable: {0}' -f $_.Exception.Message)
  }

  try {
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object {
        ([string]$_.Name -match $pattern) -or
        ([string]$_.DisplayName -match $pattern) -or
        ([string]$_.PathName -match $pattern)
      })
    if ($services.Count -eq 0) {
      Add-Line '[INFO] No security/encryption/DLP service candidate matched the conservative name/path scan.'
    } else {
      Add-Line '[WARN] Candidate security/encryption/DLP services were found. This is context, not proof that any product caused the lock.'
      foreach ($service in @($services | Sort-Object DisplayName, Name)) {
        $row = [pscustomobject]@{
          Name = [string]$service.Name
          DisplayName = [string]$service.DisplayName
          State = [string]$service.State
          StartMode = [string]$service.StartMode
          PathName = [string]$service.PathName
        }
        [void]$script:SecurityCandidates.Add($row)
        Add-Line ('  - {0} [{1}] State={2} StartMode={3}' -f $row.DisplayName, $row.Name, $row.State, $row.StartMode)
        if ($row.PathName) { Add-Line ('    Path: {0}' -f $row.PathName) }
      }
    }
  } catch {
    Add-Line ('[WARN] Win32_Service query failed: {0}' -f $_.Exception.Message)
  }

  $fltmc = Join-Path $env:SystemRoot 'System32\fltmc.exe'
  if (Test-Path -LiteralPath $fltmc -PathType Leaf) {
    Add-Line ''
    Add-Line 'File-system minifilters (fltmc filters):'
    try {
      foreach ($line in @(& $fltmc filters 2>&1)) {
        Add-Line ('  {0}' -f $line)
      }
    } catch {
      Add-Line ('  [INFO] fltmc unavailable without sufficient rights or failed: {0}' -f $_.Exception.Message)
    }
  }

  $manageBde = Join-Path $env:SystemRoot 'System32\manage-bde.exe'
  if (Test-Path -LiteralPath $manageBde -PathType Leaf) {
    Add-Line ''
    Add-Line 'BitLocker status (read-only context):'
    try {
      foreach ($line in @(& $manageBde -status 2>&1)) {
        Add-Line ('  {0}' -f $line)
      }
    } catch {
      Add-Line ('  [INFO] manage-bde status query failed: {0}' -f $_.Exception.Message)
    }
  }
}

function Write-EnvironmentSummary {
  Add-Section 'SUMMARY / 结论'
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  if ($os) {
    Add-Line ('OS: {0} | Version={1} | Build={2} | Architecture={3}' -f $os.Caption, $os.Version, $os.BuildNumber, $os.OSArchitecture)
  }
  Add-Line ('Mode: {0}' -f $Mode)
  Add-Line ('Desktop blockers: {0}' -f $script:DesktopBlockers.Count)
  Add-Line ('Known/related helper processes: {0}' -f $script:RelatedHelpers.Count)
  Add-Line ('Restart Manager locking processes: {0}' -f $script:LockingProcesses.Count)
  Add-Line ('Security/encryption/DLP service candidates: {0}' -f $script:SecurityCandidates.Count)

  if ($script:DesktopBlockers.Count -gt 0) {
    Add-Line '[BLOCK] Close ChatGPT/Codex Desktop completely before running RepairAndLaunch. Do not run both at the same time.'
  }
  if ($script:LockingProcesses.Count -gt 0) {
    Add-Line '[BLOCK] A sampled file is reported as in use. Close the owning application or ask the administrator to release the file before repair.'
  }
  if ($script:SecurityCandidates.Count -gt 0) {
    Add-Line '[WARN] Enterprise/security software may be relevant, but the scan cannot prove causation. If policy or a filter driver blocks the directory, contact the company IT/security administrator.'
  }
  if ($script:DesktopBlockers.Count -eq 0 -and $script:LockingProcesses.Count -eq 0) {
    Add-Line '[OK] No immediate concurrent Desktop process or sampled-file lock was proven by this preflight.'
  }

  Add-Line ''
  Add-Line 'Safety boundary:'
  Add-Line '- This script does not stop processes, disable/uninstall/bypass EDR/DLP/encryption, or change company policy.'
  Add-Line '- It does not take ownership, reset ACLs, delete/rename repair targets, modify WindowsApps permissions, or kill every node.exe.'
  Add-Line '- Restart Manager can miss directory handles, transient locks, and filter-driver enforcement; a clean result is not absolute proof.'
  Add-Line '- The report can contain usernames, local paths, service names, and command lines. Redact it before posting publicly.'
}

try {
  if ([string]::IsNullOrWhiteSpace($LauncherRoot)) { $LauncherRoot = $PSScriptRoot }
  $LauncherRoot = Get-SafeFullPath $LauncherRoot
  $logsRoot = Join-Path $LauncherRoot 'Logs'
  if (-not (Test-Path -LiteralPath $logsRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $logsRoot -Force | Out-Null
  }
  $reportPath = Join-Path $logsRoot ('access-guard-{0}-{1}.txt' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $Mode.ToLowerInvariant())

  $targets = if ($TargetPath -and $TargetPath.Count -gt 0) { @($TargetPath) } else { @(Get-DefaultTargets) }
  $targets = @($targets | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)

  Add-Line 'WinBridge Recovery 4.0 Access Guard'
  Add-Line ('Generated: {0:o}' -f [DateTime]::Now)
  Add-Line ('LauncherRoot: {0}' -f $LauncherRoot)
  Add-Line ('PowerShell: {0}' -f $PSVersionTable.PSVersion)
  Add-Line ('Targets: {0}' -f ($targets -join '; '))

  $processes = @(Get-ProcessSnapshot)
  Write-ProcessInventory -Processes $processes
  Write-TargetState -Targets $targets
  Write-RestartManagerState -Targets $targets -Processes $processes
  Write-SecurityEnvironment
  Write-EnvironmentSummary

  [System.IO.File]::WriteAllText($reportPath, ($script:Lines -join [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($true)))
  Write-Output ('[INFO] WinBridge 4.0 Access Guard report: {0}' -f $reportPath)

  if ($Mode -eq 'Preflight') {
    if ($script:DesktopBlockers.Count -gt 0) {
      Write-Output '[ERROR] Access Guard blocked repair because ChatGPT/Codex Desktop is still running.'
      exit 20
    }
    if ($script:LockingProcesses.Count -gt 0) {
      Write-Output '[ERROR] Access Guard blocked repair because Restart Manager reported a locking process.'
      exit 21
    }
  }

  if ($script:SecurityCandidates.Count -gt 0) {
    Write-Output '[WARN] Access Guard found security/encryption/DLP candidates. They are reported for diagnosis only and are not bypassed.'
  }
  exit 0
} catch {
  try {
    Write-Output ('[WARN] WinBridge 4.0 Access Guard could not complete: {0}' -f $_.Exception.Message)
  } catch { }
  if ($Mode -eq 'Preflight') { exit 22 }
  exit 0
}
