$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = Get-ChildItem -Path . -Recurse -File -Include *.json |
  Where-Object {
    $_.FullName -notmatch "\\node_modules\\" -and
    $_.FullName -notmatch "\\.next\\" -and
    $_.FullName -notmatch "\\.expo\\"
  }

foreach ($file in $files) {
  $text = [System.IO.File]::ReadAllText($file.FullName)

  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
    $text = $text.Substring(1)
    Write-Host "BOM entfernt:" $file.FullName
  } else {
    Write-Host "OK:" $file.FullName
  }

  [System.IO.File]::WriteAllText($file.FullName, $text, $utf8NoBom)
}

Write-Host ""
Write-Host "JSON-BOM-Bereinigung abgeschlossen."
