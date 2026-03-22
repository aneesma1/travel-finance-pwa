[xml]$docx = Get-Content '.\temp_docx\word\document.xml' -Raw
$ns = New-Object Xml.XmlNamespaceManager($docx.NameTable)
$ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
$nodes = $docx.SelectNodes('//w:t', $ns)
$text = ''
foreach ($node in $nodes) {
    if ($node.'#text') {
        $text += $node.'#text' + " "
    }
}
$text | Out-File -Encoding utf8 '.\temp_docx\extracted.txt'
