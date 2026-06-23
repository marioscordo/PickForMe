$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$files = @(
  ".\package.json",
  ".\apps\api\package.json",
  ".\apps\api\tsconfig.json",
  ".\apps\mobile\package.json",
  ".\apps\mobile\tsconfig.json",
  ".\apps\mobile\app.json"
)

foreach ($file in $files) {
  if (Test-Path $file) {
    $text = [System.IO.File]::ReadAllText((Resolve-Path $file))
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
      $text = $text.Substring(1)
    }
    [System.IO.File]::WriteAllText((Resolve-Path $file), $text, $utf8NoBom)
    Write-Host "OK ohne BOM:" $file
  }
}
