[CmdletBinding()]
param(
    [string]$Target = (Join-Path $env:USERPROFILE '.codex\plugins\cache\openai-bundled\chrome'),
    [string]$OutputPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Continue'

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot ('Issue10-Diagnosis-{0}.txt' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}

function Write-Line {
    param([AllowEmptyString()][string]$Text = '')
    $Text | Out-File -LiteralPath $OutputPath -Append -Encoding UTF8
}

function Write-Section {
    param([Parameter(Mandatory=$true)][string]$Name)
    Write-Line ''
    Write-Line ('==================== {0} ====================' -f $Name)
}

function Invoke-Captured {
    param([Parameter(Mandatory=$true)][scriptblock]$Script)
    try {
        (& $Script 2>&1 | Out-String).TrimEnd() | Out-File -LiteralPath $OutputPath -Append -Encoding UTF8
    } catch {
        Write-Line ('FAILED: {0}: {1}' -f $_.Exception.GetType().FullName, $_.Exception.Message)
    }
}

[System.IO.File]::WriteAllText($OutputPath, '', (New-Object System.Text.UTF8Encoding($true)))

Write-Line 'WinBridge Issue #10 read-only lock diagnostic'
Write-Line ('Generated: {0}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
Write-Line ('Computer: {0}' -f $env:COMPUTERNAME)
Write-Line ('User: {0}' -f $env:USERNAME)
Write-Line ('PowerShell: {0}' -f $PSVersionTable.PSVersion)
Write-Line ('Target: {0}' -f $Target)
Write-Line 'This script does NOT take ownership, reset ACLs, delete/rename files, stop processes, disable security software, or change company policy.'

Write-Section 'TARGET EXISTENCE / BASIC METADATA'
try {
    if (Test-Path -LiteralPath $Target) {
        $item = Get-Item -LiteralPath $Target -Force
        Write-Line ('Exists: True')
        Write-Line ('FullName: {0}' -f $item.FullName)
        Write-Line ('Attributes: {0}' -f $item.Attributes)
        Write-Line ('CreationTime: {0:o}' -f $item.CreationTime)
        Write-Line ('LastWriteTime: {0:o}' -f $item.LastWriteTime)
        Write-Line ('Parent: {0}' -f $item.Parent.FullName)
        try {
            $children = @(Get-ChildItem -LiteralPath $Target -Force -ErrorAction Stop)
            Write-Line ('Immediate child count: {0}' -f $children.Count)
            foreach ($child in $children | Select-Object -First 50) {
                Write-Line ('  {0} | {1} | {2}' -f $child.Name, $child.Attributes, $child.FullName)
            }
        } catch {
            Write-Line ('Enumeration failed: {0}' -f $_.Exception.Message)
        }
    } else {
        Write-Line 'Exists: False'
    }
} catch {
    Write-Line ('Target metadata failed: {0}: {1}' -f $_.Exception.GetType().FullName, $_.Exception.Message)
}

Write-Section 'ACL / OWNER / SDDL'
foreach ($path in @($Target, (Split-Path -Parent $Target))) {
    Write-Line ('--- {0} ---' -f $path)
    try {
        $acl = Get-Acl -LiteralPath $path -ErrorAction Stop
        Write-Line ('Owner: {0}' -f $acl.Owner)
        Write-Line ('AreAccessRulesProtected: {0}' -f $acl.AreAccessRulesProtected)
        Write-Line ('SDDL: {0}' -f $acl.Sddl)
        foreach ($rule in $acl.Access) {
            Write-Line ('ACL: {0} | {1} | {2} | Inherited={3} | Propagation={4}' -f $rule.IdentityReference, $rule.AccessControlType, $rule.FileSystemRights, $rule.IsInherited, $rule.PropagationFlags)
        }
    } catch {
        Write-Line ('Get-Acl failed: {0}' -f $_.Exception.Message)
    }
    try {
        Write-Line 'icacls:'
        (& icacls.exe $path 2>&1 | Out-String).TrimEnd() | Out-File -LiteralPath $OutputPath -Append -Encoding UTF8
    } catch {
        Write-Line ('icacls failed: {0}' -f $_.Exception.Message)
    }
}

Write-Section 'REPARSE / JUNCTION STATE'
foreach ($path in @($Target, (Split-Path -Parent $Target))) {
    try {
        $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
        Write-Line ('{0} | Attributes={1}' -f $path, $item.Attributes)
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            try {
                Write-Line ('  LinkType: {0}' -f $item.LinkType)
                Write-Line ('  Target: {0}' -f (($item.Target | Out-String).Trim()))
            } catch {
                Write-Line ('  Reparse metadata unavailable: {0}' -f $_.Exception.Message)
            }
        }
    } catch {
        Write-Line ('{0} | FAILED: {1}' -f $path, $_.Exception.Message)
    }
}

Write-Section 'RELATED RUNNING PROCESSES'
try {
    $pattern = '(?i)(codex|chatgpt|openai|extension-host|computer-use|node_repl|node\.exe|chrome\.exe|msedge\.exe|browser)'
    $procs = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        ($_.Name -match $pattern) -or ($_.ExecutablePath -match $pattern) -or ($_.CommandLine -match $pattern)
    })
    if ($procs.Count -eq 0) {
        Write-Line 'No obvious related processes found.'
    } else {
        foreach ($p in $procs | Sort-Object ProcessId) {
            Write-Line ('PID={0} PPID={1} Name={2}' -f $p.ProcessId, $p.ParentProcessId, $p.Name)
            Write-Line ('  ExecutablePath={0}' -f $p.ExecutablePath)
            Write-Line ('  CommandLine={0}' -f $p.CommandLine)
        }
    }
} catch {
    Write-Line ('Process inventory failed: {0}' -f $_.Exception.Message)
}

Write-Section 'RESTART MANAGER LOCK QUERY'
try {
    if (-not ('RestartManagerNative' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using FILETIME = System.Runtime.InteropServices.ComTypes.FILETIME;

[StructLayout(LayoutKind.Sequential)]
public struct RM_UNIQUE_PROCESS
{
    public int dwProcessId;
    public FILETIME ProcessStartTime;
}

public enum RM_APP_TYPE
{
    RmUnknownApp = 0,
    RmMainWindow = 1,
    RmOtherWindow = 2,
    RmService = 3,
    RmExplorer = 4,
    RmConsole = 5,
    RmCritical = 1000
}

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct RM_PROCESS_INFO
{
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

public static class RestartManagerNative
{
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, StringBuilder strSessionKey);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    public static extern int RmRegisterResources(
        uint dwSessionHandle,
        uint nFiles,
        string[] rgsFilenames,
        uint nApplications,
        RM_UNIQUE_PROCESS[] rgApplications,
        uint nServices,
        string[] rgsServiceNames);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmGetList(
        uint dwSessionHandle,
        out uint pnProcInfoNeeded,
        ref uint pnProcInfo,
        [In, Out] RM_PROCESS_INFO[] rgAffectedApps,
        ref uint lpdwRebootReasons);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmEndSession(uint pSessionHandle);
}
'@ -ErrorAction Stop
    }

    if (-not (Test-Path -LiteralPath $Target -PathType Container)) {
        Write-Line 'Target directory does not exist; Restart Manager file query skipped.'
    } else {
        $files = @()
        try {
            $files = @(Get-ChildItem -LiteralPath $Target -File -Recurse -Force -ErrorAction SilentlyContinue |
                Select-Object -First 1000 -ExpandProperty FullName)
        } catch {
            Write-Line ('File enumeration for Restart Manager failed: {0}' -f $_.Exception.Message)
        }

        Write-Line ('Files registered for lock query: {0} (max 1000)' -f $files.Count)

        if ($files.Count -gt 0) {
            $session = [uint32]0
            $key = New-Object System.Text.StringBuilder 64
            $rc = [RestartManagerNative]::RmStartSession([ref]$session, 0, $key)
            if ($rc -ne 0) {
                Write-Line ('RmStartSession failed: rc={0}' -f $rc)
            } else {
                try {
                    $rc = [RestartManagerNative]::RmRegisterResources($session, [uint32]$files.Count, [string[]]$files, 0, $null, 0, $null)
                    if ($rc -ne 0) {
                        Write-Line ('RmRegisterResources failed: rc={0}' -f $rc)
                    } else {
                        [uint32]$needed = 0
                        [uint32]$count = 0
                        [uint32]$rebootReasons = 0
                        $rc = [RestartManagerNative]::RmGetList($session, [ref]$needed, [ref]$count, $null, [ref]$rebootReasons)
                        if ($rc -eq 234 -and $needed -gt 0) {
                            $infos = New-Object RM_PROCESS_INFO[] $needed
                            $count = $needed
                            $rc = [RestartManagerNative]::RmGetList($session, [ref]$needed, [ref]$count, $infos, [ref]$rebootReasons)
                            if ($rc -eq 0) {
                                for ($i = 0; $i -lt $count; $i++) {
                                    $info = $infos[$i]
                                    $pidValue = $info.Process.dwProcessId
                                    Write-Line ('LOCK CANDIDATE: PID={0} AppName={1} Service={2} Type={3} Restartable={4}' -f $pidValue, $info.strAppName, $info.strServiceShortName, $info.ApplicationType, $info.bRestartable)
                                    try {
                                        $wmi = Get-CimInstance Win32_Process -Filter ('ProcessId={0}' -f $pidValue) -ErrorAction Stop
                                        Write-Line ('  PPID={0}' -f $wmi.ParentProcessId)
                                        Write-Line ('  ExecutablePath={0}' -f $wmi.ExecutablePath)
                                        Write-Line ('  CommandLine={0}' -f $wmi.CommandLine)
                                    } catch {
                                        try {
                                            $p = Get-Process -Id $pidValue -ErrorAction Stop
                                            Write-Line ('  ProcessName={0}' -f $p.ProcessName)
                                            Write-Line ('  Path={0}' -f $p.Path)
                                        } catch {
                                            Write-Line ('  Process detail unavailable: {0}' -f $_.Exception.Message)
                                        }
                                    }
                                }
                            } else {
                                Write-Line ('RmGetList(second call) failed: rc={0}' -f $rc)
                            }
                        } elseif ($rc -eq 0 -and $needed -eq 0) {
                            Write-Line 'Restart Manager found no process using the sampled files.'
                        } else {
                            Write-Line ('Restart Manager query did not return a usable lock list. rc={0}, needed={1}' -f $rc, $needed)
                        }
                    }
                } finally {
                    [void][RestartManagerNative]::RmEndSession($session)
                }
            }
        } else {
            Write-Line 'No files were available to register with Restart Manager.'
        }
    }
} catch {
    Write-Line ('Restart Manager diagnostic FAILED: {0}: {1}' -f $_.Exception.GetType().FullName, $_.Exception.Message)
}

Write-Section 'OPTIONAL SYSINTERNALS HANDLE'
try {
    $handle = Get-Command handle64.exe, handle.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $handle) {
        Write-Line 'handle.exe/handle64.exe not found in PATH. This is optional; no download is required for the rest of the report.'
    } else {
        Write-Line ('Using: {0}' -f $handle.Source)
        (& $handle.Source -accepteula -nobanner $Target 2>&1 | Out-String).TrimEnd() | Out-File -LiteralPath $OutputPath -Append -Encoding UTF8
    }
} catch {
    Write-Line ('Handle diagnostic failed: {0}' -f $_.Exception.Message)
}

Write-Section 'FILE SYSTEM FILTER DRIVERS'
try {
    (& fltmc.exe filters 2>&1 | Out-String).TrimEnd() | Out-File -LiteralPath $OutputPath -Append -Encoding UTF8
} catch {
    Write-Line ('fltmc failed: {0}' -f $_.Exception.Message)
}

Write-Section 'SECURITY / ENCRYPTION / DLP / EDR SERVICE CANDIDATES'
try {
    $securityPattern = '(?i)(encrypt|encryption|crypto|dlp|edr|endpoint|protect|protection|security|defender|antivirus|antimalware|safeguard|secure|filter|monitor)'
    $services = @(Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object {
        ($_.Name -match $securityPattern) -or ($_.DisplayName -match $securityPattern) -or ($_.PathName -match $securityPattern)
    })
    if ($services.Count -eq 0) {
        Write-Line 'No obvious service names matched the generic security/encryption keyword filter.'
    } else {
        foreach ($svc in $services | Sort-Object Name) {
            Write-Line ('Service={0} | DisplayName={1} | State={2} | StartMode={3}' -f $svc.Name, $svc.DisplayName, $svc.State, $svc.StartMode)
            Write-Line ('  PathName={0}' -f $svc.PathName)
        }
    }
} catch {
    Write-Line ('Service inventory failed: {0}' -f $_.Exception.Message)
}

Write-Section 'NOTES'
Write-Line '1. A Restart Manager result with no process does NOT prove that no lock exists; directory handles and filter drivers may still block rename/move.'
Write-Line '2. fltmc output is especially useful on company-managed machines because transparent encryption/DLP/EDR commonly uses filesystem minifilters.'
Write-Line '3. Do not disable or bypass a company security product based on this report. If a company filter/policy is the blocker, ask the IT/security administrator whether this directory operation is permitted.'
Write-Line '4. Before posting this report publicly, review it for company names, usernames, paths, command lines, or other information that should be redacted.'
Write-Line ('Report written to: {0}' -f $OutputPath)

Write-Host ''
Write-Host ('Diagnosis complete: {0}' -f $OutputPath)
Write-Host 'Review/redact the TXT before posting it publicly.'
