Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 1440,960
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#F7F9FC'))
function Brush($hex) { New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex)) }
$ink = Brush '#18243B'
$muted = Brush '#56647A'
$blue = Brush '#D8E9FF'
$selected = Brush '#8AB9FF'
$orange = Brush '#FFCE8A'
$hero = Brush '#245ABD'
$white = Brush '#FFFFFF'
$line = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#D3DAE5')),1
$fTitle = New-Object System.Drawing.Font 'Malgun Gothic',28,([System.Drawing.FontStyle]::Bold)
$fHead = New-Object System.Drawing.Font 'Malgun Gothic',20,([System.Drawing.FontStyle]::Bold)
$fText = New-Object System.Drawing.Font 'Malgun Gothic',14
$format = New-Object System.Drawing.StringFormat
$format.Alignment = 'Center'
$format.LineAlignment = 'Center'
function Label($text,$x,$y,$w,$h,$font,$color) { $g.DrawString($text,$font,$color,([System.Drawing.RectangleF]::new($x,$y,$w,$h)),$format) }
Label '공격 실행 흐름' 30 18 1380 54 $fTitle $ink
Label '범위 모양은 설명용 예시입니다. 실제 범위는 콘텐츠 정의를 따릅니다.' 30 76 1380 30 $fText $muted
for($row=0;$row -lt 2;$row++){
 $top = 132 + $row*378
 $title = if($row -eq 0){'방향 선택형'}else{'자기 기준형'}
 Label $title 45 $top 1320 38 $fHead $ink
 for($stage=0;$stage -lt 3;$stage++){
  $left=60+$stage*465
  $heading = if($row -eq 0){@('1. 캐릭터 기준 4방향 표시','2. 방향 1개 선택','3. 선택 범위에 실행')[$stage]}else{@('1. 자신을 중심으로 범위 표시','2. 범위 확정','3. 해당 범위에 실행')[$stage]}
  Label $heading $left ($top+46) 390 35 $fText $ink
  $gx=$left+69; $gy=$top+95; $cell=42
  for($y=0;$y -lt 6;$y++){for($x=0;$x -lt 6;$x++){
    $active=$false
    if($row -eq 0){
      if($stage -eq 0){ $active=(($x -eq 2 -and $y -in @(1,2,4,5)) -or ($y -eq 3 -and $x -in @(0,1,3,4))) }
      else { $active=($y -eq 3 -and $x -in @(3,4)) }
    }else{ $active=($x -ge 1 -and $x -le 3 -and $y -ge 2 -and $y -le 4) }
    $fill=$white
    if($active){$fill=if($stage -eq 0){$blue}elseif($stage -eq 1){$selected}else{$orange}}
    $g.FillRectangle($fill,($gx+$x*$cell),($gy+$y*$cell),$cell,$cell)
    $g.DrawRectangle($line,($gx+$x*$cell),($gy+$y*$cell),$cell,$cell)
  }}
  $g.FillEllipse($hero,($gx+2*$cell+6),($gy+3*$cell+6),30,30)
  Label '나' ($gx+2*$cell) ($gy+3*$cell) $cell $cell $fText $white
  if($stage -lt 2){Label '→' ($left+385) ($top+192) 72 50 $fTitle $muted}
 }
}
Label '파랑: 표시·선택 범위     주황: 실행 범위     ●: 캐릭터' 30 898 1380 34 $fText $muted
$bmp.Save((Join-Path $PSScriptRoot '공격_실행_흐름.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
