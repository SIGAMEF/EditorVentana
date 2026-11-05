# Crea la version portable: dist\EditorVentana\ y dist\EditorVentana-portable.zip
# Uso:  powershell -ExecutionPolicy Bypass -File empaquetar\construir.ps1
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
Set-Location $raiz
$py = Join-Path $raiz '.venv-motor\Scripts\python.exe'
& $py -m pip install --disable-pip-version-check -q pyinstaller
& $py -m PyInstaller --noconfirm --clean --onedir --console --name EditorVentana `
    --version-file empaquetar\version_info.txt `
    --collect-all rembg --collect-all onnxruntime --collect-all pymatting `
    --collect-submodules skimage --collect-data skimage `
    --distpath dist --workpath build motor.py
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller fallo' }
$dest = Join-Path $raiz 'dist\EditorVentana'
# PyInstaller puede recoger un MSVCP140.dll antiguo (v14.20) de alguna libreria y onnxruntime
# se cierra con 0xc0000005 al cargar el modelo. Se usan las DLL del runtime de VC++ del sistema si son mas nuevas.
$interno = Join-Path $dest '_internal'
Get-ChildItem $interno -File | Where-Object { $_.Name -match '^(msvcp140|vcruntime140|concrt140)' } | ForEach-Object {
    $sis = Join-Path $env:WINDIR ('System32\' + $_.Name)
    if ((Test-Path $sis) -and ([version](Get-Item $sis).VersionInfo.ProductVersion -gt [version]$_.VersionInfo.ProductVersion)) {
        Copy-Item $sis $_.FullName -Force
        Write-Host "Actualizado $($_.Name) a $((Get-Item $sis).VersionInfo.ProductVersion)"
    }
}
Copy-Item editor-prototipos.html $dest -Force
Copy-Item empaquetar\LEEME.txt $dest -Force
$modelo = Join-Path $raiz 'modelos\models\u2net\u2net.onnx'
if (Test-Path $modelo) {
    New-Item -ItemType Directory -Force (Join-Path $dest 'modelos\models\u2net') | Out-Null
    Copy-Item $modelo (Join-Path $dest 'modelos\models\u2net') -Force
}
$zip = Join-Path $raiz 'dist\EditorVentana-portable.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $dest -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Listo: $zip"
