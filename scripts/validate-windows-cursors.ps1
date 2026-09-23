[CmdletBinding()]
param(
    [string]$CursorDirectory = (Join-Path $PSScriptRoot '..\desktop-cursors')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Native cursor validation requires Windows.'
}
if (-not (Test-Path -LiteralPath $CursorDirectory -PathType Container)) {
    throw "Cursor directory does not exist: $CursorDirectory"
}

# Read-only validation. These APIs only load files into this process and inspect
# their bitmap data. No system pointer, registry, or user preference is changed.
if (-not ('RemiMagic.CursorValidation' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace RemiMagic
{
    public sealed class CursorReport
    {
        public string File { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public uint HotspotX { get; set; }
        public uint HotspotY { get; set; }
        public int BitsPerPixel { get; set; }
    }

    public static class CursorValidation
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct ICONINFO
        {
            [MarshalAs(UnmanagedType.Bool)] public bool fIcon;
            public uint xHotspot;
            public uint yHotspot;
            public IntPtr hbmMask;
            public IntPtr hbmColor;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct BITMAP
        {
            public int bmType;
            public int bmWidth;
            public int bmHeight;
            public int bmWidthBytes;
            public ushort bmPlanes;
            public ushort bmBitsPixel;
            public IntPtr bmBits;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        private static extern IntPtr LoadCursorFromFileW(string path);

        [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetIconInfo(IntPtr cursor, out ICONINFO info);

        [DllImport("gdi32.dll", ExactSpelling = true, SetLastError = true)]
        private static extern int GetObjectW(IntPtr handle, int size, out BITMAP bitmap);

        [DllImport("gdi32.dll", ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeleteObject(IntPtr handle);

        public static CursorReport Inspect(string path)
        {
            // LoadCursorFromFileW returns a SHARED cursor. Microsoft's ownership
            // rules prohibit DestroyCursor for this handle; the process owns its
            // lifetime. GetIconInfo's bitmap copies must be explicitly released.
            // https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-destroycursor
            IntPtr cursor = LoadCursorFromFileW(path);
            if (cursor == IntPtr.Zero)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "LoadCursorFromFileW failed: " + path);

            ICONINFO info = new ICONINFO();
            try
            {
                if (!GetIconInfo(cursor, out info))
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "GetIconInfo failed: " + path);
                if (info.fIcon)
                    throw new InvalidOperationException("Windows loaded an icon instead of a cursor: " + path);

                bool monochrome = info.hbmColor == IntPtr.Zero;
                IntPtr bitmapHandle = monochrome ? info.hbmMask : info.hbmColor;
                BITMAP bitmap;
                if (bitmapHandle == IntPtr.Zero ||
                    GetObjectW(bitmapHandle, Marshal.SizeOf(typeof(BITMAP)), out bitmap) == 0)
                    throw new InvalidOperationException("GetObjectW could not read the cursor bitmap: " + path);

                int width = bitmap.bmWidth;
                // A monochrome mask contains the AND and XOR planes stacked.
                int height = Math.Abs(bitmap.bmHeight) / (monochrome ? 2 : 1);
                if (width <= 0 || height <= 0 || info.xHotspot >= width || info.yHotspot >= height)
                    throw new InvalidOperationException("Windows returned invalid dimensions or hotspot: " + path);

                return new CursorReport {
                    File = path,
                    Width = width,
                    Height = height,
                    HotspotX = info.xHotspot,
                    HotspotY = info.yHotspot,
                    BitsPerPixel = bitmap.bmPlanes * bitmap.bmBitsPixel
                };
            }
            finally
            {
                // GetIconInfo creates these bitmap copies, including for a
                // shared cursor. Delete both on success and on error.
                if (info.hbmColor != IntPtr.Zero) DeleteObject(info.hbmColor);
                if (info.hbmMask != IntPtr.Zero && info.hbmMask != info.hbmColor) DeleteObject(info.hbmMask);
            }
        }
    }
}
'@
}

$cursorFiles = @(Get-ChildItem -LiteralPath $CursorDirectory -File -Recurse |
    Where-Object { $_.Extension -in '.ani', '.cur' } |
    Sort-Object FullName)
if ($cursorFiles.Count -eq 0) {
    throw "No .ani or .cur files were found in: $CursorDirectory"
}

$validationResults = foreach ($cursorFile in $cursorFiles) {
    [RemiMagic.CursorValidation]::Inspect($cursorFile.FullName)
}
$validationResults | Select-Object @{ Name = 'File'; Expression = { Split-Path $_.File -Leaf } },
    Width, Height, HotspotX, HotspotY, BitsPerPixel | Format-Table -AutoSize
Write-Output ("Windows successfully loaded {0} cursor files. System pointer settings were not changed." -f $cursorFiles.Count)
