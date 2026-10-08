$ErrorActionPreference = 'Stop'
$specWord = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
try {
    foreach ($specDoc in $specWord.Documents) {
        if ($specDoc.FullName -like '*vestigia-ui-wireframe*') {
            [pscustomobject]@{Name=$specDoc.Name; Saved=$specDoc.Saved; ReadOnly=$specDoc.ReadOnly} | ConvertTo-Json -Compress
        }
    }
} finally {
    [Runtime.InteropServices.Marshal]::ReleaseComObject($specWord) | Out-Null
}
