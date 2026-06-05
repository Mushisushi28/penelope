/**
 * Windows DPAPI secret store.
 *
 * Uses the `cmdkey` CLI to store/retrieve credentials in the Windows Credential
 * Manager, which is backed by DPAPI (user-scoped encryption).
 *
 * cmdkey /add:<target> /user:<user> /pass:<password>
 * cmdkey /delete:<target>
 * cmdkey /list:<target>   (presence check)
 *
 * Values are stored as the "password" of a generic Windows credential entry.
 * The "user" field holds the SecretRef.key so we can reconstruct refs on list().
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SecretRef, SecretStore, StoreCapabilities, SERVICE_NAME } from './types.js';

const execFileAsync = promisify(execFile);

function targetName(ref: SecretRef): string {
  return `${SERVICE_NAME}/${ref.tenantId}/${ref.key}`;
}

function tenantPrefix(tenantId: string): string {
  return `${SERVICE_NAME}/${tenantId}/`;
}

export class DpapiStore implements SecretStore {
  capabilities(): StoreCapabilities {
    return {
      persistent: true,
      encryptedAtRest: true,
      backend: 'dpapi',
    };
  }

  async available(): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    try {
      await execFileAsync('cmdkey', ['/list'], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async set(ref: SecretRef, value: string): Promise<void> {
    const target = targetName(ref);
    await execFileAsync('cmdkey', [
      `/add:${target}`,
      `/user:${ref.key}`,
      `/pass:${value}`,
    ]);
  }

  async get(ref: SecretRef): Promise<string | undefined> {
    // cmdkey cannot read back credential values — use PowerShell to retrieve
    // via CredRead (Windows Credentials API).
    try {
      const target = targetName(ref);
      const script = `
$target = '${target.replace(/'/g, "''")}';
$cred = [System.Net.CredentialCache]::DefaultNetworkCredentials;
Add-Type -AssemblyName System.Security;
$cm = New-Object System.Net.NetworkCredential;
$wc = [System.Net.CredentialCache]::GetDefaultNetworkCredentials($target, 'cmdkey', $null);
# Use Windows Credential Manager COM
$t = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory();
Add-Type -MemberDefinition @'
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr credential);
'@ -Name CredAPI -Namespace Win32;
$ptr = [IntPtr]::Zero;
if ([Win32.CredAPI]::CredRead($target, 1, 0, [ref]$ptr)) {
  $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [System.Type]::GetType('System.Object'));
  # Parse CREDENTIAL struct manually
  $bytes = New-Object byte[] 128;
  $offset = [System.Runtime.InteropServices.Marshal]::SizeOf([int]) * 6 + [System.IntPtr]::Size * 4;
  $cbBlob = [System.Runtime.InteropServices.Marshal]::ReadInt32($ptr, $offset);
  $blobPtr = [System.Runtime.InteropServices.Marshal]::ReadIntPtr($ptr, $offset + 8);
  [System.Runtime.InteropServices.Marshal]::Copy($blobPtr, $bytes, 0, $cbBlob);
  [Win32.CredAPI]::CredFree($ptr);
  [System.Text.Encoding]::Unicode.GetString($bytes, 0, $cbBlob);
} else { exit 1 }
`.trim();

      // Simpler: use PowerShell Get-StoredCredential-equivalent via .NET
      const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredMgr {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  internal struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName;
    public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)]
  static extern bool CredRead(string target,uint type,uint flags,out IntPtr cred);
  [DllImport("advapi32.dll")]
  static extern void CredFree(IntPtr cred);
  public static string Read(string target) {
    IntPtr ptr=IntPtr.Zero;
    if(!CredRead(target,1,0,out ptr)) return null;
    try {
      var c=(CREDENTIAL)Marshal.PtrToStructure(ptr,typeof(CREDENTIAL));
      if(c.CredentialBlobSize==0) return "";
      var buf=new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob,buf,0,(int)c.CredentialBlobSize);
      return Encoding.Unicode.GetString(buf);
    } finally { CredFree(ptr); }
  }
}
"@
$v=[CredMgr]::Read('${target.replace(/'/g, "''")}')
if($null -eq $v){exit 1} else {Write-Output $v}
`.trim();

      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        timeout: 10000,
      });
      const val = stdout.trim();
      return val === '' ? undefined : val;
    } catch {
      return undefined;
    }
  }

  async delete(ref: SecretRef): Promise<void> {
    try {
      await execFileAsync('cmdkey', [`/delete:${targetName(ref)}`]);
    } catch {
      // Not found — ignore
    }
  }

  async list(tenantId: string): Promise<SecretRef[]> {
    try {
      const { stdout } = await execFileAsync('cmdkey', ['/list'], { timeout: 5000 });
      const prefix = tenantPrefix(tenantId);
      const refs: SecretRef[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/Target:\s*(\S+)/);
        if (m && m[1].startsWith(prefix)) {
          const key = m[1].slice(prefix.length);
          refs.push({ tenantId, key });
        }
      }
      return refs;
    } catch {
      return [];
    }
  }
}
