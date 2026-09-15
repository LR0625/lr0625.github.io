# Windows 系统 OCR 封装（供素材审计使用）
# 必须用 Windows PowerShell 5.1 运行：powershell.exe -File ocr.ps1 -Path <img>
# PowerShell 7 没有 WinRT 投影，无法加载 Windows.Media.Ocr。

param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$MaxWidth = 1800,
  [switch]$WithBoxes
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

# PowerShell 不会自动注册 WinRT 投影类型，必须显式求值一次
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

# ---- WinRT 异步转同步 ----
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($op, $type) {
  $asTask = $asTaskGeneric.MakeGenericMethod($type)
  $t = $asTask.Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

# ---- 需要时先缩放，OCR 引擎对超大图不友好 ----
$src = [System.Drawing.Image]::FromFile($Path)
$tmp = $null
if ($src.Width -gt $MaxWidth) {
  $scale = $MaxWidth / $src.Width
  $nw = [int]($src.Width * $scale)
  $nh = [int]($src.Height * $scale)
  $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $nw, $nh)
  $g.Dispose()
  $tmp = Join-Path $env:TEMP ("ocr_" + [guid]::NewGuid().ToString('N') + ".png")
  $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $ocrPath = $tmp
  Write-Output "SCALED: $($src.Width)x$($src.Height) -> ${nw}x${nh}"
}
else {
  $ocrPath = (Resolve-Path $Path).Path
}
$srcW = $src.Width
$src.Dispose()

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ocrPath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$lang = New-Object Windows.Globalization.Language 'zh-Hans-CN'
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) { throw "无法创建 zh-Hans-CN OCR 引擎" }

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

Write-Output "=== LINES ==="
foreach ($line in $result.Lines) {
  if ($WithBoxes) {
    $top = ($line.Words | ForEach-Object { $_.BoundingRect.Top } | Measure-Object -Minimum).Minimum
    $left = ($line.Words | ForEach-Object { $_.BoundingRect.Left } | Measure-Object -Minimum).Minimum
    Write-Output ("[{0,6:N0},{1,6:N0}] {2}" -f $left, $top, $line.Text)
  }
  else {
    Write-Output $line.Text
  }
}

$stream.Dispose()
if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Force }
