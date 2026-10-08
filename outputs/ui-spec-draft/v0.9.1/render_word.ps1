$ErrorActionPreference = 'Stop'
$taskRoot = 'C:\Users\smin\Documents\vestigia-ui-wireframe'
$inputDoc = Join-Path $taskRoot 'docs\VESTIGIA_전투_UI_명세서_초안_v0.9.1.docx'
$pdfOutput = Join-Path $taskRoot 'outputs\ui-spec-draft\v0.9.1\qa\render.pdf'
New-Item -ItemType Directory -Force (Split-Path $pdfOutput) | Out-Null
$wordApp = New-Object -ComObject Word.Application
$wordApp.Visible = $false
$wordApp.DisplayAlerts = 0
try {
    $wordDoc = $wordApp.Documents.Open($inputDoc, $false, $true)
    $wordDoc.ExportAsFixedFormat($pdfOutput, 17)
    $wordDoc.Close(0)
    Write-Output $pdfOutput
} finally {
    $wordApp.Quit()
}
