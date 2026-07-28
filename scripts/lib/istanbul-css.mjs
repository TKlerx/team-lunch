// Istanbul's base.css, embedded verbatim so generated reports are self-contained
// and pixel-match the coverage report without external asset references.
// Shared by complexity-report.mjs and test-timing-report.mjs.
export const ISTANBUL_BASE_CSS = `
body, html { margin:0; padding: 0; height: 100%; }
body { font-family: Helvetica Neue, Helvetica, Arial; font-size: 14px; color:#333; }
.small { font-size: 12px; }
*, *:after, *:before { box-sizing:border-box; }
h1 { font-size: 20px; margin: 0;}
h2 { font-size: 14px; }
a { color:#0074D9; text-decoration:none; }
a:hover { text-decoration:underline; }
.strong { font-weight: bold; }
.space-top1 { padding: 10px 0 0 0; }
.pad1y { padding: 10px 0; }
.pad2 { padding: 20px; }
.pad1 { padding: 10px; }
.space-right2 { padding-right:20px; }
.center { text-align:center; }
.clearfix { display:block; }
.clearfix:after { content:''; display:block; height:0; clear:both; visibility:hidden; }
.fl { float: left; }
.quiet { color: #7f7f7f; color: rgba(0,0,0,0.5); }
.quiet a { opacity: 0.7; }
.fraction { font-family: Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 10px; color: #555; background: #E8E8E8; padding: 4px 5px; border-radius: 3px; vertical-align: middle; }
.coverage-summary { border-collapse: collapse; width: 100%; }
.coverage-summary tr { border-bottom: 1px solid #bbb; }
.coverage-summary td, .coverage-summary th { padding: 10px; }
.coverage-summary tbody { border: 1px solid #bbb; }
.coverage-summary td { border-right: 1px solid #bbb; }
.coverage-summary td:last-child { border-right: none; }
.coverage-summary th { text-align: left; font-weight: normal; white-space: nowrap; }
.coverage-summary th.file { border-right: none !important; }
.coverage-summary th.pic, .coverage-summary th.abs, .coverage-summary td.pct, .coverage-summary td.abs { text-align: right; }
.coverage-summary td.file { white-space: nowrap; }
.coverage-summary td.pic { min-width: 120px !important; }
.status-line { height: 10px; }
.red.solid, .status-line.low, .low .cover-fill { background:#C21F39 }
.low .chart { border:1px solid #C21F39 }
.low { background:#FCE1E5 }
.high { background:rgb(230,245,208) }
.status-line.high, .high .cover-fill { background:rgb(77,146,33) }
.high .chart { border:1px solid rgb(77,146,33) }
.status-line.medium, .medium .cover-fill { background: #f9cd0b; }
.medium .chart { border:1px solid #f9cd0b; }
.medium { background: #fff4c2; }
.cover-fill, .cover-empty { display:inline-block; height: 12px; }
.chart { line-height: 0; }
.cover-empty { background: white; }
.cover-full { border-right: none !important; }
.wrapper { min-height: 100%; height: auto !important; height: 100%; margin: 0 auto -48px; }
.footer, .push { height: 48px; }
`;
