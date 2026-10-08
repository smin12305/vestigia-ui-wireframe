$ErrorActionPreference = 'Stop'
$specInput = 'C:\Users\smin\Documents\vestigia-ui-wireframe\outputs\ui-spec-draft\v0.0.1\full-transfer\candidate.docx'
$specOutDir = 'C:\Users\smin\Documents\vestigia-ui-wireframe\outputs\ui-spec-draft\v0.0.1\full-transfer\render'
New-Item -ItemType Directory -Force -Path $specOutDir | Out-Null
$specPdf = Join-Path $specOutDir 'render.pdf'
$specWord = New-Object -ComObject Word.Application
$specWord.Visible = $false
$specWord.DisplayAlerts = 0
$specWord.AutomationSecurity = 3
$specDoc = $null
try {
    $specDoc = $specWord.Documents.Open($specInput, $false, $true)
    $specDoc.Repaginate()
    $specDoc.ExportAsFixedFormat($specPdf, 17)
    $specDoc.Close(0)
    $specDoc = $null
    Write-Output $specPdf
} finally {
    if ($null -ne $specDoc) { $specDoc.Close(0) }
    $specWord.Quit()
}
