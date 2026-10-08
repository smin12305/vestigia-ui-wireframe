$ErrorActionPreference = 'Stop'
$specTarget = 'C:\Users\smin\Documents\vestigia-ui-wireframe\docs\VESTIGIA_전투_UI_명세서_v0.0.1.docx'
$specManifestPath = 'C:\Users\smin\Documents\vestigia-ui-wireframe\outputs\ui-spec-draft\v0.0.1\full-transfer\transfer.json'
$specManifest = Get-Content -Raw -LiteralPath $specManifestPath -Encoding UTF8 | ConvertFrom-Json
$specWord = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
$specDoc = $null
$specClosed = $false
try {
    foreach ($specOpenDoc in $specWord.Documents) {
        if ([string]::Equals($specOpenDoc.FullName, $specTarget, [StringComparison]::OrdinalIgnoreCase)) {
            $specDoc = $specOpenDoc
            break
        }
    }
    if ($null -eq $specDoc) { throw 'Expected open document was not found.' }
    if (-not $specDoc.Saved) { throw 'The document has unsaved changes. Do not close or overwrite.' }
    $specDoc.Close(0)
    $specClosed = $true
    [Runtime.InteropServices.Marshal]::ReleaseComObject($specDoc) | Out-Null
    $specDoc = $null
    & 'C:\Users\smin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'C:\Users\smin\Documents\vestigia-ui-wireframe\outputs\ui-spec-draft\v0.0.1\full-transfer\build_full.py' --commit
    if ($LASTEXITCODE -ne 0) { throw 'Document replacement failed.' }
    if ((Get-FileHash -LiteralPath $specTarget -Algorithm SHA256).Hash.ToLowerInvariant() -ne $specManifest.candidate_sha256) { throw 'Saved document hash does not match the reviewed candidate.' }
    Write-Output 'Reviewed document saved successfully.'
} finally {
    if ($specClosed) {
        $specReopened = $specWord.Documents.Open($specTarget)
        [Runtime.InteropServices.Marshal]::ReleaseComObject($specReopened) | Out-Null
    }
    if ($null -ne $specDoc) { [Runtime.InteropServices.Marshal]::ReleaseComObject($specDoc) | Out-Null }
    [Runtime.InteropServices.Marshal]::ReleaseComObject($specWord) | Out-Null
}
